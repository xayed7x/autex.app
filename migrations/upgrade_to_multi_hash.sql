-- Migration: Upgrade from single image_hash to multiple image_hashes
-- This enables smart cropping and multi-hash matching for better Tier 1 hit rates

-- Step 1: Add new column for multiple hashes
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS image_hashes TEXT[];

-- Step 2: Migrate existing data from image_hash to image_hashes
-- Convert single hash to array format
UPDATE public.products
SET image_hashes = ARRAY[image_hash]
WHERE image_hash IS NOT NULL AND image_hashes IS NULL;

-- Step 3: Create index for faster array searches
CREATE INDEX IF NOT EXISTS idx_products_image_hashes 
ON public.products USING GIN (image_hashes);

-- Step 4: (Optional) Drop old column after verification
-- IMPORTANT: Only run this after confirming the migration worked
-- ALTER TABLE public.products DROP COLUMN IF EXISTS image_hash;

-- Verification query (run this to check migration)
-- SELECT 
--   id, 
--   name, 
--   image_hash as old_hash,
--   image_hashes as new_hashes,
--   array_length(image_hashes, 1) as hash_count
-- FROM products
-- WHERE image_hashes IS NOT NULL
-- LIMIT 10;

COMMENT ON COLUMN public.products.image_hashes IS 'Array of perceptual hashes: [full, center-cropped, square-cropped] for robust matching';
