-- Add business policy fields to workspace_settings table
-- These power the AI's dynamic knowledge base instead of hardcoded text.
ALTER TABLE workspace_settings ADD COLUMN IF NOT EXISTS return_policy text;
ALTER TABLE workspace_settings ADD COLUMN IF NOT EXISTS quality_guarantee text;
ALTER TABLE workspace_settings ADD COLUMN IF NOT EXISTS business_category text;
ALTER TABLE workspace_settings ADD COLUMN IF NOT EXISTS business_address text;
ALTER TABLE workspace_settings ADD COLUMN IF NOT EXISTS exchange_policy text;
ALTER TABLE workspace_settings ADD COLUMN IF NOT EXISTS custom_faqs jsonb DEFAULT '[]'::jsonb;
