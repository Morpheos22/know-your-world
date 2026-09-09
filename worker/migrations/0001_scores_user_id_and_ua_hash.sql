-- ============================================================================
-- Migration 0001: Add user_id column to existing scores table
-- ============================================================================
-- For deployments that already have a `scores` table without the C1 FIX
-- `user_id` column. D1 doesn't support IF NOT EXISTS on ADD COLUMN —
-- the migration runner (db:migrate:additive) is tolerant of
-- "duplicate column name" errors.
-- ============================================================================

ALTER TABLE scores ADD COLUMN user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_scores_user_track ON scores (user_id, continent, category, level, score DESC, time_ms ASC);

-- ============================================================================
-- Migration 0002: Add ua_hash column to scores (L3 PII fix)
-- ============================================================================
-- For deployments that have `user_agent` column (raw UA = PII). We add
-- `ua_hash` (8-char SHA-256 prefix) alongside. Old `user_agent` column is
-- left in place (SQLite has no DROP COLUMN without full table rebuild).
-- ============================================================================

ALTER TABLE scores ADD COLUMN ua_hash TEXT;
