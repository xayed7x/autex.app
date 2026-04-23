/**
 * Connect Facebook Page API
 * Saves selected Facebook page to database with encrypted token and webhook subscription
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { encryptToken } from '@/lib/facebook/crypto-utils';
import { cookies } from 'next/headers';
import type { Database } from '@/types/supabase';

// Enable BigInt JSON serialization
import '@/lib/utils/bigint-serializer';

const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID!;
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET!;

interface ConnectPageRequest {
  pageId: string;
  pageName: string;
  accessToken: string;
}

export async function POST(request: NextRequest) {
  try {
    console.log('🔵 Connecting Facebook page...');
    
    // Verify user is authenticated
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error('❌ User not authenticated:', authError);
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Get workspace ID
    const { data: workspaceData, error: workspaceError } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .single();
    
    if (workspaceError || !workspaceData) {
      console.error('❌ Failed to get workspace:', workspaceError);
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      );
    }
    
    const workspaceId = workspaceData.workspace_id;
    console.log('✅ User workspace:', workspaceId);
    
    // Create a service role client for database operations that need to bypass RLS
    const supabaseAdmin = createServiceClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    // Check if workspace already has a connected page
    const { data: existingPages, error: checkError } = await supabaseAdmin
      .from('facebook_pages')
      .select('id, page_name')
      .eq('workspace_id', workspaceId)
      .eq('status', 'connected');
    
    if (checkError) {
      console.error('❌ Error checking existing pages:', checkError);
    }
    
    if (existingPages && existingPages.length > 0) {
      console.warn('⚠️ Workspace already has a connected page');
      return NextResponse.json(
        { 
          error: 'Only one Facebook page can be connected per workspace. Please disconnect your current page first.',
          currentPage: existingPages[0].page_name
        },
        { status: 400 }
      );
    }
    
    // Parse request body
    const body: ConnectPageRequest = await request.json();
    const { pageId, pageName, accessToken } = body;
    
    // Validate input
    if (!pageId || !pageName || !accessToken) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    
    // Validate page ID format (should be numeric)
    if (!/^\d+$/.test(pageId)) {
      return NextResponse.json(
        { error: 'Invalid page ID format' },
        { status: 400 }
      );
    }
    
    console.log(`📄 Connecting page: ${pageName} (${pageId})`);
    
    // Step 1: Exchange for long-lived page access token
    console.log('🔄 Exchanging for long-lived token...');
    const tokenUrl = new URL('https://graph.facebook.com/v21.0/oauth/access_token');
    tokenUrl.searchParams.set('grant_type', 'fb_exchange_token');
    tokenUrl.searchParams.set('client_id', FACEBOOK_APP_ID);
    tokenUrl.searchParams.set('client_secret', FACEBOOK_APP_SECRET);
    tokenUrl.searchParams.set('fb_exchange_token', accessToken);
    
    const tokenResponse = await fetch(tokenUrl.toString());
    
    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      console.error('❌ Token exchange failed:', errorData);
      return NextResponse.json(
        { error: 'Failed to exchange token for long-lived token' },
        { status: 500 }
      );
    }
    
    const tokenData = await tokenResponse.json();
    const longLivedToken = tokenData.access_token;
    console.log('✅ Long-lived token obtained');
    
    // Step 2: Fetch page username
    let pageUsername: string | null = null;
    try {
      console.log('🔄 Fetching page username...');
      const usernameResponse = await fetch(
        `https://graph.facebook.com/v21.0/${pageId}?fields=username&access_token=${longLivedToken}`
      );
      
      if (usernameResponse.ok) {
        const usernameData = await usernameResponse.json();
        pageUsername = usernameData.username || null;
        console.log(`📘 [CONNECT] Page username fetched: ${pageUsername}`);
      } else {
        const errorData = await usernameResponse.json();
        console.warn('⚠️ [CONNECT] Failed to fetch page username:', errorData);
      }
    } catch (error) {
      console.error('❌ [CONNECT] Error fetching page username:', error);
      // Continue even if username fetch fails
    }
    
    // Step 3: Encrypt the access token
    console.log('🔐 Encrypting access token...');
    const encryptedToken = encryptToken(longLivedToken);
    console.log('✅ Token encrypted');
    
    // Step 4: Save to database using admin client to bypass RLS
    console.log('💾 Saving to database...');
    const { data: pageData, error: dbError } = await supabaseAdmin
      .from('facebook_pages')
      .upsert({
        id: BigInt(pageId) as unknown as number, // Convert to BigInt for bigint column
        workspace_id: workspaceId,
        page_name: pageName,
        page_username: pageUsername,
        encrypted_access_token: encryptedToken,
        bot_enabled: false, // Disable Facebook bot by default
        ig_bot_enabled: false, // Disable Instagram bot by default
        status: 'connected',
      }, {
        onConflict: 'id',
      })
      .select()
      .single();
    
    if (dbError) {
      console.error('❌ Database error:', dbError);
      return NextResponse.json(
        { error: 'Failed to save page to database' },
        { status: 500 }
      );
    }
    
    console.log('✅ Page saved to database');
    
    // Step 4.5: Check for linked Instagram Business Account
    let instagramAccountId: string | null = null;
    try {
      console.log('📸 Checking for linked Instagram Business Account...');
      const igResponse = await fetch(
        `https://graph.facebook.com/v21.0/${pageId}?fields=instagram_business_account&access_token=${longLivedToken}`
      );
      
      if (igResponse.ok) {
        const igData = await igResponse.json();
        if (igData.instagram_business_account?.id) {
          instagramAccountId = igData.instagram_business_account.id;
          console.log(`✅ Instagram Business Account found: ${instagramAccountId}`);
          
          // Save Instagram account ID to the facebook_pages row
          await supabaseAdmin
            .from('facebook_pages')
            .update({ instagram_account_id: instagramAccountId } as any)
            .eq('id', BigInt(pageId) as unknown as number);
          
          console.log('✅ Instagram account ID saved to database');
        } else {
          console.log('ℹ️ No Instagram Business Account linked to this page');
        }
      } else {
        const igError = await igResponse.json();
        console.warn('⚠️ Could not check Instagram Business Account:', igError);
      }
    } catch (igError) {
      console.error('❌ Error checking Instagram Business Account:', igError);
      // Non-fatal — page connection still succeeds without Instagram
    }
    
    // Step 4: Subscribe page to webhook (Combine Messenger and Feed)
    console.log('🔔 Subscribing to webhooks (Messenger + Feed)...');
    try {
      // Combine all fields into one request to prevent overwriting
      const allFields = 'messages,messaging_postbacks,messaging_optins,feed';
      const subscribeUrl = new URL(`https://graph.facebook.com/v24.0/${pageId}/subscribed_apps`);
      subscribeUrl.searchParams.set('access_token', longLivedToken);
      subscribeUrl.searchParams.set('subscribed_fields', allFields);
      
      const response = await fetch(subscribeUrl.toString(), { method: 'POST' });
      const result = await response.json();

      if (response.ok) {
        console.log('✅ All webhooks (Messenger + Feed) subscribed successfully');
      } else {
        // If it fails with all fields, try just the core Messenger fields as a fallback
        console.warn('⚠️ Combined subscription failed, trying Core Messenger only:', result);
        const coreFields = 'messages,messaging_postbacks,messaging_optins';
        subscribeUrl.searchParams.set('subscribed_fields', coreFields);
        const coreResponse = await fetch(subscribeUrl.toString(), { method: 'POST' });
        if (coreResponse.ok) {
          console.log('✅ Core Messenger webhooks subscribed (Feed skipped)');
        } else {
          console.error('❌ CRITICAL: Webhook subscription failed completely:', await coreResponse.json());
        }
      }
    } catch (error) {
      console.error('❌ Error during webhook subscription:', error);
    }

    
    // Step 5: Clear temporary pages cookie
    const cookieStore = await cookies();
    cookieStore.delete('fb_pages_temp');
    
    console.log('🎉 Page connection complete!');
    
    return NextResponse.json({
      success: true,
      page: {
        id: pageId,
        name: pageName,
      },
    });
    
  } catch (error) {
    console.error('❌ Error connecting page:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
