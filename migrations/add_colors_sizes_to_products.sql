-- Add colors and sizes columns to products table
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS colors text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS sizes text[] DEFAULT '{}';

-- Comment on columns
COMMENT ON COLUMN public.products.colors IS 'Array of available colors for the product';
COMMENT ON COLUMN public.products.sizes IS 'Array of available sizes for the product';
