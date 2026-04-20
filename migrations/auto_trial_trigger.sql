-- Trigger to automatically set 14-day trial when a new workspace is created
CREATE OR REPLACE FUNCTION public.handle_new_workspace_subscription()
RETURNS TRIGGER AS $$
BEGIN
  -- Set status to trial
  NEW.subscription_status := 'trial';
  
  -- Set trial end date to 14 days from now
  -- Using (now() AT TIME ZONE 'UTC') + INTERVAL '14 days'
  -- We store in UTC, display logic handles timezone conversion
  NEW.trial_ends_at := NOW() + INTERVAL '14 days';
  
  -- Ensure other fields are null/default
  NEW.subscription_expires_at := NULL;
  NEW.subscription_plan := NULL;
  NEW.admin_paused := false;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists to allow cleaner re-runs
DROP TRIGGER IF EXISTS on_workspace_created_set_trial ON public.workspaces;

-- Create the trigger
CREATE TRIGGER on_workspace_created_set_trial
  BEFORE INSERT ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_workspace_subscription();
