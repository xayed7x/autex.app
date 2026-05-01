-- Add last_reminder_sent_at to track when we last sent a subscription reminder
ALTER TABLE public.workspaces 
ADD COLUMN IF NOT EXISTS last_reminder_sent_at timestamp with time zone;

COMMENT ON COLUMN public.workspaces.last_reminder_sent_at IS 'Timestamp of the last trial or subscription renewal reminder sent to the owner.';
