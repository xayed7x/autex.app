-- Migration: Add Instagram Business Account support to facebook_pages
-- Instagram DMs use the same Facebook Page Access Token, so no separate token column is needed.
-- We only store the instagram_account_id for webhook routing (object: "instagram" events).

ALTER TABLE facebook_pages
ADD COLUMN IF NOT EXISTS instagram_account_id text DEFAULT NULL;

COMMENT ON COLUMN facebook_pages.instagram_account_id IS 
  'Instagram Business Account ID linked to this Facebook Page. Used to route Instagram webhook events.';

-- Partial index for efficient webhook routing lookups
CREATE INDEX IF NOT EXISTS idx_facebook_pages_instagram_account_id 
  ON facebook_pages(instagram_account_id) 
  WHERE instagram_account_id IS NOT NULL;
