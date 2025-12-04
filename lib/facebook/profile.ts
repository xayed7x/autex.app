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
      .eq('id', parseInt(pageId))
      .single();
    
    if (!pageData) {
      console.error(`❌ [PROFILE] Page not found: ${pageId}`);
      return null;
    }

    const accessToken = decryptToken(pageData.encrypted_access_token);
    const profileUrl = `https://graph.facebook.com/v21.0/${psid}?fields=name,picture&access_token=${accessToken}`;
    
    console.log(`🔍 [PROFILE] Fetching for PSID: ${psid} using Page ID: ${pageId}`);
    
    const response = await fetch(profileUrl);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [PROFILE] Fetch failed: ${response.status} - ${errorText}`);
      return null;
    }

    const data = await response.json();
    console.log(`✅ [PROFILE] Fetched: ${data.name}`);

    return {
      name: data.name,
      profile_pic: data.picture?.data?.url
    };
  } catch (error) {
    console.error('❌ [PROFILE] Error fetching profile:', error);
    return null;
  }
}
