-- Migration: Add token and feature tracking to api_usage table

-- Add new columns for detailed AI usage tracking
ALTER TABLE public.api_usage 
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS prompt_tokens integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completion_tokens integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_tokens integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS feature_name text;

-- Optional: Create an index on workspace_id and created_at for faster admin queries
CREATE INDEX IF NOT EXISTS idx_api_usage_metrics ON public.api_usage(workspace_id, created_at);
