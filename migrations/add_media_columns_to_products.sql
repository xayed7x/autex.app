-- Add media columns to products table
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS media_images text[];
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS media_videos text[];
