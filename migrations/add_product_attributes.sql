-- Add product_attributes JSONB column to products table
-- Stores rich product details: fabric, fit type, care instructions, size chart, etc.
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_attributes jsonb DEFAULT '{}'::jsonb;
