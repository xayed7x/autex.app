-- Migration to move from weight-based pricing to fixed pricing
-- This migration removes price_per_pound and related weight fields

-- 1. Sync price_per_pound to price for products that only have price_per_pound set
UPDATE public.products 
SET price = price_per_pound 
WHERE price_per_pound IS NOT NULL AND (price IS NULL OR price = 0);

-- 2. Remove weight-related columns from products table
ALTER TABLE public.products 
DROP COLUMN IF EXISTS price_per_pound,
DROP COLUMN IF EXISTS min_pounds,
DROP COLUMN IF EXISTS max_pounds,
DROP COLUMN IF EXISTS allows_custom_message;

-- 3. Remove weight-related columns from orders table
ALTER TABLE public.orders 
DROP COLUMN IF EXISTS pounds_ordered,
DROP COLUMN IF EXISTS price_per_pound,
DROP COLUMN IF EXISTS weight;

-- 4. Remove pounds from order_items table
ALTER TABLE public.order_items 
DROP COLUMN IF EXISTS pounds;

-- 5. Add a comment to price to clarify it is the fixed price
COMMENT ON COLUMN public.products.price IS 'Fixed price of the product';
