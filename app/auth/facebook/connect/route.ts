/**
 * Facebook OAuth Connect Route
 * Initiates the Facebook OAuth flow by redirecting to Facebook authorization
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateStateToken } from '@/lib/facebook/crypto-utils';
import { createState } from '@/lib/facebook/oauth-state';

const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID!;
const REDIRECT_URI = process.env.NEXT_PUBLIC_APP_URL 
  ? `${process.env.NEXT_PUBLIC_APP_URL}/auth/facebook/callback`
  : 'http://localhost:3000/auth/facebook/callback';

// Required Facebook permissions
const SCOPES = [
  'public_profile',
  'pages_show_list',
  'pages_messaging',
  'pages_manage_metadata',
  'pages_read_engagement',
  'pages_read_user_content',
].join(',');

export async function GET(request: NextRequest) {
  try {
    console.log('🔵 Initiating Facebook OAuth flow...');
    
    // Verify user is authenticated
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      console.error('❌ User not authenticated:', authError);
      return NextResponse.redirect(new URL('/login?error=unauthenticated', request.url));
    }
    
    console.log('✅ User authenticated:', user.id);
    
    // Verify environment variables
    if (!FACEBOOK_APP_ID) {
      console.error('❌ FACEBOOK_APP_ID not configured');
      return NextResponse.redirect(
        new URL('/dashboard/settings?error=config_missing', request.url)
      );
    }
    
    // Generate CSRF state token
    const stateToken = generateStateToken();
    await createState(user.id, stateToken);
    
    console.log('🔐 Generated state token for user:', user.id);
    
    // Build Facebook OAuth URL
    const authUrl = new URL('https://www.facebook.com/v21.0/dialog/oauth');
    authUrl.searchParams.set('client_id', FACEBOOK_APP_ID);
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.set('state', stateToken);
    authUrl.searchParams.set('scope', SCOPES);
    
    console.log('🚀 Redirecting to Facebook OAuth:', authUrl.toString());
    
    return NextResponse.redirect(authUrl.toString());
    
  } catch (error) {
    console.error('❌ Error in OAuth connect:', error);
    return NextResponse.redirect(
      new URL('/dashboard/settings?error=oauth_failed', request.url)
    );
  }
}
