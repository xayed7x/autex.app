-- Fix ALL foreign key constraints to allow cascading deletes
-- This allows deleting Facebook pages even when they have associated data

-- 1. Fix ORDERS table constraint
ALTER TABLE orders 
DROP CONSTRAINT IF EXISTS orders_fb_page_id_fkey;

ALTER TABLE orders
ADD CONSTRAINT orders_fb_page_id_fkey 
FOREIGN KEY (fb_page_id) 
REFERENCES facebook_pages(id) 
ON DELETE CASCADE;

-- 2. Fix CONVERSATIONS table constraint
ALTER TABLE conversations 
DROP CONSTRAINT IF EXISTS conversations_fb_page_id_fkey;

ALTER TABLE conversations
ADD CONSTRAINT conversations_fb_page_id_fkey 
FOREIGN KEY (fb_page_id) 
REFERENCES facebook_pages(id) 
ON DELETE CASCADE;

-- Explanation:
-- ON DELETE CASCADE means when a Facebook page is deleted,
-- all related data (orders, conversations, and their messages) 
-- will be automatically deleted.
-- This maintains referential integrity and prevents orphaned data.
