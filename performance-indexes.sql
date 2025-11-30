-- ============================================
-- Performance Indexes for Autex Database
-- ============================================
-- 
-- Purpose: Optimize query performance for dashboard pages
-- Impact: 10-100x faster queries, scales to millions of records
-- 
-- Run this in Supabase SQL Editor after all tables are created
-- ============================================

-- Index 1: Conversations List Query
-- Used by: /api/conversations (dashboard conversations page)
-- Optimizes: Filtering by workspace_id and sorting by last_message_at
CREATE INDEX IF NOT EXISTS idx_conversations_workspace_updated 
ON conversations(workspace_id, last_message_at DESC);

-- Index 2: Orders Dashboard Query
-- Used by: /api/orders, /api/dashboard/recent-orders
-- Optimizes: Filtering by workspace_id and sorting by created_at
CREATE INDEX IF NOT EXISTS idx_orders_workspace_created 
ON orders(workspace_id, created_at DESC);

-- Index 3: Analytics Date Range Queries
-- Used by: /api/analytics (analytics dashboard)
-- Optimizes: Filtering by workspace_id and date range queries
CREATE INDEX IF NOT EXISTS idx_api_usage_workspace_date 
ON api_usage(workspace_id, created_at DESC);

-- Index 4: Message History Query
-- Used by: /api/conversations/[id] (conversation detail page)
-- Optimizes: Loading messages for a specific conversation sorted by time
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created 
ON messages(conversation_id, created_at DESC);

-- Index 5: Orders by Status
-- Used by: /api/analytics (order status breakdown)
-- Optimizes: Filtering orders by workspace and status
CREATE INDEX IF NOT EXISTS idx_orders_workspace_status 
ON orders(workspace_id, status);

-- Index 6: Products Search
-- Used by: /api/products (products page with search)
-- Optimizes: Filtering products by workspace
CREATE INDEX IF NOT EXISTS idx_products_workspace 
ON products(workspace_id);

-- Index 7: Conversation State Filtering
-- Used by: /api/conversations (filter by state like IDLE, COLLECTING_NAME, etc.)
-- Optimizes: Filtering conversations by workspace and current_state
CREATE INDEX IF NOT EXISTS idx_conversations_workspace_state 
ON conversations(workspace_id, current_state);

-- Index 8: Messages by Sender
-- Used by: Analytics and conversation analysis
-- Optimizes: Filtering messages by conversation and sender type
CREATE INDEX IF NOT EXISTS idx_messages_conversation_sender 
ON messages(conversation_id, sender);

-- ============================================
-- Verify Indexes Created
-- ============================================

-- Run this query to verify all indexes were created:
-- SELECT 
--   schemaname,
--   tablename,
--   indexname,
--   indexdef
-- FROM pg_indexes
-- WHERE schemaname = 'public'
--   AND indexname LIKE 'idx_%'
-- ORDER BY tablename, indexname;

-- ============================================
-- Performance Testing
-- ============================================

-- Test conversations query performance:
-- EXPLAIN ANALYZE
-- SELECT * FROM conversations
-- WHERE workspace_id = 'your-workspace-id'
-- ORDER BY last_message_at DESC
-- LIMIT 20;

-- Test orders query performance:
-- EXPLAIN ANALYZE
-- SELECT * FROM orders
-- WHERE workspace_id = 'your-workspace-id'
-- ORDER BY created_at DESC
-- LIMIT 10;

-- Test messages query performance:
-- EXPLAIN ANALYZE
-- SELECT * FROM messages
-- WHERE conversation_id = 'your-conversation-id'
-- ORDER BY created_at DESC;

-- ============================================
-- Expected Results
-- ============================================
-- 
-- Before indexes:
-- - Seq Scan (sequential scan through all rows)
-- - Execution time: 50-500ms for large tables
-- 
-- After indexes:
-- - Index Scan using idx_* 
-- - Execution time: 1-10ms
-- 
-- Performance improvement: 10-100x faster
-- ============================================
