-- Add is_test column to conversations table
-- This allows marking test conversations separately from real customer interactions

ALTER TABLE conversations 
ADD COLUMN is_test BOOLEAN DEFAULT false;

-- Create index for efficient filtering
CREATE INDEX idx_conversations_is_test ON conversations(is_test);

-- Add is_test column to orders table as well for complete isolation
ALTER TABLE orders 
ADD COLUMN is_test BOOLEAN DEFAULT false;

-- Create index for filtering test orders
CREATE INDEX idx_orders_is_test ON orders(is_test);

-- Comment
COMMENT ON COLUMN conversations.is_test IS 'Marks conversations created from the embedded test chat widget';
COMMENT ON COLUMN orders.is_test IS 'Marks orders created from test conversations';
