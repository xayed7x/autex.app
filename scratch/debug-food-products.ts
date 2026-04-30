import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // Using service role to bypass RLS for debugging
const supabase = createClient(supabaseUrl, supabaseKey);

async function debugProducts() {
  console.log('--- DEBUGGING FOOD PRODUCTS ---');
  const { data, error } = await supabase
    .from('products')
    .select('id, name, product_attributes, category')
    .eq('category', 'food')
    .limit(5);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(JSON.stringify(data, null, 2));
}

debugProducts();
