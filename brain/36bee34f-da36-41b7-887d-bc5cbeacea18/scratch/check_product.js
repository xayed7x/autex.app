
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

async function checkProduct() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .ilike('name', '%choco 3 anniversary%');

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Product details:', JSON.stringify(data, null, 2));
  }
}

checkProduct();
