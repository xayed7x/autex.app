import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';

type Product = Database['public']['Tables']['products']['Row'];

/**
 * AI analysis result from OpenAI Vision
 */
export interface AIAnalysisResult {
  category?: string;
  color?: string;
  material?: string;
  visual_description_keywords?: string[];
  brand_text?: string;
}

/**
 * Tier 3 match result
 */
export interface Tier3MatchResult {
  product: Product | null;
  confidence: number;
  aiAnalysis: AIAnalysisResult;
  cost: {
    inputTokens: number;
    outputTokens: number;
    totalCost: number; // in USD
  };
}

/**
 * Token cost rates for GPT-4o-mini
 */
const COST_RATES = {
  INPUT_PER_MILLION: 0.15, // $0.15 per 1M input tokens
  OUTPUT_PER_MILLION: 0.60, // $0.60 per 1M output tokens
};

/**
 * Converts an image URL to Base64 data URI
 * Required for Facebook CDN URLs that OpenAI cannot access directly
 * 
 * @param url - Image URL to download and convert
 * @returns Base64 data URI string (data:image/jpeg;base64,...)
 */
async function urlToBase64(url: string): Promise<string> {
  try {
    console.log('📥 Downloading image from URL...');
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Detect content type from response headers
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    
    // Convert to Base64
    const base64 = buffer.toString('base64');
    const dataUri = `data:${contentType};base64,${base64}`;
    
    console.log(`✓ Image converted to Base64 (${Math.round(buffer.length / 1024)}KB)`);
    
    return dataUri;
  } catch (error) {
    console.error('Error converting URL to Base64:', error);
    throw new Error('Failed to download and convert image');
  }
}

/**
 * Analyzes an image using OpenAI GPT-4o-mini Vision
 * 
 * @param imageUrl - Public URL of the image to analyze
 * @returns AI analysis result with token usage and cost
 */
export async function analyzeImageWithAI(
  imageUrl: string
): Promise<{ analysis: AIAnalysisResult; usage: any }> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  try {
    console.log('🤖 Calling OpenAI Vision API...');

    // Convert URL to Base64 (required for Facebook CDN URLs)
    const base64Image = await urlToBase64(imageUrl);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this product image and extract key information. Return ONLY valid JSON in this exact format:
{
  "category": "product category (e.g., clothing, electronics, furniture)",
  "color": "dominant color name",
  "material": "material type if visible",
  "visual_description_keywords": ["keyword1", "keyword2", "keyword3"],
  "brand_text": "any visible brand/text on product"
}`,
            },
            {
              type: 'image_url',
              image_url: {
                url: base64Image, // Use Base64 data URI instead of raw URL
                detail: 'low', // Use low detail to save tokens
              },
            },
          ],
        },
      ],
      max_tokens: 300,
      temperature: 0.3, // Lower temperature for more consistent results
    });

    const content = response.choices[0]?.message?.content || '{}';
    const usage = response.usage;

    console.log('✓ OpenAI response received');
    console.log('  Tokens:', usage);

    // Parse the response, handling potential markdown wrapping
    let analysis: AIAnalysisResult;
    try {
      // Remove markdown code blocks if present
      let cleanedContent = content.trim();
      if (cleanedContent.startsWith('```json')) {
        cleanedContent = cleanedContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanedContent.startsWith('```')) {
        cleanedContent = cleanedContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      analysis = JSON.parse(cleanedContent);
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
      throw new Error('Invalid JSON response from OpenAI');
    }

    return { analysis, usage };
  } catch (error) {
    console.error('Error calling OpenAI Vision API:', error);
    throw error;
  }
}

/**
 * Calculates the cost of an OpenAI API call
 * 
 * @param usage - Token usage from OpenAI response
 * @returns Cost in USD
 */
export function calculateCost(usage: {
  prompt_tokens: number;
  completion_tokens: number;
}): number {
  const inputCost = (usage.prompt_tokens / 1_000_000) * COST_RATES.INPUT_PER_MILLION;
  const outputCost = (usage.completion_tokens / 1_000_000) * COST_RATES.OUTPUT_PER_MILLION;
  return inputCost + outputCost;
}

/**
 * Tracks API usage and cost in the database
 * 
 * @param workspaceId - Workspace ID
 * @param imageHash - Image hash
 * @param cost - Cost in USD
 */
export async function trackAPIUsage(
  workspaceId: string,
  imageHash: string,
  cost: number
): Promise<void> {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    await supabase.from('api_usage').insert({
      workspace_id: workspaceId,
      api_type: 'openai_vision',
      cost,
      image_hash: imageHash,
    });

    console.log(`✓ Tracked API usage: $${cost.toFixed(6)}`);
  } catch (error) {
    console.error('Error tracking API usage:', error);
    // Don't throw - tracking failures shouldn't break the main flow
  }
}

/**
 * Finds a matching product using Tier 3 (AI Vision) algorithm
 * 
 * @param aiAnalysis - AI analysis result
 * @param workspaceId - Workspace ID to search within
 * @returns Match result with product, confidence, and AI analysis
 */
export async function findTier3Match(
  aiAnalysis: AIAnalysisResult,
  workspaceId: string
): Promise<Omit<Tier3MatchResult, 'cost'>> {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    // Fetch all products in the workspace
    const { data: products, error } = await supabase
      .from('products')
      .select('*')
      .eq('workspace_id', workspaceId);

    if (error || !products || products.length === 0) {
      return {
        product: null,
        confidence: 0,
        aiAnalysis,
      };
    }

    // Score each product based on AI analysis
    let bestMatch: Product | null = null;
    let bestScore = 0;

    for (const product of products) {
      let score = 0;
      const productKeywords = product.search_keywords || [];

      // MAGIC UPLOAD SCORING: Use auto-generated keywords for matching

      // Category match: Check if category exists in keywords (+10 points)
      if (aiAnalysis.category && productKeywords.length > 0) {
        const categoryLower = aiAnalysis.category.toLowerCase();
        const hasCategoryMatch = productKeywords.some(keyword =>
          keyword.toLowerCase().includes(categoryLower) || categoryLower.includes(keyword.toLowerCase())
        );
        if (hasCategoryMatch) {
          score += 10;
          console.log(`  ✓ Category match in keywords: +10`);
        }
      }

      // Color match: Check if color exists in keywords (+15 points)
      if (aiAnalysis.color && productKeywords.length > 0) {
        const colorLower = aiAnalysis.color.toLowerCase();
        const hasColorMatch = productKeywords.some(keyword =>
          keyword.toLowerCase().includes(colorLower) || colorLower.includes(keyword.toLowerCase())
        );
        if (hasColorMatch) {
          score += 15;
          console.log(`  ✓ Color match in keywords: +15`);
        }
      }

      // Keyword match: Check how many AI keywords exist in product keywords (+12 per match)
      if (aiAnalysis.visual_description_keywords && aiAnalysis.visual_description_keywords.length > 0 && productKeywords.length > 0) {
        let matchedCount = 0;
        for (const aiKeyword of aiAnalysis.visual_description_keywords) {
          const aiKeywordLower = aiKeyword.toLowerCase();
          const hasMatch = productKeywords.some(keyword =>
            keyword.toLowerCase().includes(aiKeywordLower) || aiKeywordLower.includes(keyword.toLowerCase())
          );
          if (hasMatch) matchedCount++;
        }
        
        if (matchedCount > 0) {
          const keywordScore = matchedCount * 12; // Increased from 10 to 12
          score += keywordScore;
          console.log(`  ✓ Keyword matches (${matchedCount}): +${keywordScore}`);
        }
      }

      // Brand/text match: Check if brand exists in keywords (+20 points)
      if (aiAnalysis.brand_text && productKeywords.length > 0) {
        const brandLower = aiAnalysis.brand_text.toLowerCase();
        const hasBrandMatch = productKeywords.some(keyword =>
          keyword.toLowerCase().includes(brandLower) || brandLower.includes(keyword.toLowerCase())
        );
        if (hasBrandMatch) {
          score += 20;
          console.log(`  ✓ Brand match in keywords: +20`);
        }
      }

      // Fallback: If no keywords, use old method (name + description)
      if (productKeywords.length === 0) {
        console.log(`  ⚠️ Product has no keywords, using fallback matching`);
        
        // Category fallback
        if (aiAnalysis.category && product.category) {
          const categoryMatch = product.category.toLowerCase().includes(aiAnalysis.category.toLowerCase()) ||
                               aiAnalysis.category.toLowerCase().includes(product.category.toLowerCase());
          if (categoryMatch) score += 10;
        }

        // Color fallback
        if (aiAnalysis.color) {
          const colorLower = aiAnalysis.color.toLowerCase();
          if (product.dominant_colors) {
            const hasColorMatch = product.dominant_colors.some(c =>
              c.toLowerCase().includes(colorLower) || colorLower.includes(c.toLowerCase())
            );
            if (hasColorMatch) score += 15;
          }
        }

        // Keyword fallback
        if (aiAnalysis.visual_description_keywords && aiAnalysis.visual_description_keywords.length > 0) {
          const productText = `${product.name} ${product.description || ''}`.toLowerCase();
          const matchedKeywords = aiAnalysis.visual_description_keywords.filter(keyword =>
            productText.includes(keyword.toLowerCase())
          );
          score += matchedKeywords.length * 5; // Lower weight for fallback
        }

        // Brand fallback
        if (aiAnalysis.brand_text) {
          const brandLower = aiAnalysis.brand_text.toLowerCase();
          const productText = `${product.name} ${product.description || ''}`.toLowerCase();
          if (productText.includes(brandLower)) {
            score += 20;
          }
        }
      }

      // Update best match
      if (score > bestScore) {
        bestScore = score;
        bestMatch = product;
      }
    }

    // Threshold: score >= 30 is considered a match (lowered to reduce false negatives)
    const MATCH_THRESHOLD = 30;

    if (bestMatch && bestScore > MATCH_THRESHOLD) {
      console.log(`  🎯 Best match: ${bestMatch.name} (score: ${bestScore})`);
      return {
        product: bestMatch,
        confidence: Math.round(bestScore * 100) / 100,
        aiAnalysis,
      };
    }

    console.log(`  ❌ No match found (best score: ${bestScore}, threshold: ${MATCH_THRESHOLD})`);
    return {
      product: null,
      confidence: 0,
      aiAnalysis,
    };
  } catch (error) {
    console.error('Error in findTier3Match:', error);
    throw error;
  }
}
