-- Migration: Add food order description fields and flexible delivery zones
-- Purpose: Support custom order descriptions, inspiration images, and dynamic delivery zones for food businesses
-- Date: 2026-04-20

-- 1. Update orders table
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS customer_description text,
ADD COLUMN IF NOT EXISTS inspiration_image text,
ADD COLUMN IF NOT EXISTS delivery_zone text;

-- 2. Update workspace_settings table
ALTER TABLE public.workspace_settings 
ADD COLUMN IF NOT EXISTS delivery_zones jsonb DEFAULT '[]'::jsonb;

-- Add comments for documentation
COMMENT ON COLUMN public.orders.customer_description IS 'The customer''s own words describing their custom requirements';
COMMENT ON COLUMN public.orders.inspiration_image IS 'URL of the image the customer sent as a reference/inspiration';
COMMENT ON COLUMN public.orders.delivery_zone IS 'Label of the delivery zone selected (e.g. inside city, outside city)';
COMMENT ON COLUMN public.workspace_settings.delivery_zones IS 'Flexible delivery zone configurations for food businesses (JSON array of {label, charge} objects)';
