import { NextRequest, NextResponse } from 'next/server';
import { generateImageHash } from '@/lib/image-recognition/hash';
import { findTier1Match } from '@/lib/image-recognition/tier1';
import { extractVisualFeatures, findTier2Match } from '@/lib/image-recognition/tier2';
import { checkCache, saveToCache } from '@/lib/image-recognition/cache';
import {
  analyzeImageWithAI,
  findTier3Match,
  calculateCost,
  trackAPIUsage,
} from '@/lib/image-recognition/tier3';
import { uploadToCloudinary } from '@/lib/cloudinary/upload';

/**
 * POST /api/image-recognition
 * 
 * Accepts an image (via URL or file upload) and attempts to match it
 * with products in the workspace using a 3-tier waterfall approach:
 * 1. Tier 1: Hamming Distance (fast, exact matches)
 * 2. Tier 2: Visual Features (fallback for compressed/cropped images)
 * 3. Cache Check: Look for previously analyzed images
 * 4. Tier 3: OpenAI Vision (AI-powered analysis for complex cases)
 * 
 * Request body:
 * - imageUrl: string (optional) - URL of the image to analyze
 * - file: File (optional) - Image file to analyze
 * - workspaceId: string (required) - Workspace ID to search within
 * 
 * Response:
 * - success: boolean
 * - match: { product, confidence, ... } | null
 * - tier: 'tier1' | 'tier2' | 'tier3' | 'cache' | 'none'
 * - cost?: { inputTokens, outputTokens, totalCost }
 * - error?: string
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const formData = await request.formData();
    const imageUrl = formData.get('imageUrl') as string | null;
    const file = formData.get('file') as File | null;
    const workspaceId = formData.get('workspaceId') as string | null;

    // Validate input
    if (!workspaceId) {
      return NextResponse.json(
        { success: false, error: 'workspaceId is required' },
        { status: 400 }
      );
    }

    if (!imageUrl && !file) {
      return NextResponse.json(
        { success: false, error: 'Either imageUrl or file must be provided' },
        { status: 400 }
      );
    }

    // Get image buffer and URL
    let imageBuffer: Buffer;
    let publicImageUrl: string | null = null;

    if (file) {
      // Handle file upload
      const arrayBuffer = await file.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);
      
      // Upload to Cloudinary to get a public URL for OpenAI (if needed for Tier 3)
      try {
        const uploadResult = await uploadToCloudinary(imageBuffer);
        publicImageUrl = uploadResult.secure_url;
      } catch (uploadError) {
        console.warn('Failed to upload to Cloudinary, Tier 3 may not work:', uploadError);
      }
    } else if (imageUrl) {
      // Handle image URL
      publicImageUrl = imageUrl;
      const response = await fetch(imageUrl);
      if (!response.ok) {
        return NextResponse.json(
          { success: false, error: 'Failed to fetch image from URL' },
          { status: 400 }
        );
      }
      const arrayBuffer = await response.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);
    } else {
      return NextResponse.json(
        { success: false, error: 'Invalid image input' },
        { status: 400 }
      );
    }

    // Generate hash for the incoming image
    console.log('📸 Generating image hash...');
    const imageHash = await generateImageHash(imageBuffer);
    console.log('  Hash:', imageHash);

    // ========================================
    // TIER 1: Hamming Distance Match
    // ========================================
    console.log('\n🔍 TIER 1: Attempting Hamming Distance match...');
    const tier1Result = await findTier1Match(imageHash, workspaceId);

    if (tier1Result.product) {
      console.log('✅ TIER 1 MATCH FOUND:', tier1Result.product.name);
      console.log(`   Confidence: ${tier1Result.confidence}%`);
      console.log(`   Time: ${Date.now() - startTime}ms`);
      
      return NextResponse.json({
        success: true,
        match: {
          product: tier1Result.product,
          confidence: tier1Result.confidence,
          distance: tier1Result.distance,
        },
        tier: 'tier1',
        imageHash,
        processingTime: Date.now() - startTime,
      });
    }
    console.log('❌ Tier 1: No match (distance:', tier1Result.distance, ')');

    // ========================================
    // TIER 2: Visual Features Match
    // ========================================
    console.log('\n🎨 TIER 2: Attempting Visual Features match...');
    const visualFeatures = await extractVisualFeatures(imageBuffer);
    const tier2Result = await findTier2Match(visualFeatures, workspaceId);

    if (tier2Result.product) {
      console.log('✅ TIER 2 MATCH FOUND:', tier2Result.product.name);
      console.log(`   Confidence: ${tier2Result.confidence}%`);
      console.log(`   Time: ${Date.now() - startTime}ms`);
      
      return NextResponse.json({
        success: true,
        match: {
          product: tier2Result.product,
          confidence: tier2Result.confidence,
          scores: tier2Result.scores,
        },
        tier: 'tier2',
        imageHash,
        visualFeatures,
        processingTime: Date.now() - startTime,
      });
    }
    console.log('❌ Tier 2: No match (score:', tier2Result.scores.totalScore, ')');

    // ========================================
    // CACHE CHECK: Look for cached results
    // ========================================
    console.log('\n💾 CACHE: Checking for cached results...');
    const cachedResult = await checkCache(imageHash);

    if (cachedResult && cachedResult.productId) {
      console.log('✅ CACHE HIT: Found cached result');
      console.log(`   Time: ${Date.now() - startTime}ms`);
      
      // Fetch the product details
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      
      const { data: product } = await supabase
        .from('products')
        .select('*')
        .eq('id', cachedResult.productId)
        .single();

      if (product) {
        return NextResponse.json({
          success: true,
          match: {
            product,
            confidence: cachedResult.confidence,
            aiAnalysis: cachedResult.aiResponse,
          },
          tier: 'cache',
          imageHash,
          processingTime: Date.now() - startTime,
        });
      }
    }
    console.log('❌ Cache: No valid cached result');

    // ========================================
    // TIER 3: OpenAI Vision (AI Analysis)
    // ========================================
    if (!publicImageUrl) {
      console.log('⚠️  TIER 3: Skipped (no public image URL available)');
      return NextResponse.json({
        success: true,
        match: null,
        tier: 'none',
        imageHash,
        message: 'No matching product found (Tier 3 unavailable)',
        debug: {
          tier1Distance: tier1Result.distance,
          tier2Scores: tier2Result.scores,
        },
        processingTime: Date.now() - startTime,
      });
    }

    console.log('\n🤖 TIER 3: Attempting OpenAI Vision analysis...');
    try {
      // Analyze image with OpenAI
      const { analysis, usage } = await analyzeImageWithAI(publicImageUrl);
      console.log('  AI Analysis:', analysis);

      // Calculate cost
      const cost = calculateCost(usage);
      console.log(`  Cost: $${cost.toFixed(6)}`);

      // Track API usage
      await trackAPIUsage(workspaceId, imageHash, cost);

      // Find match based on AI analysis
      const tier3Result = await findTier3Match(analysis, workspaceId);

      if (tier3Result.product) {
        console.log('✅ TIER 3 MATCH FOUND:', tier3Result.product.name);
        console.log(`   Confidence: ${tier3Result.confidence}%`);
        console.log(`   Time: ${Date.now() - startTime}ms`);

        // Save to cache
        await saveToCache(imageHash, {
          confidence: tier3Result.confidence,
          productId: tier3Result.product.id,
          aiResponse: analysis,
        });

        return NextResponse.json({
          success: true,
          match: {
            product: tier3Result.product,
            confidence: tier3Result.confidence,
            aiAnalysis: analysis,
          },
          tier: 'tier3',
          imageHash,
          cost: {
            inputTokens: usage.prompt_tokens,
            outputTokens: usage.completion_tokens,
            totalCost: cost,
          },
          processingTime: Date.now() - startTime,
        });
      }

      console.log('❌ Tier 3: No match (score:', tier3Result.confidence, ')');

      // Save negative result to cache to avoid re-analyzing
      await saveToCache(imageHash, {
        confidence: 0,
        productId: null,
        aiResponse: analysis,
      });

      return NextResponse.json({
        success: true,
        match: null,
        tier: 'none',
        imageHash,
        message: 'No matching product found after AI analysis',
        aiAnalysis: analysis,
        cost: {
          inputTokens: usage.prompt_tokens,
          outputTokens: usage.completion_tokens,
          totalCost: cost,
        },
        debug: {
          tier1Distance: tier1Result.distance,
          tier2Scores: tier2Result.scores,
          tier3Confidence: tier3Result.confidence,
        },
        processingTime: Date.now() - startTime,
      });

    } catch (aiError) {
      console.error('❌ Tier 3 Error:', aiError);
      
      // Return failure but don't crash
      return NextResponse.json({
        success: true,
        match: null,
        tier: 'none',
        imageHash,
        message: 'No matching product found (Tier 3 failed)',
        error: aiError instanceof Error ? aiError.message : 'AI analysis failed',
        debug: {
          tier1Distance: tier1Result.distance,
          tier2Scores: tier2Result.scores,
        },
        processingTime: Date.now() - startTime,
      });
    }

  } catch (error) {
    console.error('❌ Error in image recognition API:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
