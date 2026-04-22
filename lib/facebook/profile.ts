import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';

interface FacebookProfile {
  name?: string;
  profile_pic?: string;
}

/**
 * Fetches a user's Facebook profile (name and profile pic)
 * @param psid - The customer's Page-Scoped ID
 * @param pageId - The Facebook Page ID
 * @param supabase - Supabase client instance
 */
export async function fetchFacebookProfile(
  psid: string,
  pageId: string,
  supabase: any // Using any for now to avoid complex type issues with the passed client
): Promise<FacebookProfile | null> {
  try {
    console.log('\n========================================');
    console.log('🔍 [PROFILE FETCH] Starting profile fetch...');
    console.log(`🔍 [PROFILE FETCH] PSID: ${psid}`);
    console.log(`🔍 [PROFILE FETCH] Page ID: ${pageId}`);
    console.log('========================================');
    
    const { decryptToken } = await import('@/lib/facebook/crypto-utils');
    
    // Get page access token
    const { data: pageData } = await supabase
      .from('facebook_pages')
      .select('encrypted_access_token')
      .eq('id', pageId)
      .single();
    
    if (!pageData) {
      console.error(`❌ [PROFILE FETCH] Page not found in DB: ${pageId}`);
      return null;
    }

    const accessToken = decryptToken(pageData.encrypted_access_token);
    console.log(`🔍 [PROFILE FETCH] Access token retrieved: ${accessToken ? 'yes' : 'no'}`);
    
    // Generate App Secret Proof (Best Practice & Required if enabled in App Settings)
    const { generateAppSecretProof } = await import('@/lib/facebook/crypto-utils');
    const appSecretProof = generateAppSecretProof(accessToken);
    const proofParam = appSecretProof ? `&appsecret_proof=${appSecretProof}` : '';

    // Use minimal fields as suggested by Meta AI to avoid conflicts for Messenger PSIDs
    // first_name, last_name, profile_pic are the standard for Messenger
    // We also include name and picture for Instagram (IGSID) compatibility
    const fields = 'first_name,last_name,profile_pic,name,picture.type(large)';
    const profileUrl = `https://graph.facebook.com/v20.0/${psid}?fields=${fields}&access_token=${accessToken}${proofParam}`;
    
    console.log(`🔍 [PROFILE FETCH] Calling Facebook Graph API v20.0 with minimal fields...`);
    
    const response = await fetch(profileUrl);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [PROFILE FETCH] API Error: ${response.status}`);
      console.error(`❌ [PROFILE FETCH] Error body: ${errorText}`);
      
      const isPrivacyError = errorText.includes('"code":100') && 
                            (errorText.includes('"subcode":33') || errorText.includes('"error_subcode":33'));

      if (isPrivacyError) {
        console.log(`ℹ️ [PROFILE FETCH] Access denied (100/33). Action required: Enable 'Advanced Access' for 'pages_messaging' in Meta Developer Dashboard.`);
        return {
          name: 'Facebook User',
          profile_pic: undefined 
        };
      }
      
      return null;
    }

    const data = await response.json();
    
    // Robust name parsing logic from Meta AI's advice
    let fullName = 'Facebook User';
    if (data.first_name) {
      fullName = `${data.first_name} ${data.last_name || ''}`.trim();
    } else if (data.name) {
      fullName = data.name;
    }
      
    // Robust picture parsing: Prioritize profile_pic (Messenger) then picture.data.url (Instagram/Large)
    const profilePic = data.profile_pic || data.picture?.data?.url;
    
    console.log(`✅ [PROFILE FETCH] SUCCESS!`);
    console.log(`✅ [PROFILE FETCH] Name: "${fullName}"`);
    console.log(`✅ [PROFILE FETCH] Profile pic: ${profilePic ? 'yes' : 'no'}`);
    console.log('========================================\n');

    return {
      name: fullName,
      profile_pic: profilePic
    };
  } catch (error) {
    console.error('❌ [PROFILE FETCH] Error:', error);
    return null;
  }
}
