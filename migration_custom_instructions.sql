-- Migration: Add custom_ai_instructions to workspace_settings
-- Created At: 2026-04-02T14:49:10+06:00

ALTER TABLE workspace_settings 
ADD COLUMN custom_ai_instructions text DEFAULT NULL;

-- Comment for documentation
COMMENT ON COLUMN workspace_settings.custom_ai_instructions IS 'Owner provides specific high-priority instructions to the AI agent';
