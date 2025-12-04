-- Add status column to facebook_pages table
-- This allows for "soft delete" when disconnecting a page

ALTER TABLE facebook_pages 
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'connected';

-- Add check constraint to ensure valid status values
ALTER TABLE facebook_pages 
ADD CONSTRAINT facebook_pages_status_check 
CHECK (status IN ('connected', 'disconnected'));

-- Comment on column
COMMENT ON COLUMN facebook_pages.status IS 'Status of the page connection: connected or disconnected';
