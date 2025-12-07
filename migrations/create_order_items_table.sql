-- Migration: Create order_items table for multi-product cart support
-- Date: 2025-12-07
-- Description: Enables orders to have multiple products (1 order → many items)

-- =============================================
-- 1. CREATE ORDER_ITEMS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  order_id uuid NOT NULL,
  product_id uuid,
  product_name text NOT NULL,
  product_price numeric NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  selected_size text,
  selected_color text,
  subtotal numeric NOT NULL,
  product_image_url text,
  created_at timestamp with time zone DEFAULT now(),
  
  -- Primary key
  CONSTRAINT order_items_pkey PRIMARY KEY (id),
  
  -- Foreign keys
  CONSTRAINT order_items_order_id_fkey 
    FOREIGN KEY (order_id) 
    REFERENCES public.orders(id) 
    ON DELETE CASCADE,
  
  CONSTRAINT order_items_product_id_fkey 
    FOREIGN KEY (product_id) 
    REFERENCES public.products(id) 
    ON DELETE SET NULL
);

-- =============================================
-- 2. CREATE INDEXES FOR PERFORMANCE
-- =============================================

-- Index for fetching items by order (most common query)
CREATE INDEX IF NOT EXISTS idx_order_items_order_id 
ON public.order_items(order_id);

-- Index for stock tracking and analytics
CREATE INDEX IF NOT EXISTS idx_order_items_product_id 
ON public.order_items(product_id);

-- =============================================
-- 3. ADD ROW LEVEL SECURITY (RLS)
-- =============================================

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view order items for their workspace's orders
CREATE POLICY "Users can view their workspace order items"
ON public.order_items FOR SELECT
USING (
  order_id IN (
    SELECT id FROM public.orders
    WHERE workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  )
);

-- Policy: Users can insert order items for their workspace's orders
CREATE POLICY "Users can insert order items for their workspace"
ON public.order_items FOR INSERT
WITH CHECK (
  order_id IN (
    SELECT id FROM public.orders
    WHERE workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  )
);

-- Policy: Users can update order items for their workspace's orders
CREATE POLICY "Users can update their workspace order items"
ON public.order_items FOR UPDATE
USING (
  order_id IN (
    SELECT id FROM public.orders
    WHERE workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  )
);

-- Policy: Users can delete order items for their workspace's orders
CREATE POLICY "Users can delete their workspace order items"
ON public.order_items FOR DELETE
USING (
  order_id IN (
    SELECT id FROM public.orders
    WHERE workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  )
);

-- =============================================
-- 4. ADD HELPFUL COMMENTS
-- =============================================

COMMENT ON TABLE public.order_items IS 'Individual products within an order (supports multi-product cart)';
COMMENT ON COLUMN public.order_items.order_id IS 'Reference to parent order';
COMMENT ON COLUMN public.order_items.product_id IS 'Reference to product (NULL if product deleted)';
COMMENT ON COLUMN public.order_items.product_name IS 'Snapshot of product name at time of order';
COMMENT ON COLUMN public.order_items.product_price IS 'Unit price at time of order';
COMMENT ON COLUMN public.order_items.quantity IS 'Number of units ordered';
COMMENT ON COLUMN public.order_items.selected_size IS 'Selected size variant (e.g., S, M, L, XL)';
COMMENT ON COLUMN public.order_items.selected_color IS 'Selected color variant';
COMMENT ON COLUMN public.order_items.subtotal IS 'product_price * quantity';
COMMENT ON COLUMN public.order_items.product_image_url IS 'Snapshot of product image URL';

-- =============================================
-- USAGE NOTES:
-- =============================================
-- 
-- BEFORE (Single Product):
-- orders table: product_id, product_price, quantity, selected_size, selected_color
-- 
-- AFTER (Multi-Product):
-- orders table: customer_name, customer_phone, customer_address, delivery_charge, total_amount
-- order_items table: Each product in the order (linked by order_id)
--
-- total_amount = SUM(order_items.subtotal) + delivery_charge
--
-- Example:
-- 1 order with 3 products = 1 row in orders + 3 rows in order_items
-- Deleting order automatically deletes all order_items (CASCADE)
