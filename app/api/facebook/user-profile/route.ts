import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Fetches Facebook user profile information using PSID
 * GET /api/facebook/user-profile?psid=xxx&pageId=xxx
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const psid = searchParams.get('psid');
    const pageId = searchParams.get('pageId');

    if (!psid || !pageId) {
      return NextResponse.json(
        { error: 'Missing psid or pageId parameter' },
        { status: 400 }
      );
    }

    // Get page access token from database
    const supabase = await createClient();
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get workspace
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('id')
      .eq('owner_id', user.id)
      .single();

    if (!workspace) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 });
    }

    // Get Facebook page access token (using service role to bypass RLS)
    const { createClient: createAdminClient } = await import('@supabase/supabase-js');
    const supabaseAdmin = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: fbPage, error: pageError } = await supabaseAdmin
      .from('facebook_pages')
      .select('encrypted_access_token')
      .eq('id', parseInt(pageId))
      .eq('workspace_id', workspace.id)
      .single();

    if (pageError || !fbPage) {
      return NextResponse.json(
        { error: 'Facebook page not found' },
        { status: 404 }
      );
    }

    // Decrypt access token
    const { decryptToken } = await import('@/lib/facebook/crypto-utils');
    const accessToken = decryptToken(fbPage.encrypted_access_token);

    // Fetch user profile from Facebook Messenger Platform API
    // Note: For PSIDs, we need to use the Messenger Platform API, not Graph API
    // The endpoint is: /{psid}?fields=name,profile_pic&access_token={page_access_token}
    const graphUrl = `https://graph.facebook.com/v19.0/${psid}?fields=name,profile_pic&access_token=${accessToken}`;
    
    const response = await fetch(graphUrl);
    
    if (!response.ok) {
      const error = await response.json();
      console.error('Facebook Graph API error:', error);
      
      // Return fallback data instead of erroring
      // This allows the UI to still work even if profile fetch fails
      return NextResponse.json({
        name: null,
        profile_pic: null,
        psid: psid,
        error: 'Could not fetch profile - user may have blocked the page or revoked permissions',
      });
    }

    const profileData = await response.json();

    return NextResponse.json({
      name: profileData.name || null,
      profile_pic: profileData.profile_pic || null,
      psid: psid,
    });

  } catch (error) {
    console.error('Error fetching Facebook user profile:', error);
    
    // Return fallback instead of 500 error
    return NextResponse.json({
      name: null,
      profile_pic: null,
      psid: null,
      error: 'Internal server error',
    });
  }
}
