-- Add payment_last_two_digits column to orders table
ALTER TABLE public.orders
ADD COLUMN payment_last_two_digits TEXT;

-- Add comment
COMMENT ON COLUMN public.orders.payment_last_two_digits IS 'Last 2 digits of payment transaction for verification';
