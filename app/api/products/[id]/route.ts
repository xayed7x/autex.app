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
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

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
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
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

    // Check if new image is provided
    const imageFile = formData.get('image') as File | null;
    let imageUrl = existingProduct.image_urls?.[0];
    let imageHash = existingProduct.image_hash;

    if (imageFile) {
      // Convert file to buffer
      const arrayBuffer = await imageFile.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Upload new image to Cloudinary
      console.log('Uploading new image to Cloudinary...');
      const uploadResult = await uploadToCloudinary(buffer);
      imageUrl = uploadResult.secure_url;

      // Generate new hash
      console.log('Generating new image hash...');
      imageHash = await generateImageHash(buffer);

      // TODO: Optionally delete old image from Cloudinary
      // if (existingProduct.image_urls?.[0]) {
      //   const oldPublicId = extractPublicIdFromUrl(existingProduct.image_urls[0]);
      //   await deleteFromCloudinary(oldPublicId);
      // }
    }

    // Update product in database
    const { data: product, error: updateError } = await supabase
      .from('products')
      .update({
        ...updateData,
        ...(imageUrl && { image_urls: [imageUrl] }),
        ...(imageHash && { image_hash: imageHash }),
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
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

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
