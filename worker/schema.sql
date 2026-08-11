-- ============================================================================
-- Know Your World — D1 schema
-- ============================================================================
-- Single-table design. Name-keyed (no auth). Same display name on the same
-- leaderboard track = one row, deduped by highest score.
--
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
  total       INTEGER NOT NULL,  -- total questions in the quiz (typically 10)
  time_ms     INTEGER NOT NULL,  -- total time taken, milliseconds
  passed      INTEGER NOT NULL,  -- 1 if score >= 5, else 0

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
-- Indexes — tuned for the two queries we run:
--   1. Leaderboard: top N for a track, ordered by score desc, time asc
--   2. Best score for a name on a track (for dedup + personal best checks)
-- ============================================================================

-- Leaderboard query: WHERE continent=? AND category=? AND level=?
--                     ORDER BY score DESC, time_ms ASC LIMIT ?
CREATE INDEX idx_scores_track_score ON scores (continent, category, level, score DESC, time_ms ASC);

-- Per-name best score lookup: WHERE name_key=? AND continent=? AND category=? AND level=?
CREATE INDEX idx_scores_name_track ON scores (name_key, continent, category, level, score DESC);

-- Recent games for a name (for "my recent games" view if we add it)
CREATE INDEX idx_scores_name_recent ON scores (name_key, created_at DESC);
