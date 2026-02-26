-- Migration to enable RLS on tables flagged by Supabase linter
-- Tables: pre_registrations, webhook_events, image_recognition_cache
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. PRE_REGISTRATIONS TABLE
-- ============================================
-- This table stores landing page sign-ups (no workspace_id).
-- Only service role should be able to insert/read.
-- We enable RLS but create no user-level policies to block anon/authenticated access.

ALTER TABLE public.pre_registrations ENABLE ROW LEVEL SECURITY;

-- Service role policy (service role bypasses RLS by default, but explicit for clarity)
-- No policies needed since service_role bypasses RLS automatically


-- ============================================
-- 2. WEBHOOK_EVENTS TABLE
-- ============================================
-- This table stores webhook event deduplication (no workspace_id).
-- Only service role should be able to insert/read for internal processing.

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- No user-level policies - service role bypasses RLS automatically


-- ============================================
-- 3. IMAGE_RECOGNITION_CACHE TABLE
-- ============================================
-- This table caches image recognition results, linked to products.
-- Access should be based on product workspace ownership.

ALTER TABLE public.image_recognition_cache ENABLE ROW LEVEL SECURITY;

-- Allow users to view cache entries for products in their workspace
CREATE POLICY "Users can view image cache for their workspace products"
  ON image_recognition_cache FOR SELECT
  USING (
    matched_product_id IS NULL OR
    matched_product_id IN (
      SELECT p.id FROM products p
      JOIN workspaces w ON p.workspace_id = w.id
      WHERE w.owner_id = auth.uid()
    )
  );

-- Allow users to insert cache entries for products in their workspace
CREATE POLICY "Users can insert image cache for their workspace products"
  ON image_recognition_cache FOR INSERT
  WITH CHECK (
    matched_product_id IS NULL OR
    matched_product_id IN (
      SELECT p.id FROM products p
      JOIN workspaces w ON p.workspace_id = w.id
      WHERE w.owner_id = auth.uid()
    )
  );

-- Allow users to update cache entries for products in their workspace
CREATE POLICY "Users can update image cache for their workspace products"
  ON image_recognition_cache FOR UPDATE
  USING (
    matched_product_id IS NULL OR
    matched_product_id IN (
      SELECT p.id FROM products p
      JOIN workspaces w ON p.workspace_id = w.id
      WHERE w.owner_id = auth.uid()
    )
  );

-- Allow users to delete cache entries for products in their workspace
CREATE POLICY "Users can delete image cache for their workspace products"
  ON image_recognition_cache FOR DELETE
  USING (
    matched_product_id IS NULL OR
    matched_product_id IN (
      SELECT p.id FROM products p
      JOIN workspaces w ON p.workspace_id = w.id
      WHERE w.owner_id = auth.uid()
    )
  );


-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Verify RLS is enabled on these tables:
-- SELECT tablename, rowsecurity FROM pg_tables 
-- WHERE schemaname = 'public' 
-- AND tablename IN ('pre_registrations', 'webhook_events', 'image_recognition_cache');

-- Verify policies exist:
-- SELECT schemaname, tablename, policyname FROM pg_policies 
-- WHERE schemaname = 'public' 
-- AND tablename IN ('pre_registrations', 'webhook_events', 'image_recognition_cache');
