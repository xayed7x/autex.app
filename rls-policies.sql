-- Row Level Security Policies for Autex Dashboard
-- Run this in Supabase SQL Editor to enable workspace isolation

-- ============================================
-- ENABLE RLS ON ALL TABLES
-- ============================================

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PRODUCTS TABLE POLICIES
-- ============================================

-- Allow users to view products in their workspace
CREATE POLICY "Users can view their workspace products"
  ON products FOR SELECT
  USING (
    workspace_id IN (
      SELECT id FROM workspaces WHERE owner_id = auth.uid()
    )
  );

-- Allow users to insert products in their workspace
CREATE POLICY "Users can insert products in their workspace"
  ON products FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT id FROM workspaces WHERE owner_id = auth.uid()
    )
  );

-- Allow users to update products in their workspace
CREATE POLICY "Users can update their workspace products"
  ON products FOR UPDATE
  USING (
    workspace_id IN (
      SELECT id FROM workspaces WHERE owner_id = auth.uid()
    )
  );

-- Allow users to delete products in their workspace
CREATE POLICY "Users can delete their workspace products"
  ON products FOR DELETE
  USING (
    workspace_id IN (
      SELECT id FROM workspaces WHERE owner_id = auth.uid()
    )
  );

-- ============================================
-- ORDERS TABLE POLICIES
-- ============================================

-- Allow users to view orders in their workspace
CREATE POLICY "Users can view their workspace orders"
  ON orders FOR SELECT
  USING (
    workspace_id IN (
      SELECT id FROM workspaces WHERE owner_id = auth.uid()
    )
  );

-- Allow users to insert orders in their workspace
CREATE POLICY "Users can insert orders in their workspace"
  ON orders FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT id FROM workspaces WHERE owner_id = auth.uid()
    )
  );

-- Allow users to update orders in their workspace
CREATE POLICY "Users can update their workspace orders"
  ON orders FOR UPDATE
  USING (
    workspace_id IN (
      SELECT id FROM workspaces WHERE owner_id = auth.uid()
    )
  );

-- Allow users to delete orders in their workspace
CREATE POLICY "Users can delete their workspace orders"
  ON orders FOR DELETE
  USING (
    workspace_id IN (
      SELECT id FROM workspaces WHERE owner_id = auth.uid()
    )
  );

-- ============================================
-- CONVERSATIONS TABLE POLICIES
-- ============================================

-- Allow users to view conversations in their workspace
CREATE POLICY "Users can view their workspace conversations"
  ON conversations FOR SELECT
  USING (
    workspace_id IN (
      SELECT id FROM workspaces WHERE owner_id = auth.uid()
    )
  );

-- Allow users to insert conversations in their workspace
CREATE POLICY "Users can insert conversations in their workspace"
  ON conversations FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT id FROM workspaces WHERE owner_id = auth.uid()
    )
  );

-- Allow users to update conversations in their workspace
CREATE POLICY "Users can update their workspace conversations"
  ON conversations FOR UPDATE
  USING (
    workspace_id IN (
      SELECT id FROM workspaces WHERE owner_id = auth.uid()
    )
  );

-- Allow users to delete conversations in their workspace
CREATE POLICY "Users can delete their workspace conversations"
  ON conversations FOR DELETE
  USING (
    workspace_id IN (
      SELECT id FROM workspaces WHERE owner_id = auth.uid()
    )
  );

-- ============================================
-- MESSAGES TABLE POLICIES
-- ============================================

-- Allow users to view messages in their workspace conversations
CREATE POLICY "Users can view messages in their workspace"
  ON messages FOR SELECT
  USING (
    conversation_id IN (
      SELECT c.id FROM conversations c
      JOIN workspaces w ON c.workspace_id = w.id
      WHERE w.owner_id = auth.uid()
    )
  );

-- Allow users to insert messages in their workspace conversations
CREATE POLICY "Users can insert messages in their workspace"
  ON messages FOR INSERT
  WITH CHECK (
    conversation_id IN (
      SELECT c.id FROM conversations c
      JOIN workspaces w ON c.workspace_id = w.id
      WHERE w.owner_id = auth.uid()
    )
  );

-- Allow users to update messages in their workspace conversations
CREATE POLICY "Users can update messages in their workspace"
  ON messages FOR UPDATE
  USING (
    conversation_id IN (
      SELECT c.id FROM conversations c
      JOIN workspaces w ON c.workspace_id = w.id
      WHERE w.owner_id = auth.uid()
    )
  );

-- Allow users to delete messages in their workspace conversations
CREATE POLICY "Users can delete messages in their workspace"
  ON messages FOR DELETE
  USING (
    conversation_id IN (
      SELECT c.id FROM conversations c
      JOIN workspaces w ON c.workspace_id = w.id
      WHERE w.owner_id = auth.uid()
    )
  );

-- ============================================
-- API_USAGE TABLE POLICIES
-- ============================================

-- Allow users to view API usage in their workspace
CREATE POLICY "Users can view their workspace API usage"
  ON api_usage FOR SELECT
  USING (
    workspace_id IN (
      SELECT id FROM workspaces WHERE owner_id = auth.uid()
    )
  );

-- Allow users to insert API usage in their workspace
CREATE POLICY "Users can insert API usage in their workspace"
  ON api_usage FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT id FROM workspaces WHERE owner_id = auth.uid()
    )
  );

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Run these to verify RLS is enabled:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';

-- Run these to verify policies exist:
-- SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname = 'public';
