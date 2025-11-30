-- ============================================
-- AI DIRECTOR - COMPLETE SETUP SCRIPT
-- ============================================
-- Run this in Supabase SQL Editor to set up everything
-- for the AI Director architecture.
--
-- This script:
-- 1. Upgrades conversation context to rich structure
-- 2. Adds performance indexes
-- 3. Adds unique constraints
-- 4. Migrates existing data
-- ============================================

-- ============================================
-- STEP 1: ENSURE CONTEXT COLUMN IS JSONB
-- ============================================

DO $$
BEGIN
  -- Check if context column exists and is JSONB
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'conversations' 
    AND column_name = 'context' 
    AND data_type = 'jsonb'
  ) THEN
    -- Add or alter the column to JSONB
    ALTER TABLE conversations 
    ADD COLUMN IF NOT EXISTS context JSONB;
  END IF;
END $$;

-- ============================================
-- STEP 2: MIGRATE EXISTING CONVERSATIONS
-- ============================================

-- Migrate existing rows to new rich context structure
UPDATE conversations
SET context = jsonb_build_object(
  'state', COALESCE(current_state, 'IDLE'),
  'cart', CASE
    -- If old context has product info, migrate to cart
    WHEN context->>'productId' IS NOT NULL THEN
      jsonb_build_array(
        jsonb_build_object(
          'productId', context->>'productId',
          'productName', context->>'productName',
          'productPrice', (context->>'productPrice')::numeric,
          'quantity', 1
        )
      )
    ELSE '[]'::jsonb
  END,
  'checkout', jsonb_build_object(
    'customerName', context->>'customerName',
    'customerPhone', context->>'customerPhone',
    'customerAddress', context->>'customerAddress',
    'deliveryCharge', (context->>'deliveryCharge')::numeric,
    'totalAmount', (context->>'totalAmount')::numeric
  ),
  'metadata', jsonb_build_object(
    'lastImageHash', context->>'lastImageHash',
    'lastImageUrl', context->>'lastImageUrl',
    'lastProductId', context->>'productId',
    'messageCount', 0,
    'isReturningCustomer', false
  ),
  -- Keep legacy fields for backward compatibility
  'productId', context->>'productId',
  'productName', context->>'productName',
  'productPrice', context->>'productPrice',
  'customerName', context->>'customerName',
  'customerPhone', context->>'customerPhone',
  'customerAddress', context->>'customerAddress',
  'deliveryCharge', context->>'deliveryCharge',
  'totalAmount', context->>'totalAmount'
)
WHERE context IS NOT NULL;

-- Set default context for rows with NULL context
UPDATE conversations
SET context = jsonb_build_object(
  'state', COALESCE(current_state, 'IDLE'),
  'cart', '[]'::jsonb,
  'checkout', '{}'::jsonb,
  'metadata', jsonb_build_object(
    'messageCount', 0,
    'isReturningCustomer', false
  )
)
WHERE context IS NULL;

-- ============================================
-- STEP 3: CREATE GIN INDEXES FOR JSONB QUERIES
-- ============================================

-- Index on cart items (for querying products in cart)
CREATE INDEX IF NOT EXISTS idx_conversations_context_cart 
ON conversations USING GIN ((context->'cart'));

-- Index on checkout info (for querying customer data)
CREATE INDEX IF NOT EXISTS idx_conversations_context_checkout 
ON conversations USING GIN ((context->'checkout'));

-- Index on metadata (for analytics)
CREATE INDEX IF NOT EXISTS idx_conversations_context_metadata 
ON conversations USING GIN ((context->'metadata'));

-- ============================================
-- STEP 4: CREATE PERFORMANCE INDEXES
-- ============================================

-- Index for conversation lookups (used by orchestrator)
CREATE INDEX IF NOT EXISTS idx_conversations_fb_page_psid 
ON conversations(fb_page_id, customer_psid);

-- Index for message history queries (used by AI Director)
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created 
ON messages(conversation_id, created_at DESC);

-- Index for API usage analytics
CREATE INDEX IF NOT EXISTS idx_api_usage_workspace_created 
ON api_usage(workspace_id, created_at DESC);

-- Index for order lookups
CREATE INDEX IF NOT EXISTS idx_orders_workspace_created 
ON orders(workspace_id, created_at DESC);

-- Index for product search
CREATE INDEX IF NOT EXISTS idx_products_workspace_name 
ON products(workspace_id, name);

-- ============================================
-- STEP 5: ADD UNIQUE CONSTRAINT
-- ============================================

-- Prevent duplicate conversations for same customer on same page
-- Note: This will fail if you already have duplicates
-- In that case, clean up duplicates first
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_unique_customer 
ON conversations(fb_page_id, customer_psid);

-- ============================================
-- STEP 6: ADD HELPFUL COMMENTS
-- ============================================

COMMENT ON COLUMN conversations.context IS 
'Rich JSONB context containing cart, checkout, and metadata. Structure: { state, cart[], checkout{}, metadata{} }';

COMMENT ON COLUMN api_usage.api_type IS 
'Type of API call: ai_director, image_recognition, auto_tagging, intent_detection';

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Run these to verify the migration worked correctly:

-- 1. Check context structure
-- SELECT 
--   id,
--   current_state,
--   context->'state' as new_state,
--   context->'cart' as cart,
--   context->'checkout' as checkout,
--   context->'metadata' as metadata
-- FROM conversations
-- LIMIT 10;

-- 2. Check indexes
-- SELECT 
--   schemaname,
--   tablename,
--   indexname,
--   indexdef
-- FROM pg_indexes
-- WHERE tablename IN ('conversations', 'messages', 'api_usage', 'orders', 'products')
-- ORDER BY tablename, indexname;

-- 3. Count conversations
-- SELECT 
--   COUNT(*) as total_conversations,
--   COUNT(CASE WHEN context IS NOT NULL THEN 1 END) as with_context,
--   COUNT(CASE WHEN context->'cart' IS NOT NULL THEN 1 END) as with_cart
-- FROM conversations;

-- ============================================
-- DONE!
-- ============================================

-- Your database is now ready for the AI Director architecture! 🎉
--
-- Next steps:
-- 1. Verify the migration with the queries above
-- 2. Test the system with a Facebook message
-- 3. Monitor costs in the api_usage table
