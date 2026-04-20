-- Migration: Add business_context to workspace_settings
-- Purpose: Support free-form business descriptions for AI context
-- Date: 2026-04-20

ALTER TABLE public.workspace_settings 
ADD COLUMN IF NOT EXISTS business_context text;

-- Add comment for documentation
COMMENT ON COLUMN public.workspace_settings.business_context IS 'Free-form text describing the business for AI context';
