import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';

type Product = Database['public']['Tables']['products']['Row'];

/**
 * Result of Tier 1 matching
 */
export interface Tier1MatchResult {
  product: Product | null;
  confidence: number;
  distance: number;
  matchedHashIndex?: number; // Which hash in the array matched (0=full, 1=center, 2=square)
}

/**
 * Calculates Hamming distance between two hex hash strings
 * Counts how many bits are different between the two hashes
 * 
 * @param hash1 - First hex hash string (16 characters)
 * @param hash2 - Second hex hash string (16 characters)
 * @returns Number of different bits (0-64)
 */
export function hammingDistance(hash1: string, hash2: string): number {
  if (hash1.length !== hash2.length) {
    throw new Error('Hashes must be the same length');
  }

  let distance = 0;

  // Compare each hex character
  for (let i = 0; i < hash1.length; i++) {
    // Convert hex characters to binary and count differences
    const val1 = parseInt(hash1[i], 16);
    const val2 = parseInt(hash2[i], 16);
    
    // XOR the values to find differing bits
    let xor = val1 ^ val2;
    
    // Count the number of 1s in the XOR result (differing bits)
    while (xor > 0) {
      distance += xor & 1;
      xor >>= 1;
    }
  }

  return distance;
}

/**
 * Finds a matching product using Tier 1 (Hamming Distance) algorithm
 * Now supports multi-hash matching for better real-world screenshot handling
 * 
 * @param imageHash - Hash of the customer's screenshot
 * @param workspaceId - Workspace ID to search within
 * @returns Match result with product, confidence, and distance
 */
export async function findTier1Match(
  imageHash: string,
  workspaceId: string
): Promise<Tier1MatchResult> {
  // Create Supabase admin client for server-side operations
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    // Fetch all products in the workspace that have image hashes
    // Support both old (image_hash) and new (image_hashes) schema
    const { data: products, error } = await supabase
      .from('products')
      .select('*')
      .eq('workspace_id', workspaceId)
      .or('image_hash.not.is.null,image_hashes.not.is.null');

    if (error) {
      console.error('Error fetching products:', error);
      throw new Error('Failed to fetch products from database');
    }

    if (!products || products.length === 0) {
      return {
        product: null,
        confidence: 0,
        distance: 64, // Maximum distance
      };
    }

    // Zone 1: High confidence (distance 0-4)
    const HIGH_CONFIDENCE_THRESHOLD = 5;
    // Zone 2: Low confidence (distance 5-11)
    const LOW_CONFIDENCE_THRESHOLD = 12;

    // Find the best and second-best matches
    let bestMatch: Product | null = null;
    let bestDistance = 65;
    let bestHashIndex = -1;

    let secondBestMatch: Product | null = null;
    let secondBestDistance = 65;

    for (const product of products) {
      // Get hashes array (support both old and new schema)
      let productHashes: string[] = [];
      
      if (product.image_hashes && Array.isArray(product.image_hashes)) {
        productHashes = product.image_hashes;
      } else if (product.image_hash) {
        productHashes = [product.image_hash];
      }

      if (productHashes.length === 0) continue;

      let productMinDistance = 65;
      let productHashIndex = -1;

      for (let i = 0; i < productHashes.length; i++) {
        const productHash = productHashes[i];
        if (!productHash) continue;

        const distance = hammingDistance(imageHash, productHash);
        if (distance < productMinDistance) {
          productMinDistance = distance;
          productHashIndex = i;
        }
      }

      // Track global best and second best (different products)
      if (productMinDistance < bestDistance) {
        // Move current best to second best if it's a different product
        if (bestMatch && bestMatch.id !== product.id) {
          secondBestDistance = bestDistance;
          secondBestMatch = bestMatch;
        }
        bestDistance = productMinDistance;
        bestMatch = product;
        bestHashIndex = productHashIndex;
      } else if (productMinDistance < secondBestDistance && (!bestMatch || product.id !== bestMatch.id)) {
        secondBestDistance = productMinDistance;
        secondBestMatch = product;
      }
    }

    // Zone 1: High confidence — confirmed match
    if (bestMatch && bestDistance < HIGH_CONFIDENCE_THRESHOLD) {
      const confidence = ((64 - bestDistance) / 64) * 100;
      const hashTypes = ['full', 'center', 'square'];
      console.log(`  ✓ TIER 1 (HIGH): Matched via ${hashTypes[bestHashIndex] || 'unknown'} hash`);

      return {
        product: bestMatch,
        confidence: Math.round(confidence * 100) / 100,
        distance: bestDistance,
        matchedHashIndex: bestHashIndex,
        zone: 'high'
      };
    }

    // Zone 2: Low confidence — only valid if gap between 1st and 2nd is significant
    if (bestMatch && bestDistance < LOW_CONFIDENCE_THRESHOLD) {
      const gap = secondBestDistance - bestDistance;
      console.log(`  ⚠️ TIER 1 (LOW): Distance ${bestDistance}, Gap to 2nd best: ${gap}`);

      // Gap must be at least 3 bits — proves this product is meaningfully closer
      if (gap >= 3) {
        const confidence = ((64 - bestDistance) / 64) * 100;
        return {
          product: bestMatch,
          confidence: Math.round(confidence * 100) / 100,
          distance: bestDistance,
          matchedHashIndex: bestHashIndex,
          zone: 'low'
        };
      }
      // Gap too small — products look too similar, not safe to match
      console.log(`  ❌ TIER 1 (LOW REJECTED): Gap ${gap} is too small (< 3)`);
    }

    // No match found within threshold
    return {
      product: null,
      confidence: 0,
      distance: bestDistance,
    };
  } catch (error) {
    console.error('Error in findTier1Match:', error);
    throw error;
  }
}
