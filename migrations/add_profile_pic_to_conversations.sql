-- Add customer_profile_pic_url column to conversations table
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS customer_profile_pic_url text;

-- Comment on column
COMMENT ON COLUMN public.conversations.customer_profile_pic_url IS 'URL of the customer''s Facebook profile picture';
