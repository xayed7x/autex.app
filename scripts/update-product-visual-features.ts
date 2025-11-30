/**
 * Utility script to update existing products with visual features
 * Run this script to populate visual_features for products that already have images
 * 
 * Usage: node scripts/update-product-visual-features.js [workspaceId]
 */

import { createClient } from '@supabase/supabase-js';
import { extractVisualFeatures } from '../lib/image-recognition/tier2';
import type { Database } from '../types/supabase';

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function updateProductVisualFeatures(workspaceId?: string) {
  try {
    console.log('🔍 Fetching products...');
    
    // Build query
    let query = supabase
      .from('products')
      .select('*')
      .not('image_urls', 'is', null);
    
    if (workspaceId) {
      query = query.eq('workspace_id', workspaceId);
    }
    
    const { data: products, error } = await query;

    if (error) {
      console.error('❌ Error fetching products:', error);
      return;
    }

    if (!products || products.length === 0) {
      console.log('ℹ️  No products found with images');
      return;
    }

    console.log(`📦 Found ${products.length} products to update`);

    let updated = 0;
    let failed = 0;

    for (const product of products) {
      try {
        // Skip if already has visual features
        if (product.visual_features) {
          console.log(`⏭️  Skipping ${product.name} (already has visual features)`);
          continue;
        }

        // Get the first image URL
        const imageUrl = product.image_urls?.[0];
        if (!imageUrl) {
          console.log(`⚠️  No image URL for ${product.name}`);
          continue;
        }

        console.log(`🔄 Processing ${product.name}...`);

        // Fetch image
        const response = await fetch(imageUrl);
        if (!response.ok) {
          console.error(`❌ Failed to fetch image for ${product.name}`);
          failed++;
          continue;
        }

        const arrayBuffer = await response.arrayBuffer();
        const imageBuffer = Buffer.from(arrayBuffer);

        // Extract visual features
        const visualFeatures = await extractVisualFeatures(imageBuffer);

        // Update product in database
        const { error: updateError } = await supabase
          .from('products')
          .update({ visual_features: visualFeatures as any })
          .eq('id', product.id);

        if (updateError) {
          console.error(`❌ Failed to update ${product.name}:`, updateError);
          failed++;
          continue;
        }

        console.log(`✅ Updated ${product.name}`);
        console.log(`   Aspect Ratio: ${visualFeatures.aspectRatio.toFixed(2)}`);
        console.log(`   Colors: ${visualFeatures.dominantColors.length}`);
        updated++;

      } catch (error) {
        console.error(`❌ Error processing ${product.name}:`, error);
        failed++;
      }
    }

    console.log('\n📊 Summary:');
    console.log(`   ✅ Updated: ${updated}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   📦 Total: ${products.length}`);

  } catch (error) {
    console.error('❌ Fatal error:', error);
  }
}

// Get workspace ID from command line args
const workspaceId = process.argv[2];

if (workspaceId) {
  console.log(`🎯 Updating products for workspace: ${workspaceId}\n`);
} else {
  console.log('🌍 Updating products for ALL workspaces\n');
}

updateProductVisualFeatures(workspaceId);
