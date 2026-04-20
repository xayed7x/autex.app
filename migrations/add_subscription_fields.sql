-- Migration: Add Subscription Fields to Workspaces
-- Purpose: Enable manual subscription management for MVP phase

-- ========================================
-- Step 1: Add Subscription Tracking Fields
-- ========================================

-- Subscription plan (starter, pro, business, enterprise)
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT NULL;

-- Trial end timestamp (set on signup: NOW() + 14 days in Bangladesh time)
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ DEFAULT NULL;

-- Paid subscription expiry timestamp
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ DEFAULT NULL;

-- Admin pause flag (separate from subscription status)
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS admin_paused BOOLEAN DEFAULT FALSE;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS admin_paused_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS admin_paused_reason TEXT DEFAULT NULL;

-- ========================================
-- Step 2: Add Payment Tracking Fields
-- ========================================

-- Last payment tracking
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS last_payment_date TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS last_payment_amount NUMERIC DEFAULT NULL;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS last_payment_method TEXT DEFAULT NULL;

-- Lifetime value tracking
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS total_paid NUMERIC DEFAULT 0;

-- ========================================
-- Step 3: Normalize Existing Status Values
-- ========================================

-- Update old 'free_trial' to 'trial' for consistency
UPDATE workspaces SET subscription_status = 'trial' WHERE subscription_status = 'free_trial';

-- Set default for new workspaces
ALTER TABLE workspaces ALTER COLUMN subscription_status SET DEFAULT 'trial';

-- ========================================
-- Step 4: Set Trial for Existing Workspaces
-- ========================================

-- For existing workspaces that don't have trial_ends_at set,
-- give them 14 days from now (as a one-time migration)
UPDATE workspaces 
SET trial_ends_at = NOW() + INTERVAL '14 days'
WHERE subscription_status = 'trial' 
  AND trial_ends_at IS NULL;

-- ========================================
-- Step 5: Add Performance Indexes
-- ========================================

-- Index for finding expired trials/subscriptions (for cron job)
CREATE INDEX IF NOT EXISTS idx_workspaces_subscription_status ON workspaces(subscription_status);
CREATE INDEX IF NOT EXISTS idx_workspaces_trial_ends ON workspaces(trial_ends_at) WHERE subscription_status = 'trial';
CREATE INDEX IF NOT EXISTS idx_workspaces_subscription_expires ON workspaces(subscription_expires_at) WHERE subscription_status = 'active';

-- ========================================
-- Step 6: Add Check Constraint for Valid Statuses
-- ========================================

-- Ensure subscription_status is one of the valid values
-- (removing the constraint first if it exists, then adding)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspaces_subscription_status_check'
  ) THEN
    ALTER TABLE workspaces DROP CONSTRAINT workspaces_subscription_status_check;
  END IF;
END $$;

ALTER TABLE workspaces ADD CONSTRAINT workspaces_subscription_status_check 
  CHECK (subscription_status IN ('trial', 'active', 'expired'));

-- ========================================
-- Done! Summary of Changes:
-- ========================================
-- Added fields:
--   - subscription_plan (TEXT)
--   - trial_ends_at (TIMESTAMPTZ)
--   - subscription_expires_at (TIMESTAMPTZ)
--   - admin_paused (BOOLEAN)
--   - admin_paused_at (TIMESTAMPTZ)
--   - admin_paused_reason (TEXT)
--   - last_payment_date (TIMESTAMPTZ)
--   - last_payment_amount (NUMERIC)
--   - last_payment_method (TEXT)
--   - total_paid (NUMERIC)
-- 
-- Normalized 'free_trial' → 'trial'
-- Set trial_ends_at for existing trial workspaces
-- Added indexes for expiry queries
