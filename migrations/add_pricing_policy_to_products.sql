-- Add pricing_policy column to products table
-- This stores per-product pricing and negotiation rules

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS pricing_policy JSONB DEFAULT '{}'::jsonb;

-- Add comment explaining the structure
COMMENT ON COLUMN products.pricing_policy IS 'Product pricing rules: {isNegotiable: boolean, minPrice: number|null, bulkDiscounts: [{minQty: number, discountPercent: number}]}';

-- Example structure:
-- {
--   "isNegotiable": true,
--   "minPrice": 800,           -- Lowest acceptable price (null if not negotiable)
--   "bulkDiscounts": [
--     {"minQty": 3, "discountPercent": 5},
--     {"minQty": 5, "discountPercent": 10}
--   ]
-- }

-- Create index for faster queries on negotiable products
CREATE INDEX IF NOT EXISTS idx_products_pricing_policy 
ON products USING GIN (pricing_policy);
