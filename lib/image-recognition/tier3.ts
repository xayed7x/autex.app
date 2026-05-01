import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';
import { logApiUsage } from '@/lib/ai/usage-tracker';

type Product = Database['public']['Tables']['products']['Row'];

/**
 * AI analysis result from OpenAI Vision
 */
export interface AIAnalysisResult {
  category?: string;
  color?: string;
  decoration?: string;
  visual_description_keywords?: string[];
  text_on_cake?: string;
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
              text: `Analyze this cake or food product image and extract key information. 
Return ONLY valid JSON in this exact format:
{
  "category": "cake category (e.g., chocolate, vanilla, fruit, anniversary, birthday, wedding, black forest, red velvet, butterscotch)",
  "color": "dominant frosting/cream color (e.g., white, brown, pink, green, black)",
  "decoration": "decoration style (e.g., floral, drip, fondant, minimalist, fruit topping)",
  "visual_description_keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "text_on_cake": "any visible text or writing on the cake, or null"
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
 * Finds a matching product using Tier 3 (AI Vision) algorithm
 * 
 * @param aiAnalysis - AI analysis result
 * @param workspaceId - Workspace ID to search within
 * @returns Match result with product, confidence, and AI analysis
 */
export async function findTier3Match(
  aiAnalysis: AIAnalysisResult,
  workspaceId: string,
  businessCategory: string = 'generic',
  options: { hintProductId?: string | null } = {}
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

    // Filter products for food business: must have cake_category defined
    let filteredProducts = products;
    if (businessCategory === 'food') {
      filteredProducts = products.filter(p => (p as any).cake_category !== null);
    }

    // Score each product based on AI analysis
    let bestMatch: Product | null = null;
    let bestScore = 0;

    for (const product of filteredProducts) {
      let score = 0;

      // Tier 1 Hint Bonus (+30 points)
      if (options.hintProductId && product.id === options.hintProductId) {
        score += 30;
        console.log(`  💡 Tier 1 Hint Match (${product.name}): +30 bonus`);
      }

      const productKeywords: string[] = Array.isArray(product.search_keywords) 
        ? product.search_keywords
        : [];

      // MAGIC UPLOAD SCORING: Use auto-generated keywords for matching

      // Category match: Check if category exists in keywords (+10 points)
      if (aiAnalysis.category && productKeywords.length > 0) {
        const categoryLower = aiAnalysis.category.toLowerCase();
        const hasCategoryMatch = productKeywords.some((keyword: string) =>
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
        const hasColorMatch = productKeywords.some((keyword: string) =>
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
          const hasMatch = productKeywords.some((keyword: string) =>
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

      // Decoration match (+15 points)
      if (aiAnalysis.decoration && productKeywords.length > 0) {
        const decoLower = aiAnalysis.decoration.toLowerCase();
        const productText = `${product.name} ${product.description || ''} ${productKeywords.join(' ')}`.toLowerCase();
        if (productText.includes(decoLower)) {
          score += 15;
          console.log(`  ✓ Decoration match: +15`);
        }
      }

      // Text on cake boost (+25 points)
      if (aiAnalysis.text_on_cake && aiAnalysis.text_on_cake !== 'null' && aiAnalysis.text_on_cake !== 'none') {
        const cakeText = aiAnalysis.text_on_cake.toLowerCase();
        const productText = `${product.name} ${product.description || ''}`.toLowerCase();
        if (productText.includes(cakeText)) {
          score += 25;
          console.log(`  ✓ Text on cake boost: +25`);
        }
      }

      // Fallback: If no keywords, use old method (name + description)
      if (productKeywords.length === 0) {
        console.log(`  ⚠️ Product has no keywords, using fallback matching`);
        
        // Category fallback (using search_keywords instead of category)
        if (aiAnalysis.category && productKeywords.length > 0) {
          const categoryMatch = productKeywords.some((k: string) => k.toLowerCase().includes(aiAnalysis.category!.toLowerCase()));
          if (categoryMatch) score += 10;
        }

        // Color fallback (using colors array)
        if (aiAnalysis.color) {
          const colorLower = aiAnalysis.color.toLowerCase();
          if (product.colors && product.colors.length > 0) {
            const hasColorMatch = product.colors.some((c: string) =>
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

        // Brand/Decoration fallback
        if (aiAnalysis.decoration) {
          const decoLower = aiAnalysis.decoration.toLowerCase();
          const productText = `${product.name} ${product.description || ''}`.toLowerCase();
          if (productText.includes(decoLower)) {
            score += 15;
          }
        }
      }

      // Update best match with tie-breaking
      if (score > bestScore) {
        bestScore = score;
        bestMatch = product;
      } else if (score === bestScore && score > 0) {
        // Tie-breaking: Prefer product with higher price_per_pound
        const currentPricePerPound = (product as any).price_per_pound || 0;
        const bestPricePerPound = (bestMatch as any)?.price_per_pound || 0;
        if (currentPricePerPound > bestPricePerPound) {
          bestMatch = product;
          console.log(`  ⚖️ Tie-break: selected ${product.name} (Higher Price/lb)`);
        }
      }
    }

    // Threshold: score >= 60 for food, 50 for others
    const MATCH_THRESHOLD = businessCategory === 'food' ? 60 : 50;

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
