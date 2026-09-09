#!/usr/bin/env bash
# Know Your World — operator verification script
# Checks Vercel env vars (via bundle), Supabase Auth/JWKS reachability,
# Worker health, and C1/C5 fix liveness.
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${CYAN}[$(date +%H:%M:%S)]${NC} $*"; }
ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC} $*"; }
err()  { echo -e "${RED}✗${NC} $*" >&2; }

FAIL_COUNT=0
FRONTEND_URL="${FRONTEND_URL:-https://know-your-world.vercel.app}"
WORKER_URL="${WORKER_URL:-https://know-your-world-api.morphylee22.workers.dev}"
SUPABASE_URL="${SUPABASE_URL:-https://cwwhyufeviblebpoigqn.supabase.co}"

# 1. Check Vercel env vars via the production JS bundle
log "Checking Vercel frontend env vars (via built bundle)..."
js_url=$(curl -sS -m 10 "$FRONTEND_URL" | grep -oE '/assets/index-[a-zA-Z0-9]+\.js' | head -1 || true)
if [ -z "$js_url" ]; then
  err "Couldn't find JS bundle URL on $FRONTEND_URL"
  FAIL_COUNT=$((FAIL_COUNT + 1))
else
  tmp_bundle="$(mktemp)"
  curl -sS -m 20 "$FRONTEND_URL$js_url" > "$tmp_bundle" || true
  if [ ! -s "$tmp_bundle" ]; then
    err "Couldn't fetch JS bundle from $FRONTEND_URL$js_url"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  else
    if grep -qF "$SUPABASE_URL" "$tmp_bundle"; then
      ok "VITE_SUPABASE_URL is set correctly"
    else
      err "VITE_SUPABASE_URL may be using DEV fallback — bundle doesn't contain $SUPABASE_URL"
      FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
    if grep -qF "$WORKER_URL" "$tmp_bundle"; then
      ok "VITE_API_BASE is set correctly"
    else
      err "VITE_API_BASE may be using DEV fallback — bundle doesn't contain $WORKER_URL"
      FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
    if grep -qF "0x4AAAAAA" "$tmp_bundle"; then
      ok "VITE_TURNSTILE_SITEKEY is set"
    else
      err "VITE_TURNSTILE_SITEKEY may be missing"
      FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
  fi
fi

# 2. Supabase Auth /health (with anon key from bundle)
log "Checking Supabase Auth reachability..."
if [ -n "${tmp_bundle:-}" ] && [ -f "$tmp_bundle" ]; then
  anon_key=$(grep -oE 'sb_publishable_[A-Za-z0-9_-]+' "$tmp_bundle" 2>/dev/null | head -1 || true)
  rm -f "$tmp_bundle"
else
  anon_key=""
fi
if [ -n "$anon_key" ]; then
  sup_healthz=$(curl -sS -m 10 -o /dev/null -w "%{http_code}" \
    -H "apikey: $anon_key" \
    "$SUPABASE_URL/auth/v1/health" 2>&1 || true)
  if [ "$sup_healthz" = "200" ]; then
    ok "Supabase Auth /health reachable (200, with anon key)"
  else
    err "Supabase Auth /health returned $sup_healthz with anon key"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
else
  warn "Couldn't extract Supabase anon key — skipping /health check"
fi

# 3. Supabase JWKS endpoint (required for Worker JWT verification)
log "Checking Supabase JWKS endpoint..."
sup_jwks=$(curl -sS -m 10 -o /dev/null -w "%{http_code}" "$SUPABASE_URL/auth/v1/.well-known/jwks.json" 2>&1 || true)
if [ "$sup_jwks" = "200" ]; then
  ok "Supabase JWKS endpoint reachable (Worker can verify JWTs)"
else
  err "Supabase JWKS returned $sup_jwks — Worker JWT verification will fail"
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

# 4. Worker health + C1/C5 fix liveness
log "Checking Worker..."
worker_healthz=$(curl -sS -m 10 "$WORKER_URL/api/healthz" 2>&1 || true)
if echo "$worker_healthz" | grep -q '"status":"ok"'; then
  ok "Worker /api/healthz OK"
else
  err "Worker /api/healthz returned: $worker_healthz"
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

# C1 check: /api/scores should reject unauthenticated requests
scores_status=$(curl -sS -m 10 -o /dev/null -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d '{"name":"test","continent":"africa","category":"capitals","level":"easy","score":1,"total":8,"timeMs":1000,"passed":false}' \
  "$WORKER_URL/api/scores" 2>&1 || true)
if [ "$scores_status" = "401" ]; then
  ok "Worker C1 fix LIVE: /api/scores rejects unauthenticated (401)"
else
  err "Worker C1 fix NOT live: /api/scores returned $scores_status (expected 401)"
  err "  → Operator must run: CLOUDFLARE_API_TOKEN=xxx ./scripts/deploy.sh"
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

# /api/auth/check should reject missing JWT
auth_status=$(curl -sS -m 10 -o /dev/null -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" -d '{}' \
  "$WORKER_URL/api/auth/check" 2>&1 || true)
if [ "$auth_status" = "401" ]; then
  ok "Worker /api/auth/check LIVE (401 on missing JWT)"
else
  err "Worker /api/auth/check returned $auth_status (expected 401)"
  FAIL_COUNT=$((FAIL_COUNT + 1))
fi

echo ""
if [ "$FAIL_COUNT" -eq 0 ]; then
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}All operator checks passed. Production is healthy.${NC}"
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  exit 0
else
  echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${RED}$FAIL_COUNT check(s) failed. See above for details.${NC}"
  echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo "Manual steps:"
  echo "  1. Supabase RLS — verify in dashboard (Authentication → Policies)"
  echo "  2. Supabase SMTP — verify email templates (Authentication → Email Templates)"
  echo "  3. Cloudflare secrets — 'npx wrangler secret list' (all 7 must appear)"
  exit 1
fi
