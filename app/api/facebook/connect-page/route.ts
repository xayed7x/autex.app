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
    
    // Step 2: Encrypt the access token
    console.log('🔐 Encrypting access token...');
    const encryptedToken = encryptToken(longLivedToken);
    console.log('✅ Token encrypted');
    
    // Step 3: Save to database using admin client to bypass RLS
    console.log('💾 Saving to database...');
    const { data: pageData, error: dbError } = await supabaseAdmin
      .from('facebook_pages')
      .upsert({
        id: BigInt(pageId) as unknown as number, // Convert to BigInt for bigint column
        workspace_id: workspaceId,
        page_name: pageName,
        encrypted_access_token: encryptedToken,
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
    
    // Step 4: Subscribe page to webhook
    console.log('🔔 Subscribing to webhook...');
    const webhookUrl = new URL(`https://graph.facebook.com/v21.0/${pageId}/subscribed_apps`);
    webhookUrl.searchParams.set('access_token', longLivedToken);
    webhookUrl.searchParams.set('subscribed_fields', 'messages,messaging_postbacks,feed');
    
    const webhookResponse = await fetch(webhookUrl.toString(), {
      method: 'POST',
    });
    
    if (!webhookResponse.ok) {
      const errorData = await webhookResponse.json();
      console.error('⚠️ Webhook subscription failed:', errorData);
      // Don't fail the entire operation, just log the warning
      // The page is still connected, but webhooks might not work
    } else {
      console.log('✅ Webhook subscribed successfully');
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
