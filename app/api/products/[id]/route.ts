import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { uploadToCloudinary, deleteFromCloudinary } from '@/lib/cloudinary/upload';
import { generateImageHash } from '@/lib/image-recognition/hash';
import { validateProductUpdateFormData } from '@/lib/validations/product';

/**
 * GET /api/products/[id]
 * Get a single product by ID
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Create Supabase admin client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: product, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ product });
  } catch (error) {
    console.error('Error in GET /api/products/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/products/[id]
 * Update a product
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const formData = await request.formData();

    // Validate update data
    const updateData = validateProductUpdateFormData(formData);

    // Create Supabase admin client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get existing product
    const { data: existingProduct, error: fetchError } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existingProduct) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    // ========================================
    // MULTI-IMAGE HANDLING FOR EDITS
    // ========================================
    
    // Get new image files (image_0, image_1, etc.)
    const newImageCount = parseInt(formData.get('new_image_count') as string || '0');
    const newImageFiles: File[] = [];
    
    // Backward compatibility: check for old 'image' field
    const legacyImage = formData.get('image') as File;
    if (legacyImage && legacyImage.size > 0) {
      newImageFiles.push(legacyImage);
    } else {
      for (let i = 0; i < newImageCount; i++) {
        const file = formData.get(`image_${i}`) as File;
        if (file && file.size > 0) {
          newImageFiles.push(file);
        }
      }
    }
    
    // Get list of existing URLs to keep (user didn't remove them)
    const existingUrlsStr = formData.get('existing_image_urls') as string;
    const keptUrls: string[] = existingUrlsStr ? JSON.parse(existingUrlsStr) : [];
    
    console.log(`📸 PATCH: ${newImageFiles.length} new images, ${keptUrls.length} kept`);
    
    // Build final image arrays
    let finalImageUrls: string[] = [...keptUrls];
    let finalImageHashes: string[] = [];
    
    // For kept images, we need to regenerate hashes (or we could track per-image hashes in DB)
    // For simplicity, we'll regenerate hashes only for new images and assume kept images have their hashes
    // TODO: In future, could store image_hash_map to avoid regenerating
    
    // Process new images if any
    if (newImageFiles.length > 0) {
      const { generateMultiHashes } = await import('@/lib/image-recognition/hash');
      const { uploadToCloudinary } = await import('@/lib/cloudinary/upload');
      
      const processPromises = newImageFiles.map(async (file) => {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        const uploadResult = await uploadToCloudinary(buffer);
        const hashes = await generateMultiHashes(buffer);
        
        return { url: uploadResult.secure_url, hashes };
      });
      
      const results = await Promise.all(processPromises);
      
      results.forEach((result, index) => {
        finalImageUrls.push(result.url);
        finalImageHashes.push(...result.hashes);
        console.log(`  ✅ New image ${index + 1} processed: ${result.hashes.length} hashes`);
      });
    }
    
    // For kept images, we regenerate hashes from URL (simplified approach)
    // A more optimized approach would store hash-to-image mapping in DB
    if (keptUrls.length > 0 && existingProduct.image_hashes) {
      const existingHashCount = existingProduct.image_hashes.length;
      const existingUrlCount = existingProduct.image_urls?.length || 0;
      const hashesPerImage = existingUrlCount > 0 ? Math.floor(existingHashCount / existingUrlCount) : 3;
      
      // Calculate which hashes to keep based on kept URL positions
      const existingUrls = existingProduct.image_urls || [];
      keptUrls.forEach(keptUrl => {
        const originalIndex = existingUrls.indexOf(keptUrl);
        if (originalIndex >= 0) {
          const startHash = originalIndex * hashesPerImage;
          const endHash = startHash + hashesPerImage;
          const hashesToKeep = existingProduct.image_hashes.slice(startHash, endHash);
          finalImageHashes.push(...hashesToKeep);
        }
      });
    }
    
    console.log(`📸 Final: ${finalImageUrls.length} URLs, ${finalImageHashes.length} hashes`);
    
    // ========================================
    // RAW MEDIA HANDLING FOR EDITS
    // ========================================
    
    // Process Media Images
    const newMediaImageCount = parseInt(formData.get('new_media_image_count') as string || '0');
    const existingMediaImagesStr = formData.get('existing_media_images') as string;
    const finalMediaImages: string[] = existingMediaImagesStr ? JSON.parse(existingMediaImagesStr) : [];
    
    if (newMediaImageCount > 0) {
      console.log(`🔄 PATCH: Processing ${newMediaImageCount} new media images...`);
      const { uploadToCloudinary } = await import('@/lib/cloudinary/upload');
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
      console.log(`🔄 PATCH: Processing ${newMediaVideoCount} new media videos...`);
      const { uploadToCloudinary } = await import('@/lib/cloudinary/upload');
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

    // Update product in database
    const { data: product, error: updateError } = await supabase
      .from('products')
      .update({
        ...updateData,
        image_urls: finalImageUrls,
        image_hashes: finalImageHashes,
        ...(updateData.colors && { colors: updateData.colors }),
        ...(updateData.sizes && { sizes: updateData.sizes }),
        ...(updateData.size_stock && { size_stock: updateData.size_stock }),
        ...(updateData.variant_stock && { variant_stock: updateData.variant_stock }),
        ...(updateData.pricing_policy && { pricing_policy: updateData.pricing_policy }),
        ...(updateData.product_attributes && { product_attributes: updateData.product_attributes }),
        media_images: finalMediaImages,
        media_videos: finalMediaVideos,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating product:', updateError);
      return NextResponse.json(
        { error: 'Failed to update product' },
        { status: 500 }
      );
    }

    console.log('Product updated successfully:', product.id);

    return NextResponse.json({
      message: 'Product updated successfully',
      product,
    });
  } catch (error: any) {
    console.error('Error in PATCH /api/products/[id]:', error);

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

/**
 * DELETE /api/products/[id]
 * Delete a product
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Create Supabase admin client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get product to verify it exists
    const { data: product, error: fetchError } = await supabase
      .from('products')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    // Delete from database
    const { error: deleteError } = await supabase
      .from('products')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error deleting product:', deleteError);
      return NextResponse.json(
        { error: 'Failed to delete product' },
        { status: 500 }
      );
    }

    // TODO: Optionally delete image from Cloudinary
    // if (product.image_urls?.[0]) {
    //   const publicId = extractPublicIdFromUrl(product.image_urls[0]);
    //   await deleteFromCloudinary(publicId);
    // }

    console.log('Product deleted successfully:', id);

    return NextResponse.json({
      message: 'Product deleted successfully',
    });
  } catch (error) {
    console.error('Error in DELETE /api/products/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
