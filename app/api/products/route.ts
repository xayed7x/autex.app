import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { uploadToCloudinary } from '@/lib/cloudinary/upload';
import { generateImageHash } from '@/lib/image-recognition/hash';
import { extractVisualFeatures } from '@/lib/image-recognition/tier2';
import { validateProductFormData } from '@/lib/validations/product';

/**
 * GET /api/products
 * List products with pagination
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || '';

    const category = searchParams.get('category') || 'all';
    const stock = searchParams.get('stock') || 'all';
    const sort = searchParams.get('sort') || 'recent';

    // Get authenticated user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Fetch user's workspace
    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .select('id')
      .eq('owner_id', user.id)
      .single();

    if (workspaceError || !workspace) {
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 400 }
      );
    }

    // Build query
    let query = supabase
      .from('products')
      .select('id, name, price, stock_quantity, description, image_urls, colors, sizes, size_stock, variant_stock, pricing_policy, product_attributes, created_at, updated_at', { count: 'exact' })
      .eq('workspace_id', workspace.id);

    // Apply filters
    if (search) {
      query = query.ilike('name', `%${search}%`);
    }

    if (category !== 'all') {
      query = query.eq('category', category);
    }

    if (stock === 'instock') {
      query = query.gt('stock_quantity', 0);
    } else if (stock === 'outofstock') {
      query = query.eq('stock_quantity', 0);
    }

    // Apply sorting
    switch (sort) {
      case 'name-asc':
        query = query.order('name', { ascending: true });
        break;
      case 'name-desc':
        query = query.order('name', { ascending: false });
        break;
      case 'price-low':
        query = query.order('price', { ascending: true });
        break;
      case 'price-high':
        query = query.order('price', { ascending: false });
        break;
      case 'recent':
      default:
        query = query.order('created_at', { ascending: false });
        break;
    }

    // Add pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    const { data: products, error, count } = await query;

    if (error) {
      console.error('Error fetching products:', error);
      return NextResponse.json(
        { error: 'Failed to fetch products' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      products,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error) {
    console.error('Error in GET /api/products:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/products
 * Create a new product with image upload
 */
export async function POST(request: NextRequest) {
  try {
    console.log('POST /api/products - Starting product creation');
    const formData = await request.formData();

    // Validate product data
    console.log('Validating product data...');
    const productData = validateProductFormData(formData);
    console.log('Product data validated:', productData);

    // Images are now handled in the MULTI-IMAGE PROCESSING section below

    // Get authenticated user
    console.log('Getting authenticated user...');
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('Auth error:', authError);
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.log('User authenticated:', user.id);

    // Fetch user's workspace
    console.log('Fetching workspace...');
    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .select('id')
      .eq('owner_id', user.id)
      .single();

    if (workspaceError || !workspace) {
      console.error('Workspace error:', workspaceError);
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 400 }
      );
    }
    console.log('Workspace found:', workspace.id);

    // ========================================
    // MULTI-IMAGE PROCESSING
    // ========================================
    
    // Collect all image files (image_0, image_1, etc.)
    const imageFiles: File[] = [];
    const newImageCount = parseInt(formData.get('new_image_count') as string || '0');
    
    // For backward compatibility, also check for old 'image' field
    const legacyImage = formData.get('image') as File;
    if (legacyImage && legacyImage.size > 0) {
      imageFiles.push(legacyImage);
    } else {
      // New multi-image format
      for (let i = 0; i < newImageCount; i++) {
        const file = formData.get(`image_${i}`) as File;
        if (file && file.size > 0) {
          imageFiles.push(file);
        }
      }
    }
    
    // Get existing URLs to preserve (when editing)
    const existingUrlsStr = formData.get('existing_image_urls') as string;
    const existingUrls: string[] = existingUrlsStr ? JSON.parse(existingUrlsStr) : [];
    
    console.log(`📸 Processing ${imageFiles.length} new images, ${existingUrls.length} existing`);
    
    // Validate: at least one image for new products
    if (imageFiles.length === 0 && existingUrls.length === 0) {
      return NextResponse.json(
        { error: 'At least one product image is required' },
        { status: 400 }
      );
    }

    // Process new images in parallel
    const allImageUrls: string[] = [...existingUrls]; // Start with existing
    const allImageHashes: string[] = []; // Will collect all hashes
    let firstImageBuffer: Buffer | null = null; // For visual features & keywords
    
    if (imageFiles.length > 0) {
      console.log('🔄 Processing new images in parallel...');
      
      const { generateMultiHashes } = await import('@/lib/image-recognition/hash');
      
      // Process all images and collect results
      const imageProcessingPromises = imageFiles.map(async (file) => {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // Upload to Cloudinary
        const uploadResult = await uploadToCloudinary(buffer);
        
        // Generate 3 hashes (full, center, square)
        const hashes = await generateMultiHashes(buffer);
        
        return {
          url: uploadResult.secure_url,
          hashes,
          buffer,
        };
      });
      
      const results = await Promise.all(imageProcessingPromises);
      
      // Collect URLs and hashes
      results.forEach((result, index) => {
        allImageUrls.push(result.url);
        allImageHashes.push(...result.hashes);
        console.log(`  ✅ Image ${index + 1} processed: ${result.hashes.length} hashes`);
      });
      
      // Store first buffer for visual features (explicit access for TypeScript)
      if (results.length > 0) {
        firstImageBuffer = results[0].buffer;
      }
      
      console.log(`📸 Total: ${allImageUrls.length} URLs, ${allImageHashes.length} hashes`);
    }
    
    // ========================================
    // RAW MEDIA HANDLING (Lifestyle Images & Videos)
    // ========================================
    
    // Process Media Images
    const newMediaImageCount = parseInt(formData.get('new_media_image_count') as string || '0');
    const existingMediaImagesStr = formData.get('existing_media_images') as string;
    const finalMediaImages: string[] = existingMediaImagesStr ? JSON.parse(existingMediaImagesStr) : [];
    
    if (newMediaImageCount > 0) {
      console.log(`🔄 Processing ${newMediaImageCount} new media images...`);
      const mediaImagePromises = [];
      for (let i = 0; i < newMediaImageCount; i++) {
        const file = formData.get(`media_image_${i}`) as File;
        if (file && file.size > 0) {
          mediaImagePromises.push((async () => {
            const buffer = Buffer.from(await file.arrayBuffer());
            const uploadResult = await uploadToCloudinary(buffer, 'autex/media/images', 'image');
            return uploadResult.secure_url;
          })());
        }
      }
      const newMediaUrls = await Promise.all(mediaImagePromises);
      finalMediaImages.push(...newMediaUrls);
    }

    // Process Media Videos
    const newMediaVideoCount = parseInt(formData.get('new_media_video_count') as string || '0');
    const existingMediaVideosStr = formData.get('existing_media_videos') as string;
    const finalMediaVideos: string[] = existingMediaVideosStr ? JSON.parse(existingMediaVideosStr) : [];
    
    if (newMediaVideoCount > 0) {
      console.log(`🔄 Processing ${newMediaVideoCount} new media videos...`);
      const mediaVideoPromises = [];
      for (let i = 0; i < newMediaVideoCount; i++) {
        const file = formData.get(`media_video_${i}`) as File;
        if (file && file.size > 0) {
          mediaVideoPromises.push((async () => {
            const buffer = Buffer.from(await file.arrayBuffer());
            const uploadResult = await uploadToCloudinary(buffer, 'autex/media/videos', 'video');
            return uploadResult.secure_url;
          })());
        }
      }
      const newVideoUrls = await Promise.all(mediaVideoPromises);
      finalMediaVideos.push(...newVideoUrls);
    }
    
    // If no new images, we need to keep existing hashes (handled in PATCH, not here)
    // For POST (new product), we always have new images

    // Extract visual features for Tier 2 matching (from first image only)
    console.log('Extracting visual features...');
    let visualFeatures;
    if (firstImageBuffer) {
      try {
        visualFeatures = await extractVisualFeatures(firstImageBuffer);
        console.log('Visual features extracted:', {
          aspectRatio: visualFeatures.aspectRatio,
          colorCount: visualFeatures.dominantColors.length,
        });
      } catch (featuresError: any) {
        console.error('Visual features extraction error:', featuresError);
        console.warn('Continuing without visual features');
        visualFeatures = null;
      }
    }

    // MAGIC UPLOAD: Auto-generate search keywords using OpenAI
    console.log('🪄 Generating search keywords with OpenAI...');
    let searchKeywords: string[] | null = null;
    let autoTaggingCost = 0;
    
    try {
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      // Convert first image to Base64 for auto-tagging
      if (!firstImageBuffer) throw new Error('No image buffer available');
      const base64Image = `data:image/jpeg;base64,${firstImageBuffer.toString('base64')}`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Analyze this product image. Return a JSON object with a "keywords" array containing 10-15 descriptive single words (lowercase) about color, pattern, material, style, clothing type, and visible brand. Example: {"keywords": ["navy", "blue", "striped", "polo", "collar", "cotton", "half-sleeve", "summer", "men"]}',
          },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: base64Image,
                  detail: 'low',
                },
              },
            ],
          },
        ],
        max_tokens: 150,
        temperature: 0.3,
      });

      const content = response.choices[0]?.message?.content || '{}';
      const usage = response.usage;

      // Calculate cost
      if (usage) {
        const inputCost = (usage.prompt_tokens / 1_000_000) * 0.15;
        const outputCost = (usage.completion_tokens / 1_000_000) * 0.60;
        autoTaggingCost = inputCost + outputCost;
      }

      // Parse keywords
      let cleanedContent = content.trim();
      if (cleanedContent.startsWith('```json')) {
        cleanedContent = cleanedContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanedContent.startsWith('```')) {
        cleanedContent = cleanedContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      const parsed = JSON.parse(cleanedContent);
      searchKeywords = parsed.keywords || [];

      console.log(`✓ Generated ${searchKeywords?.length || 0} keywords:`, searchKeywords?.slice(0, 5));
      console.log(`  Cost: $${autoTaggingCost.toFixed(6)}`);

      // Track API usage
      await supabase.from('api_usage').insert({
        workspace_id: workspace.id,
        api_type: 'auto_tagging',
        cost: autoTaggingCost,
      });
    } catch (autoTagError: any) {
      console.error('Auto-tagging error:', autoTagError);
      console.warn('Continuing without auto-generated keywords');
      // Don't fail the request - product can be saved without keywords
    }

    // Insert product into database
    console.log('Inserting product into database...');
    const { data: product, error } = await supabase
      .from('products')
      .insert({
        workspace_id: workspace.id,
        name: productData.name,
        price: productData.price,
        description: productData.description || null,
        // category: productData.category || null,
        stock_quantity: productData.stock_quantity || 0,
        variations: productData.variations || null,
        image_urls: allImageUrls, // All uploaded images
        image_hashes: allImageHashes, // 3 hashes per image for Tier 1
        visual_features: visualFeatures as any, // For Tier 2
        search_keywords: searchKeywords, // Magic Upload keywords for Tier 3
        colors: productData.colors || [],
        sizes: productData.sizes || [],
        size_stock: productData.size_stock || [], // NEW: per-size stock tracking
        variant_stock: productData.variant_stock || [], // NEW: variant stock tracking
        pricing_policy: productData.pricing_policy || { isNegotiable: false, bulkDiscounts: [] },
        product_attributes: productData.product_attributes || {},
        media_images: finalMediaImages,
        media_videos: finalMediaVideos,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating product:', error);
      return NextResponse.json(
        { error: 'Failed to create product' },
        { status: 500 }
      );
    }

    console.log('Product created successfully:', product.id);

    return NextResponse.json(
      {
        message: 'Product created successfully',
        product,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error in POST /api/products:', error);
    console.error('Error stack:', error.stack);

    // Handle validation errors
    if (error.name === 'ZodError') {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: error.errors,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
