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
      .select('*', { count: 'exact' })
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

    // Get image file
    const imageFile = formData.get('image') as File;
    if (!imageFile) {
      return NextResponse.json(
        { error: 'Product image is required' },
        { status: 400 }
      );
    }
    console.log('Image file received:', imageFile.name, imageFile.size, 'bytes');

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

    // Convert file to buffer
    console.log('Converting file to buffer...');
    const arrayBuffer = await imageFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    console.log('Buffer created, size:', buffer.length);

    // Upload to Cloudinary
    console.log('Uploading image to Cloudinary...');
    let uploadResult;
    try {
      uploadResult = await uploadToCloudinary(buffer);
      console.log('Image uploaded successfully:', uploadResult.secure_url);
    } catch (uploadError: any) {
      console.error('Cloudinary upload error:', uploadError);
      return NextResponse.json(
        { error: `Failed to upload image: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // Generate multiple perceptual hashes for Tier 1 matching (production-ready)
    console.log('Generating multi-hashes (full, center, square)...');
    let imageHashes: string[];
    try {
      const { generateMultiHashes } = await import('@/lib/image-recognition/hash');
      imageHashes = await generateMultiHashes(buffer);
      console.log('Multi-hashes generated:', imageHashes);
    } catch (hashError: any) {
      console.error('Hash generation error:', hashError);
      return NextResponse.json(
        { error: `Failed to generate image hashes: ${hashError.message}` },
        { status: 500 }
      );
    }

    // Extract visual features for Tier 2 matching
    console.log('Extracting visual features...');
    let visualFeatures;
    try {
      visualFeatures = await extractVisualFeatures(buffer);
      console.log('Visual features extracted:', {
        aspectRatio: visualFeatures.aspectRatio,
        colorCount: visualFeatures.dominantColors.length,
      });
    } catch (featuresError: any) {
      console.error('Visual features extraction error:', featuresError);
      // Don't fail the request if visual features extraction fails
      // Just log the error and continue without visual features
      console.warn('Continuing without visual features');
      visualFeatures = null;
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

      // Convert image to Base64
      const base64Image = `data:image/jpeg;base64,${buffer.toString('base64')}`;

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

      console.log(`✓ Generated ${searchKeywords.length} keywords:`, searchKeywords.slice(0, 5));
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
        category: productData.category || null,
        stock_quantity: productData.stock_quantity || 0,
        variations: productData.variations || null,
        image_urls: [uploadResult.secure_url],
        image_hashes: imageHashes, // Multi-hash for Tier 1
        visual_features: visualFeatures as any, // For Tier 2
        search_keywords: searchKeywords, // Magic Upload keywords for Tier 3
        colors: productData.colors || [],
        sizes: productData.sizes || [],
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
