import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

async function checkPage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const pageId = '102145369095390';
  console.log(`🔍 Checking for Page ID: ${pageId}...`);

  const { data, error } = await supabase
    .from('facebook_pages')
    .select('id, name, workspace_id')
    .eq('id', pageId);

  if (error) {
    console.error('❌ DB Error:', error.message);
  } else if (data && data.length > 0) {
    console.log('✅ Found Page:', data[0]);
  } else {
    console.log('❌ Page not found in database.');
    
    // Check all pages to see what IDs are there
    const { data: allPages } = await supabase
      .from('facebook_pages')
      .select('id, name');
    console.log('📋 Existing Page IDs:', allPages?.map(p => p.id));
  }
}

checkPage();
