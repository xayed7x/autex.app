-- Updated Migration: Add price_per_pound to orders and food fields to order_items
-- Purpose: Complete the food business logging requirements
-- Date: 2026-04-20

-- 1. Update orders table (flavor already exists)
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS price_per_pound numeric(10,2);

-- 2. Update order_items table
ALTER TABLE public.order_items 
ADD COLUMN IF NOT EXISTS selected_flavor text,
ADD COLUMN IF NOT EXISTS pounds numeric(5,2);

-- Add comments for documentation
COMMENT ON COLUMN public.orders.price_per_pound IS 'Snapshot of the price per pound at time of order';
COMMENT ON COLUMN public.order_items.selected_flavor IS 'The flavor selected for this specific item';
COMMENT ON COLUMN public.order_items.pounds IS 'The number of pounds selected for this specific item';
