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
      .eq('id', pageId)
      .eq('workspace_id', workspace.id)
      .single();

    if (pageError || !fbPage) {
      return NextResponse.json(
        { error: 'Facebook page not found' },
        { status: 404 }
      );
    }

    // Decrypt access token
    const { decryptToken, generateAppSecretProof } = await import('@/lib/facebook/crypto-utils');
    const accessToken = decryptToken(fbPage.encrypted_access_token);
    
    // Generate App Secret Proof for security
    const appSecretProof = generateAppSecretProof(accessToken);
    const proofParam = appSecretProof ? `&appsecret_proof=${appSecretProof}` : '';

    // Fetch user profile from Facebook Messenger Platform API using v20.0
    // Requesting a superset of fields for both Facebook (PSID) and Instagram (IGSID)
    const fields = 'first_name,last_name,name,profile_pic,picture.type(large)';
    const graphUrl = `https://graph.facebook.com/v20.0/${psid}?fields=${fields}&access_token=${accessToken}${proofParam}`;
    
    const response = await fetch(graphUrl);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Facebook Graph API error:', errorText);
      
      // Attempt to parse JSON error for better response
      let errorMessage = 'Could not fetch profile';
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.error?.message || errorMessage;
      } catch (e) {}

      return NextResponse.json({
        name: null,
        profile_pic: null,
        psid: psid,
        error: errorMessage,
      });
    }

    const profileData = await response.json();
    
    // Robust name parsing: Prioritize first_name + last_name (Messenger) then name (Instagram/Generic)
    let fullName = null;
    if (profileData.first_name) {
      fullName = `${profileData.first_name} ${profileData.last_name || ''}`.trim();
    } else if (profileData.name) {
      fullName = profileData.name;
    }
      
    // Robust picture parsing: Prioritize profile_pic (Messenger) then picture.data.url (Instagram/Large)
    const profilePic = profileData.profile_pic || profileData.picture?.data?.url || null;

    return NextResponse.json({
      name: fullName,
      profile_pic: profilePic,
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
