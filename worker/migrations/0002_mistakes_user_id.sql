-- ============================================================================
-- Migration 0002: Add user_id column to mistakes table
-- ============================================================================

ALTER TABLE mistakes ADD COLUMN user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_mistakes_user ON mistakes (user_id, created_at DESC);
