-- Migration: Add product image and variations to orders table
-- This allows storing product images and variation details (color, size) in orders

-- Add product_image_url column to store the product image
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS product_image_url TEXT;

-- Add product_variations column to store color, size, etc.
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS product_variations JSONB;

-- Add comment for documentation
COMMENT ON COLUMN orders.product_image_url IS 'URL of the product image from Cloudinary';
COMMENT ON COLUMN orders.product_variations IS 'Product variations like color, size, etc. stored as JSON';

-- Example product_variations structure:
-- {"color": "Red", "size": "M"}
-- {"colors": ["Red", "Blue"], "sizes": ["S", "M", "L"]}
