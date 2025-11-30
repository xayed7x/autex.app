-- ============================================
-- AI Director - Phase 1: Context Migration
-- ============================================
-- This migration updates the conversations table to support
-- the new rich context structure while maintaining backward
-- compatibility with existing data.

-- Step 1: Ensure the context column is JSONB (should already be)
-- This is just a safety check
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

-- Step 2: Migrate existing rows to new context structure
-- This updates all existing conversations to have the new rich structure
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

-- Step 3: Set default context for rows with NULL context
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

-- Step 4: Create indexes for better query performance
-- Index on cart items (for querying products in cart)
CREATE INDEX IF NOT EXISTS idx_conversations_context_cart 
ON conversations USING GIN ((context->'cart'));

-- Index on checkout info (for querying customer data)
CREATE INDEX IF NOT EXISTS idx_conversations_context_checkout 
ON conversations USING GIN ((context->'checkout'));

-- Index on metadata (for analytics)
CREATE INDEX IF NOT EXISTS idx_conversations_context_metadata 
ON conversations USING GIN ((context->'metadata'));

-- Step 5: Add helpful comments
COMMENT ON COLUMN conversations.context IS 
'Rich JSONB context containing cart, checkout, and metadata. Structure: { state, cart[], checkout{}, metadata{} }';

-- ============================================
-- VERIFICATION QUERY
-- ============================================
-- Run this to verify the migration worked correctly:
-- 
-- SELECT 
--   id,
--   current_state,
--   context->'state' as new_state,
--   context->'cart' as cart,
--   context->'checkout' as checkout,
--   context->'metadata' as metadata
-- FROM conversations
-- LIMIT 10;
