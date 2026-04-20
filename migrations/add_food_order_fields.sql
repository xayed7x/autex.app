-- Add food-specific order fields
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS delivery_date DATE,
ADD COLUMN IF NOT EXISTS flavor TEXT,
ADD COLUMN IF NOT EXISTS weight TEXT;
