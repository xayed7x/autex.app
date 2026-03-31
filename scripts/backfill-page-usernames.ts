import { createClient } from '@supabase/supabase-js';
import { decryptToken } from '../lib/facebook/crypto-utils';
import type { Database } from '../types/supabase';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env or .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function backfillUsernames() {
  console.log('🚀 [BACKFILL] Starting Facebook Page username backfill...');

  try {
    // 1. Fetch all pages where page_username is NULL
    const { data: pages, error: fetchError } = await supabase
      .from('facebook_pages')
      .select('id, page_name, encrypted_access_token')
      .is('page_username', null);

    if (fetchError) {
      throw new Error(`Failed to fetch pages: ${fetchError.message}`);
    }

    if (!pages || pages.length === 0) {
      console.log('✅ [BACKFILL] No pages found requiring backfill.');
      return;
    }

    console.log(`📦 [BACKFILL] Found ${pages.length} pages to process.`);

    let successCount = 0;
    let failureCount = 0;

    for (const page of pages) {
      const pageId = String(page.id);
      try {
        console.log(`🔄 [BACKFILL] Processing Page ${page.page_name} (${pageId})...`);

        // 2. Decrypt the access token
        const decryptedToken = decryptToken(page.encrypted_access_token);

        // 3. Call Facebook Graph API for username
        const response = await fetch(
          `https://graph.facebook.com/v21.0/${pageId}?fields=username&access_token=${decryptedToken}`
        );

        if (!response.ok) {
          const errorData = await response.json();
          console.error(`❌ [BACKFILL] API error for Page ${pageId}:`, errorData);
          failureCount++;
          continue;
        }

        const data = await response.json();
        const username = data.username || null;

        if (username) {
          // 4. Update the database
          const { error: updateError } = await supabase
            .from('facebook_pages')
            .update({ page_username: username })
            .eq('id', page.id);

          if (updateError) {
            console.error(`❌ [BACKFILL] Database update error for Page ${pageId}:`, updateError);
            failureCount++;
          } else {
            console.log(`📘 [BACKFILL] Page ${pageId}: username = ${username}`);
            successCount++;
          }
        } else {
          console.warn(`⚠️ [BACKFILL] No username found for Page ${pageId} (API returned success but no username).`);
          // We can set it to a special value or just skip to try again later if needed
          failureCount++;
        }
      } catch (error) {
        console.error(`❌ [BACKFILL] Unexpected error processing Page ${pageId}:`, error);
        failureCount++;
      }
    }

    console.log('\n========================================');
    console.log(`🎉 [BACKFILL] Backfill complete!`);
    console.log(`✅ Success: ${successCount}`);
    console.log(`❌ Failures: ${failureCount}`);
    console.log('========================================');

  } catch (error) {
    console.error('❌ [BACKFILL] Critical script error:', error);
    process.exit(1);
  }
}

backfillUsernames();
