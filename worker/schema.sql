-- ============================================================================
-- Know Your World — D1 schema (idempotent, additive)
-- ============================================================================
-- Run locally:    pnpm --filter @know-your-world/api run db:migrate:local
-- Run on prod:    pnpm --filter @know-your-world/api run db:migrate
--
-- IDEMPOTENT and ADDITIVE — safe to re-run any number of times.
-- All CREATE TABLE are IF NOT EXISTS. All CREATE INDEX are IF NOT EXISTS.
-- Never uses DROP TABLE (would wipe production data).
-- ============================================================================

-- ============================================================================
-- scores — leaderboard entries
-- ============================================================================

CREATE TABLE IF NOT EXISTS scores (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  -- C1 FIX: authenticated user_id from Supabase JWT. Nullable for legacy rows.
  user_id     TEXT,
  -- Player display name (sanitized: trimmed, max 20 chars, profanity-checked)
  name        TEXT    NOT NULL,
  name_key    TEXT    NOT NULL,  -- lowercased name for legacy lookup
  continent   TEXT    NOT NULL,
  category    TEXT    NOT NULL,
  level       TEXT    NOT NULL,
  score       INTEGER NOT NULL,
  total       INTEGER NOT NULL,
  time_ms     INTEGER NOT NULL,
  passed      INTEGER NOT NULL,
  -- L3 FIX: ua_hash is the first 8 hex chars of SHA-256(raw User-Agent).
  -- We never store the raw UA — it's PII.
  ua_hash     TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK (length(name) >= 1 AND length(name) <= 20),
  CHECK (continent IN ('africa', 'asia', 'europe', 'americas', 'ai world')),
  CHECK (category IN ('capitals', 'presidents', 'flags', 'currencies', 'gen-ai', 'copilots', 'agents')),
  CHECK (level IN ('easy', 'medium', 'hard')),
  CHECK (score >= 0 AND score <= total),
  CHECK (total > 0),
  CHECK (time_ms >= 0),
  CHECK (passed IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_scores_track_score ON scores (continent, category, level, score DESC, time_ms ASC);
CREATE INDEX IF NOT EXISTS idx_scores_name_track ON scores (name_key, continent, category, level, score DESC);
CREATE INDEX IF NOT EXISTS idx_scores_name_recent ON scores (name_key, created_at DESC);
-- idx_scores_user_track is created by migration 0001 (it references the
-- user_id column which may not exist on legacy databases yet).

-- ============================================================================
-- blocklist — server-side blocklist (C4 FIX)
-- ============================================================================

CREATE TABLE IF NOT EXISTS blocklist (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  email_contains  TEXT,
  name_contains   TEXT,
  reason          TEXT    NOT NULL,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_blocklist_email ON blocklist (email_contains);
CREATE INDEX IF NOT EXISTS idx_blocklist_name ON blocklist (name_contains);

-- ============================================================================
-- used_payments — Pi Network replay-attack prevention (C2 FIX)
-- ============================================================================

CREATE TABLE IF NOT EXISTS used_payments (
  payment_id    TEXT    PRIMARY KEY,
  user_id       TEXT,
  plan          TEXT    NOT NULL,
  amount        INTEGER NOT NULL,
  verified_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK (length(payment_id) >= 1 AND length(payment_id) <= 200),
  CHECK (amount > 0),
  CHECK (plan IN ('individual', 'startup', 'organization', 'voice', 'unknown'))
);

CREATE INDEX IF NOT EXISTS idx_used_payments_user ON used_payments (user_id, verified_at DESC);

-- ============================================================================
-- rate_limits — cross-isolate rate-limit enforcement
-- ============================================================================

CREATE TABLE IF NOT EXISTS rate_limits (
  namespace   TEXT    NOT NULL,
  ip          TEXT    NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup ON rate_limits (namespace, ip, created_at);
CREATE INDEX IF NOT EXISTS idx_rate_limits_created ON rate_limits (created_at);

-- ============================================================================
-- mistakes — Poke tutor audit trail
-- ============================================================================

CREATE TABLE IF NOT EXISTS mistakes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         TEXT,
  name            TEXT    NOT NULL DEFAULT 'anonymous',
  continent       TEXT    NOT NULL,
  category        TEXT    NOT NULL,
  level           TEXT    NOT NULL,
  question        TEXT    NOT NULL,
  selected_answer TEXT    NOT NULL DEFAULT '',
  correct_answer  TEXT    NOT NULL DEFAULT '',
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK (level IN ('easy', 'medium', 'hard')),
  CHECK (length(question) >= 1 AND length(question) <= 500)
);

CREATE INDEX IF NOT EXISTS idx_mistakes_user ON mistakes (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mistakes_track ON mistakes (continent, category, created_at DESC);

-- ============================================================================
-- tts_cache — generated audio as base64
-- ============================================================================

CREATE TABLE IF NOT EXISTS tts_cache (
  text_hash   TEXT    PRIMARY KEY,
  text        TEXT    NOT NULL,
  audio_b64   TEXT    NOT NULL,
  provider    TEXT    NOT NULL,
  content_type TEXT   NOT NULL DEFAULT 'audio/mpeg',
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  CHECK (length(text) >= 1 AND length(text) <= 500),
  CHECK (provider IN ('elevenlabs', 'workers-ai'))
);

CREATE INDEX IF NOT EXISTS idx_tts_cache_created ON tts_cache (created_at);
