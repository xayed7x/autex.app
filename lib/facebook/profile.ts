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
    const { decryptToken } = await import('@/lib/facebook/crypto-utils');
    
    // Get page access token
    const { data: pageData } = await supabase
      .from('facebook_pages')
      .select('encrypted_access_token')
      .eq('id', pageId)
      .single();
    
    if (!pageData) {
      console.error(`❌ [PROFILE] Page not found in DB: ${pageId}`);
      return null;
    }

    const accessToken = decryptToken(pageData.encrypted_access_token);
    
    // Generate App Secret Proof (Best Practice & Required if enabled in App Settings)
    const { generateAppSecretProof } = await import('@/lib/facebook/crypto-utils');
    const appSecretProof = generateAppSecretProof(accessToken);
    const proofParam = appSecretProof ? `&appsecret_proof=${appSecretProof}` : '';

    // Use v21.0 with name and picture
    const profileUrl = `https://graph.facebook.com/v21.0/${psid}?fields=name,picture&access_token=${accessToken}${proofParam}`;
    
    console.log(`🔍 [PROFILE] Fetching for PSID: ${psid} using Page ID: ${pageId}`);
    
    const response = await fetch(profileUrl);
    
    if (!response.ok) {
      const errorText = await response.text();
      
      // Specific handling for "Object does not exist" (Code 100, Subcode 33)
      // This is common for users who have strict privacy settings or during Dev Mode testing
      if (errorText.includes('"code":100') && errorText.includes('"subcode":33')) {
        console.log(`ℹ️ [PROFILE] User ${psid} has privacy settings restricting access. Using default profile.`);
        return {
          name: 'Facebook User',
          profile_pic: undefined // UI will show default avatar
        };
      }
      
      console.error(`❌ [PROFILE] Fetch failed: ${response.status} - ${errorText}`);
      return null;
    }

    const data = await response.json();
    const fullName = data.name || 'Facebook User';
    
    console.log(`✅ [PROFILE] Fetched: ${fullName}`);

    return {
      name: fullName,
      profile_pic: data.picture?.data?.url
    };
  } catch (error) {
    console.error('❌ [PROFILE] Error fetching profile:', error);
    return null;
  }
}
