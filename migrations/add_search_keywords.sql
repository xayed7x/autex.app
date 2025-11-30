-- Migration: Add search_keywords column for auto-tagging
-- This enables AI-powered keyword generation for better product matching

-- Add search_keywords column to products table
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS search_keywords TEXT[];

-- Create GIN index for fast keyword searches
CREATE INDEX IF NOT EXISTS idx_products_search_keywords 
ON public.products USING GIN (search_keywords);

COMMENT ON COLUMN public.products.search_keywords IS 'Auto-generated keywords from OpenAI for enhanced product matching';
