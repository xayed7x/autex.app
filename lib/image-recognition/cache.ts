import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';

type CacheRow = Database['public']['Tables']['image_recognition_cache']['Row'];

/**
 * Cached recognition result
 */
export interface CachedResult {
  productId: string | null;
  confidence: number;
  aiResponse?: any;
  tier: 'tier1' | 'tier2' | 'tier3';
}

/**
 * Checks if a cached result exists for the given image hash
 * 
 * @param imageHash - Hash of the image to look up
 * @returns Cached result if found and not expired, null otherwise
 */
export async function checkCache(imageHash: string): Promise<CachedResult | null> {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const { data, error } = await supabase
      .from('image_recognition_cache')
      .select('*')
      .eq('image_hash', imageHash)
      .gt('expires_at', new Date().toISOString()) // Only get non-expired entries
      .single();

    if (error || !data) {
      return null;
    }

    // Return cached result
    return {
      productId: data.matched_product_id,
      confidence: data.confidence_score || 0,
      aiResponse: data.ai_response,
      tier: 'tier3', // Cached results are typically from Tier 3
    };
  } catch (error) {
    console.error('Error checking cache:', error);
    return null;
  }
}

/**
 * Saves a recognition result to the cache
 * 
 * @param imageHash - Hash of the image
 * @param result - Recognition result to cache
 * @param productId - ID of matched product (if any)
 * @param aiResponse - AI response data (if from Tier 3)
 */
export async function saveToCache(
  imageHash: string,
  result: {
    confidence: number;
    productId?: string | null;
    aiResponse?: any;
  }
): Promise<void> {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    // Calculate expiry date (30 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    // Check if entry already exists
    const { data: existing } = await supabase
      .from('image_recognition_cache')
      .select('id')
      .eq('image_hash', imageHash)
      .single();

    if (existing) {
      // Update existing entry
      await supabase
        .from('image_recognition_cache')
        .update({
          matched_product_id: result.productId || null,
          confidence_score: result.confidence,
          ai_response: result.aiResponse || null,
          expires_at: expiresAt.toISOString(),
        })
        .eq('image_hash', imageHash);
    } else {
      // Insert new entry
      await supabase
        .from('image_recognition_cache')
        .insert({
          image_hash: imageHash,
          matched_product_id: result.productId || null,
          confidence_score: result.confidence,
          ai_response: result.aiResponse || null,
          expires_at: expiresAt.toISOString(),
        });
    }

    console.log('✓ Saved to cache:', imageHash);
  } catch (error) {
    console.error('Error saving to cache:', error);
    // Don't throw - caching failures shouldn't break the main flow
  }
}

/**
 * Clears expired cache entries
 * This can be run periodically as a cleanup job
 */
export async function clearExpiredCache(): Promise<number> {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const { data, error } = await supabase
      .from('image_recognition_cache')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .select();

    if (error) {
      console.error('Error clearing expired cache:', error);
      return 0;
    }

    const count = data?.length || 0;
    console.log(`✓ Cleared ${count} expired cache entries`);
    return count;
  } catch (error) {
    console.error('Error clearing expired cache:', error);
    return 0;
  }
}
