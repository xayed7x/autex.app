-- Add visual_features column to products table
-- This stores aspect ratio and other visual metadata for Tier 2 matching

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS visual_features JSONB;

-- Example visual_features structure:
-- {
--   "aspectRatio": 1.5,
--   "dominantColors": [
--     {"r": 255, "g": 100, "b": 50},
--     {"r": 200, "g": 150, "b": 100},
--     {"r": 100, "g": 50, "b": 25}
--   ]
-- }

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_products_visual_features ON public.products USING GIN (visual_features);

-- Add comment
COMMENT ON COLUMN public.products.visual_features IS 'JSONB column storing visual features (aspect ratio, dominant colors) for Tier 2 image matching';
