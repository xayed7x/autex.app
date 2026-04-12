import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkProduct() {
  const { data, error } = await supabase
    .from('products')
    .select('name, price, pricing_policy')
    .eq('id', 'cfb07c7e-5a3d-43b6-a8de-eeb128b4b54c')
    .single();

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Product:', JSON.stringify(data, null, 2));
}

checkProduct();
