-- ============================================================================
-- Know Your World — D1 schema
-- ============================================================================
-- Run locally:    pnpm --filter @know-your-world/api run db:migrate:local
-- Run on prod:    pnpm --filter @know-your-world/api run db:migrate
-- ============================================================================

-- Drop if re-running during development
DROP TABLE IF EXISTS scores;

CREATE TABLE scores (
  -- Primary key
  id          INTEGER PRIMARY KEY AUTOINCREMENT,

  -- Player identity (sanitized on insert: trimmed, max 20 chars, profanity-checked)
  name        TEXT    NOT NULL,
  name_key    TEXT    NOT NULL,  -- lowercased name for dedup

  -- Track identifier — what was played
  continent   TEXT    NOT NULL,  -- 'africa' | 'asia' | 'europe' | 'americas'
  category    TEXT    NOT NULL,  -- 'capitals' | 'presidents' | 'flags' | 'currencies'
  level       TEXT    NOT NULL,  -- 'easy' | 'medium' | 'hard'

  -- Score payload
  score       INTEGER NOT NULL,  -- correct answers (0..total)
  total       INTEGER NOT NULL,  -- total questions in the quiz (typically 8)
  time_ms     INTEGER NOT NULL,  -- total time taken, milliseconds
  passed      INTEGER NOT NULL,  -- 1 if score >= 4, else 0

  -- Metadata
  user_agent  TEXT,               -- browser UA (for abuse analysis, optional)
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),

  -- Validation constraints
  CHECK (length(name) >= 1 AND length(name) <= 20),
  CHECK (continent IN ('africa', 'asia', 'europe', 'americas')),
  CHECK (category IN ('capitals', 'presidents', 'flags', 'currencies')),
  CHECK (level IN ('easy', 'medium', 'hard')),
  CHECK (score >= 0 AND score <= total),
  CHECK (total > 0),
  CHECK (time_ms >= 0),
  CHECK (passed IN (0, 1))
);

-- ============================================================================
-- Indexes for the scores table
-- ============================================================================

CREATE INDEX idx_scores_track_score ON scores (continent, category, level, score DESC, time_ms ASC);
CREATE INDEX idx_scores_name_track ON scores (name_key, continent, category, level, score DESC);
CREATE INDEX idx_scores_name_recent ON scores (name_key, created_at DESC);

-- ============================================================================
-- TTS cache — stores generated audio as base64 to avoid re-calling ElevenLabs
-- ============================================================================

CREATE TABLE IF NOT EXISTS tts_cache (
  -- SHA-256 hash of the input text — primary cache key
  text_hash   TEXT    PRIMARY KEY,

  -- The original text (for debugging, max 500 chars)
  text        TEXT    NOT NULL,

  -- Audio data as base64-encoded MP3
  audio_b64   TEXT    NOT NULL,

  -- Which provider generated this audio ('elevenlabs' | 'workers-ai')
  provider    TEXT    NOT NULL,

  -- Content type (always 'audio/mpeg')
  content_type TEXT   NOT NULL DEFAULT 'audio/mpeg',

  -- Timestamps for TTL management
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),

  -- Validation
  CHECK (length(text) >= 1 AND length(text) <= 500),
  CHECK (provider IN ('elevenlabs', 'workers-ai'))
);

-- Index for TTL-based cleanup queries
CREATE INDEX IF NOT EXISTS idx_tts_cache_created ON tts_cache (created_at);
