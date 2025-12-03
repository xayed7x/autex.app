/**
 * Facebook OAuth Callback Route
 * Handles the OAuth callback from Facebook, exchanges code for token, and fetches user's pages
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateState, deleteState } from '@/lib/facebook/oauth-state';
import { cookies } from 'next/headers';

const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID!;
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET!;
const REDIRECT_URI = process.env.NEXT_PUBLIC_APP_URL 
  ? `${process.env.NEXT_PUBLIC_APP_URL}/auth/facebook/callback`
  : 'http://localhost:3000/auth/facebook/callback';

interface FacebookTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
  category?: string;
  category_list?: Array<{ id: string; name: string }>;
  tasks?: string[];
}

interface FacebookPagesResponse {
  data: FacebookPage[];
  paging?: {
    cursors?: {
      before: string;
      after: string;
    };
  };
}

export async function GET(request: NextRequest) {
  try {
    console.log('🔵 Facebook OAuth callback received');
    
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');
    
    // Handle user denial
    if (error) {
      console.warn('⚠️ User denied permissions:', error, errorDescription);
      return NextResponse.redirect(
        new URL('/dashboard/settings?tab=facebook&error=access_denied', request.url)
      );
    }
    
    // Validate required parameters
    if (!code || !state) {
      console.error('❌ Missing code or state parameter');
      return NextResponse.redirect(
        new URL('/dashboard/settings?tab=facebook&error=invalid_callback', request.url)
      );
    }
    
    // Verify user is authenticated
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error('❌ User not authenticated:', authError);
      return NextResponse.redirect(new URL('/login?error=unauthenticated', request.url));
    }
    
    // Validate CSRF state token
    const isValidState = await validateState(state, user.id);
    if (!isValidState) {
      console.error('❌ Invalid state token - possible CSRF attack');
      return NextResponse.redirect(
        new URL('/dashboard/settings?tab=facebook&error=invalid_state', request.url)
      );
    }
    
    // Delete state token after validation (one-time use)
    await deleteState(state);
    console.log('✅ State token validated and deleted');
    
    // Step 1: Exchange code for user access token
    console.log('🔄 Exchanging code for access token...');
    const tokenUrl = new URL('https://graph.facebook.com/v19.0/oauth/access_token');
    tokenUrl.searchParams.set('client_id', FACEBOOK_APP_ID);
    tokenUrl.searchParams.set('client_secret', FACEBOOK_APP_SECRET);
    tokenUrl.searchParams.set('code', code);
    tokenUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    
    const tokenResponse = await fetch(tokenUrl.toString());
    
    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      console.error('❌ Token exchange failed:', errorData);
      return NextResponse.redirect(
        new URL('/dashboard/settings?tab=facebook&error=token_exchange_failed', request.url)
      );
    }
    
    const tokenData: FacebookTokenResponse = await tokenResponse.json();
    console.log('✅ User access token obtained');
    
    // Step 2: Fetch user's Facebook pages
    console.log('🔄 Fetching user pages...');
    const pagesUrl = new URL('https://graph.facebook.com/v19.0/me/accounts');
    pagesUrl.searchParams.set('access_token', tokenData.access_token);
    
    const pagesResponse = await fetch(pagesUrl.toString());
    
    if (!pagesResponse.ok) {
      const errorData = await pagesResponse.json();
      console.error('❌ Failed to fetch pages:', errorData);
      return NextResponse.redirect(
        new URL('/dashboard/settings?tab=facebook&error=fetch_pages_failed', request.url)
      );
    }
    
    const pagesData: FacebookPagesResponse = await pagesResponse.json();
    
    if (!pagesData.data || pagesData.data.length === 0) {
      console.warn('⚠️ User has no Facebook pages');
      return NextResponse.redirect(
        new URL('/dashboard/settings?tab=facebook&error=no_pages', request.url)
      );
    }
    
    console.log(`✅ Found ${pagesData.data.length} pages`);
    
    // Step 3: Store pages data in cookies for page selection UI
    // Note: Cookies have size limits, so we only store essential data
    const pagesForSelection = pagesData.data.map(page => ({
      id: page.id,
      name: page.name,
      access_token: page.access_token,
      category: page.category || page.category_list?.[0]?.name || 'Unknown',
    }));
    
    const cookieStore = await cookies();
    cookieStore.set('fb_pages_temp', JSON.stringify(pagesForSelection), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
      path: '/',
    });
    
    console.log('✅ Pages data stored in cookie, redirecting to selection UI');
    
    // Redirect to page selection UI
    return NextResponse.redirect(new URL('/auth/facebook/select-page', request.url));
    
  } catch (error) {
    console.error('❌ Error in OAuth callback:', error);
    return NextResponse.redirect(
      new URL('/dashboard/settings?tab=facebook&error=callback_failed', request.url)
    );
  }
}
