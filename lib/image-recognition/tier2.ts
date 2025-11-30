import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';

// Import colorthief - note: we'll use it in a Node.js compatible way
const ColorThief = require('colorthief');

type Product = Database['public']['Tables']['products']['Row'];

/**
 * RGB color representation
 */
export interface RGBColor {
  r: number;
  g: number;
  b: number;
}

/**
 * Visual features extracted from an image
 */
export interface VisualFeatures {
  aspectRatio: number;
  dominantColors: RGBColor[];
}

/**
 * Result of Tier 2 matching
 */
export interface Tier2MatchResult {
  product: Product | null;
  confidence: number;
  scores: {
    colorScore: number;
    aspectRatioScore: number;
    totalScore: number;
  };
}

/**
 * Extracts visual features from an image buffer
 * 
 * @param imageBuffer - Image file buffer
 * @returns Visual features (aspect ratio and dominant colors)
 */
export async function extractVisualFeatures(
  imageBuffer: Buffer
): Promise<VisualFeatures> {
  try {
    // Get image metadata for aspect ratio
    const metadata = await sharp(imageBuffer).metadata();
    const width = metadata.width || 1;
    const height = metadata.height || 1;
    const aspectRatio = width / height;

    // Extract dominant colors using colorthief
    // Convert buffer to a format colorthief can use
    const dominantColors: RGBColor[] = [];
    
    try {
      // Get palette of 3 colors
      const palette = await ColorThief.getPalette(imageBuffer, 3);
      
      // Convert to RGB objects
      for (const color of palette) {
        dominantColors.push({
          r: color[0],
          g: color[1],
          b: color[2],
        });
      }
    } catch (colorError) {
      console.warn('ColorThief failed, using sharp stats as fallback:', colorError);
      
      // Fallback: Use sharp stats to get average color
      const stats = await sharp(imageBuffer).stats();
      
      // Get the dominant color from each channel's mean
      dominantColors.push({
        r: Math.round(stats.channels[0].mean),
        g: Math.round(stats.channels[1].mean),
        b: Math.round(stats.channels[2].mean),
      });
      
      // Add two variations for better matching
      dominantColors.push({
        r: Math.round(stats.channels[0].mean * 0.8),
        g: Math.round(stats.channels[1].mean * 0.8),
        b: Math.round(stats.channels[2].mean * 0.8),
      });
      
      dominantColors.push({
        r: Math.round(Math.min(255, stats.channels[0].mean * 1.2)),
        g: Math.round(Math.min(255, stats.channels[1].mean * 1.2)),
        b: Math.round(Math.min(255, stats.channels[2].mean * 1.2)),
      });
    }

    return {
      aspectRatio,
      dominantColors,
    };
  } catch (error) {
    console.error('Error extracting visual features:', error);
    throw new Error('Failed to extract visual features');
  }
}

/**
 * Calculates Euclidean distance between two RGB colors
 * 
 * @param color1 - First RGB color
 * @param color2 - Second RGB color
 * @returns Distance (0 = identical, 441.67 = max difference)
 */
function colorDistance(color1: RGBColor, color2: RGBColor): number {
  const rDiff = color1.r - color2.r;
  const gDiff = color1.g - color2.g;
  const bDiff = color1.b - color2.b;
  
  return Math.sqrt(rDiff * rDiff + gDiff * gDiff + bDiff * bDiff);
}

/**
 * Calculates color similarity score between input and product colors
 * Primary color (first) has more weight to prevent false positives
 * 
 * @param inputColors - Dominant colors from input image
 * @param productColors - Dominant colors from product
 * @returns Score from 0 to 100 (100 = perfect match)
 */
function calculateColorScore(
  inputColors: RGBColor[],
  productColors: RGBColor[]
): number {
  if (productColors.length === 0) return 0;

  let totalScore = 0;
  const maxDistance = Math.sqrt(255 * 255 * 3); // ~441.67

  // Weight for each color (primary color has more weight)
  const weights = [0.5, 0.3, 0.2]; // First color: 50%, Second: 30%, Third: 20%

  // For each input color, find the closest product color
  for (let i = 0; i < inputColors.length; i++) {
    const inputColor = inputColors[i];
    let minDistance = Infinity;
    
    for (const productColor of productColors) {
      const distance = colorDistance(inputColor, productColor);
      minDistance = Math.min(minDistance, distance);
    }
    
    // Convert distance to similarity score (0-100)
    const similarity = (1 - minDistance / maxDistance) * 100;
    const weight = weights[i] || 0.1; // Use weight or small default
    totalScore += similarity * weight;
  }

  return totalScore / (weights[0] + weights[1] + weights[2]); // Normalize
}

/**
 * Calculates aspect ratio similarity score
 * 
 * @param inputRatio - Aspect ratio of input image
 * @param productRatio - Aspect ratio of product image
 * @returns Score from 0 to 100 (100 = identical ratio)
 */
function calculateAspectRatioScore(
  inputRatio: number,
  productRatio: number
): number {
  const difference = Math.abs(inputRatio - productRatio);
  
  // If difference is > 1, it's very different
  if (difference > 1) return 0;
  
  // Convert to 0-100 scale
  return (1 - difference) * 100;
}

/**
 * Finds a matching product using Tier 2 (Visual Features) algorithm
 * This is a fallback when Tier 1 fails due to compression/cropping
 * 
 * @param features - Visual features extracted from customer's image
 * @param workspaceId - Workspace ID to search within
 * @returns Match result with product, confidence, and detailed scores
 */
export async function findTier2Match(
  features: VisualFeatures,
  workspaceId: string
): Promise<Tier2MatchResult> {
  // Create Supabase admin client for server-side operations
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    // Fetch all products in the workspace that have visual features
    const { data: products, error } = await supabase
      .from('products')
      .select('*')
      .eq('workspace_id', workspaceId)
      .not('visual_features', 'is', null);

    if (error) {
      console.error('Error fetching products:', error);
      throw new Error('Failed to fetch products from database');
    }

    if (!products || products.length === 0) {
      return {
        product: null,
        confidence: 0,
        scores: {
          colorScore: 0,
          aspectRatioScore: 0,
          totalScore: 0,
        },
      };
    }

    // Find the best match by calculating visual similarity scores
    let bestMatch: Product | null = null;
    let bestScores = {
      colorScore: 0,
      aspectRatioScore: 0,
      totalScore: 0,
    };

    for (const product of products) {
      if (!product.visual_features) continue;

      const productFeatures = product.visual_features as unknown as VisualFeatures;

      // Calculate color score (60% weight)
      const colorScore = calculateColorScore(
        features.dominantColors,
        productFeatures.dominantColors
      );

      // Calculate aspect ratio score (40% weight)
      const aspectRatioScore = calculateAspectRatioScore(
        features.aspectRatio,
        productFeatures.aspectRatio
      );

      // PRIMARY COLOR PENALTY: If primary colors are very different, apply penalty
      let primaryColorPenalty = 0;
      if (features.dominantColors.length > 0 && productFeatures.dominantColors.length > 0) {
        const primaryDistance = colorDistance(
          features.dominantColors[0],
          productFeatures.dominantColors[0]
        );
        
        // If primary colors differ by more than 50 (out of ~441), apply 30% penalty
        if (primaryDistance > 50) {
          primaryColorPenalty = 30;
          console.log(`  ⚠️ Primary color mismatch (distance: ${Math.round(primaryDistance)}), penalty: -30%`);
        }
      }

      // Calculate weighted total score with penalty
      let totalScore = colorScore * 0.6 + aspectRatioScore * 0.4 - primaryColorPenalty;
      totalScore = Math.max(0, totalScore); // Ensure non-negative

      // Update best match if this is better
      if (totalScore > bestScores.totalScore) {
        bestScores = {
          colorScore: Math.round(colorScore * 100) / 100,
          aspectRatioScore: Math.round(aspectRatioScore * 100) / 100,
          totalScore: Math.round(totalScore * 100) / 100,
        };
        bestMatch = product;
      }
    }

    // Threshold: total score > 92% is considered a match (STRICT to prevent false positives)
    const MATCH_THRESHOLD = 92;

    if (bestMatch && bestScores.totalScore > MATCH_THRESHOLD) {
      return {
        product: bestMatch,
        confidence: bestScores.totalScore,
        scores: bestScores,
      };
    }

    // No match found within threshold
    return {
      product: null,
      confidence: 0,
      scores: bestScores,
    };
  } catch (error) {
    console.error('Error in findTier2Match:', error);
    throw error;
  }
}
