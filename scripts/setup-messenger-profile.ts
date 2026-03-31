import { createClient } from '@supabase/supabase-js';
import { decryptToken } from '../lib/facebook/crypto-utils';
import * as dotenv from 'dotenv';
import path from 'path';

// Load .env.local or .env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
}

async function setupMessengerProfile() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase environment variables');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('🔄 [SETUP] Fetching Facebook pages...');
  
  const { data: pages, error } = await supabase
    .from('facebook_pages')
    .select('id, page_name, encrypted_access_token');

  if (error) {
    console.error('❌ [SETUP] Failed to fetch pages:', error.message);
    process.exit(1);
  }

  if (!pages || pages.length === 0) {
    console.log('⚠️ [SETUP] No pages found in database');
    return;
  }

  console.log(`🔄 [SETUP] Found ${pages.length} pages. Configuring Messenger Profiles...`);

  for (const page of pages) {
    try {
      console.log(`\n📄 [PAGE] Setting up "${page.page_name}" (${page.id})...`);
      
      const decryptedToken = decryptToken(page.encrypted_access_token);
      
      const response = await fetch(
        `https://graph.facebook.com/v21.0/me/messenger_profile?access_token=${decryptedToken}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            get_started: {
              payload: 'GET_STARTED',
            },
          }),
        }
      );

      const result = await response.json();

      if (response.ok) {
        console.log(`✅ [SUCCESS] Messenger profile updated for ${page.page_name}`);
      } else {
        console.error(`❌ [ERROR] Failed to update profile for ${page.page_name}:`, result.error?.message || result);
      }
    } catch (err: any) {
      console.error(`❌ [ERROR] Failed to process page ${page.page_name}:`, err.message);
    }
  }

  console.log('\n🏁 [SETUP] Messenger profile setup complete.');
}

setupMessengerProfile().catch((err) => {
  console.error('❌ [FATAL] Setup script failed:', err);
  process.exit(1);
});
