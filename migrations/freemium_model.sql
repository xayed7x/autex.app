-- ============================================================
-- FREEMIUM MODEL MIGRATION
-- Replaces the 14-day trial with a permanent freemium model.
-- Every workspace gets 100 free customers per rolling 30-day window.
-- ============================================================

-- --------------------------------------------------------
-- STEP 1: Add new columns to workspaces table
-- --------------------------------------------------------

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS freemium_period_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS freemium_notified_at  TIMESTAMPTZ;

-- --------------------------------------------------------
-- STEP 2: Update subscription_status CHECK constraint
-- Remove 'trial', add 'freemium'
-- --------------------------------------------------------

ALTER TABLE public.workspaces
  DROP CONSTRAINT IF EXISTS workspaces_subscription_status_check;

ALTER TABLE public.workspaces
  ADD CONSTRAINT workspaces_subscription_status_check
  CHECK (subscription_status IN ('freemium', 'active', 'expired'));

-- --------------------------------------------------------
-- STEP 3: Replace the workspace creation trigger function
-- --------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_workspace_subscription()
RETURNS TRIGGER AS $$
BEGIN
  -- Set status to freemium (replaces 'trial')
  NEW.subscription_status := 'freemium';

  -- Start the first freemium 30-day window from NOW()
  NEW.freemium_period_start := NOW();

  -- No expiry date for freemium
  NEW.subscription_expires_at := NULL;
  NEW.subscription_plan       := NULL;
  NEW.admin_paused            := false;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ensure the trigger still fires (idempotent re-creation)
DROP TRIGGER IF EXISTS on_workspace_created_set_trial ON public.workspaces;

CREATE TRIGGER on_workspace_created_set_trial
  BEFORE INSERT ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_workspace_subscription();

-- --------------------------------------------------------
-- STEP 4: Backfill existing workspaces that were on 'trial'
-- --------------------------------------------------------

UPDATE public.workspaces
SET
  subscription_status   = 'freemium',
  freemium_period_start = created_at
WHERE subscription_status = 'trial';
