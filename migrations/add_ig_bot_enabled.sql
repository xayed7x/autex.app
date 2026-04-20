-- Migration: Add Independent Instagram Bot Toggle
-- Allows turning off the Instagram AI bot while keeping the Facebook bot active

ALTER TABLE facebook_pages 
ADD COLUMN IF NOT EXISTS ig_bot_enabled boolean DEFAULT true;

-- Default to false for new connections so users actively turn it on
COMMENT ON COLUMN facebook_pages.ig_bot_enabled IS 
  'Controls whether the AI bot responds to Instagram messages and comments for this page.';
