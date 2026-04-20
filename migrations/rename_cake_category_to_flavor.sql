-- Migration: Rename cake_category to flavor in products table
-- Purpose: Unify terminology across the system
-- Date: 2026-04-20

-- 1. Rename column in products table
ALTER TABLE public.products 
RENAME COLUMN cake_category TO flavor;

-- 2. Add comment for documentation
COMMENT ON COLUMN public.products.flavor IS 'The flavor or category of the food item (e.g. Chocolate, Red Velvet)';
