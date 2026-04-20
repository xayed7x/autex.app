-- Add food/cake business fields to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_per_pound numeric(10,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS cake_category text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS allows_custom_message boolean DEFAULT true;
ALTER TABLE products ADD COLUMN IF NOT EXISTS min_pounds numeric(4,2) DEFAULT 0.5;
ALTER TABLE products ADD COLUMN IF NOT EXISTS max_pounds numeric(4,2) DEFAULT 5.0;

-- Add food/cake business fields to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS custom_message text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS pounds_ordered numeric(5,2);
