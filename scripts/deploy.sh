#!/usr/bin/env bash
# Know Your World — production deploy script
# Usage:
#   ./scripts/deploy.sh                # full deploy
#   ./scripts/deploy.sh --check        # verify prerequisites only
#   ./scripts/deploy.sh --migrate-only # run D1 migrations only
#   ./scripts/deploy.sh --smoke-only   # run smoke tests against current deploy
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${CYAN}[$(date +%H:%M:%S)]${NC} $*"; }
ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC} $*"; }
err()  { echo -e "${RED}✗${NC} $*" >&2; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT/worker"

MODE="full"
case "${1:-}" in
  --check)         MODE="check" ;;
  --migrate-only)  MODE="migrate" ;;
  --smoke-only)    MODE="smoke" ;;
  -h|--help)
    grep '^#' "$0" | sed 's/^# \{0,1\}//' | head -20
    exit 0
    ;;
esac

WORKER_URL="${WORKER_URL:-https://know-your-world-api.morphylee22.workers.dev}"

goto_smoke=0
if [ "$MODE" = "smoke" ]; then
  log "Smoke-only mode — testing against $WORKER_URL"
  goto_smoke=1
fi

# 1. Verify wrangler auth
if [ "$goto_smoke" -eq 0 ]; then
  log "Verifying wrangler authentication..."
  if [ -n "${CLOUDFLARE_API_TOKEN:-}" ]; then
    # Run whoami and look for actual failure markers (not the version-warning "ERROR")
    whoami_output=$(npx wrangler whoami 2>&1 || true)
    if echo "$whoami_output" | grep -qi "Invalid access token\|Too many authentication failures\|not authenticated\|Authentication error\|⛔"; then
      err "CLOUDFLARE_API_TOKEN is set but invalid:"
      echo "$whoami_output" | grep -E "Invalid|failures|Authentication" | head -3
      exit 1
    fi
    # Also confirm we see the "logged in" / "Account" success marker
    if ! echo "$whoami_output" | grep -qi "logged in\|Account ID\|Account Name"; then
      err "CLOUDFLARE_API_TOKEN didn't return a valid account:"
      echo "$whoami_output" | tail -10
      exit 1
    fi
    ok "CLOUDFLARE_API_TOKEN is set and valid"
  else
    if ! npx wrangler whoami 2>&1 | grep -qi "logged in\|Account ID\|account id"; then
      err "Wrangler is not authenticated."
      echo "  Run: npx wrangler login  OR  CLOUDFLARE_API_TOKEN=xxx ./scripts/deploy.sh"
      exit 1
    fi
    ok "Wrangler is authenticated (interactive login)"
  fi
fi

# 2. Verify wrangler.toml has SUPABASE_URL
if [ "$goto_smoke" -eq 0 ]; then
  log "Verifying wrangler.toml..."
  if ! grep -q '^SUPABASE_URL' wrangler.toml; then
    err "wrangler.toml is missing SUPABASE_URL (required for JWT verification)"
    exit 1
  fi
  ok "wrangler.toml has SUPABASE_URL"
fi

# 3. Typecheck
if [ "$goto_smoke" -eq 0 ]; then
  log "Typechecking worker..."
  if ! npx tsc --noEmit; then
    err "Worker typecheck failed"
    exit 1
  fi
  ok "Worker typecheck clean"
fi

if [ "$MODE" = "check" ]; then
  log "Prerequisites OK (--check mode, skipping migrations and deploy)"
  goto_smoke=1
fi

# 4. D1 schema migration
if [ "$goto_smoke" -eq 0 ]; then
  log "Running D1 schema migration (idempotent)..."
  if ! npx wrangler d1 execute know-your-world-db --remote --file=./schema.sql; then
    err "Schema migration failed"
    exit 2
  fi
  ok "Schema migration complete"

  # 5. Additive migrations
  log "Running additive migrations..."
  for f in migrations/*.sql; do
    log "  Applying $(basename "$f")..."
    npx wrangler d1 execute know-your-world-db --remote --file="$f" 2>&1 \
      | grep -v 'duplicate column name' || true
  done
  ok "Additive migrations complete"
fi

if [ "$MODE" = "migrate" ]; then
  log "Migrations complete (--migrate-only mode)"
  exit 0
fi

# 6. Deploy
if [ "$goto_smoke" -eq 0 ]; then
  log "Deploying worker to Cloudflare..."
  if ! npx wrangler deploy; then
    err "Worker deploy failed"
    exit 3
  fi
  ok "Worker deployed"
fi

# 7. Smoke tests
log "Running smoke tests against $WORKER_URL ..."
smoke_failures=0

# [1/5] healthz
log "  [1/5] GET /api/healthz ..."
healthz_resp=$(curl -sS -m 10 -w "\n%{http_code}" "$WORKER_URL/api/healthz" 2>&1 || true)
healthz_code=$(echo "$healthz_resp" | tail -1)
healthz_body=$(echo "$healthz_resp" | head -1)
if [ "$healthz_code" = "200" ] && echo "$healthz_body" | grep -q '"status":"ok"'; then
  ok "  [1/5] healthz OK"
else
  err "  [1/5] healthz FAILED — HTTP $healthz_code: $healthz_body"
  smoke_failures=$((smoke_failures + 1))
fi

# [2/5] /api/scores rejects unauthenticated (C1 fix)
log "  [2/5] POST /api/scores (no auth) — expecting 401 ..."
scores_resp=$(curl -sS -m 10 -o /dev/null -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d '{"name":"test","continent":"africa","category":"capitals","level":"easy","score":1,"total":8,"timeMs":1000,"passed":false}' \
  "$WORKER_URL/api/scores" 2>&1 || true)
if [ "$scores_resp" = "401" ]; then
  ok "  [2/5] /api/scores rejects unauthenticated (401)"
else
  err "  [2/5] /api/scores should return 401, got HTTP $scores_resp"
  smoke_failures=$((smoke_failures + 1))
fi

# [3/5] /api/auth/check rejects missing JWT
log "  [3/5] POST /api/auth/check (no auth) — expecting 401 ..."
auth_resp=$(curl -sS -m 10 -o /dev/null -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" -d '{}' \
  "$WORKER_URL/api/auth/check" 2>&1 || true)
if [ "$auth_resp" = "401" ]; then
  ok "  [3/5] /api/auth/check rejects unauthenticated (401)"
else
  err "  [3/5] /api/auth/check should return 401, got HTTP $auth_resp"
  smoke_failures=$((smoke_failures + 1))
fi

# [4/5] HSTS header present
log "  [4/5] HSTS header check ..."
hsts_header=$(curl -sSI -m 10 "$WORKER_URL/api/healthz" 2>&1 | grep -i "^strict-transport-security" || true)
if [ -n "$hsts_header" ]; then
  ok "  [4/5] HSTS header present"
else
  err "  [4/5] HSTS header missing"
  smoke_failures=$((smoke_failures + 1))
fi

# [5/5] X-Request-Id header present
log "  [5/5] X-Request-Id header check ..."
reqid_header=$(curl -sSI -m 10 "$WORKER_URL/api/healthz" 2>&1 | grep -i "^x-request-id" || true)
if [ -n "$reqid_header" ]; then
  ok "  [5/5] X-Request-Id header present"
else
  err "  [5/5] X-Request-Id header missing"
  smoke_failures=$((smoke_failures + 1))
fi

if [ "$smoke_failures" -gt 0 ]; then
  err "Smoke tests: $smoke_failures of 5 failed."
  if [ "$MODE" = "check" ] || [ "$MODE" = "smoke" ]; then
    exit 4
  fi
  warn "Continuing despite smoke failures."
else
  ok "All 5 smoke tests passed."
fi

if [ "$MODE" = "smoke" ] || [ "$MODE" = "check" ]; then
  exit 0
fi

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Worker deployed. Complete the remaining steps manually:${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "[Vercel — frontend]"
echo "  Set in Vercel → Project Settings → Environment Variables:"
echo "    VITE_API_BASE          = $WORKER_URL"
echo "    VITE_SUPABASE_URL      = https://cwwhyufeviblebpoigqn.supabase.co"
echo "    VITE_SUPABASE_ANON_KEY = sb_publishable_..."
echo "    VITE_TURNSTILE_SITEKEY = 0x4AAAAAA..."
echo "  Then push to main or Redeploy."
echo ""
echo "[Supabase — RLS]"
echo "  Verify RLS is enabled on every table (Dashboard → Auth → Policies)."
echo ""
echo "[Supabase — SMTP]"
echo "  Verify email templates + sender (Dashboard → Auth → Email Templates)."
echo "  Default rate limit is 3 emails/hour/IP — configure custom SMTP for higher."
echo ""
