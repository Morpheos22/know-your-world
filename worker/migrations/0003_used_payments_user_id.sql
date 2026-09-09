-- ============================================================================
-- Migration 0003: Add user_id column to used_payments table
-- ============================================================================

ALTER TABLE used_payments ADD COLUMN user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_used_payments_user ON used_payments (user_id, verified_at DESC);
