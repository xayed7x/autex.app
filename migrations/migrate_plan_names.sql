-- Migration: Update subscription plan names to new 2026 structure
-- pro (old) -> growth (new)
-- business (old) -> pro (new)

-- Use a temporary name to avoid collision during swap
UPDATE workspaces SET subscription_plan = 'pro_temp' WHERE subscription_plan = 'pro';
UPDATE workspaces SET subscription_plan = 'pro' WHERE subscription_plan = 'business';
UPDATE workspaces SET subscription_plan = 'growth' WHERE subscription_plan = 'pro_temp';

-- Update payment history as well for consistency
UPDATE payment_history SET plan_activated = 'pro_temp' WHERE plan_activated = 'pro';
UPDATE payment_history SET plan_activated = 'pro' WHERE plan_activated = 'business';
UPDATE payment_history SET plan_activated = 'growth' WHERE plan_activated = 'pro_temp';
