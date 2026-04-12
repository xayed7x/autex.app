/**
 * Product RAG Search
 *
 * Token-efficient product retrieval for the AI agent.
 * Wraps the existing scored search and returns only the fields
 * the agent needs to reason about products.
 *
 * @module lib/ai/tools/search-products
 */

import { searchProductsByKeywordsWithScoring } from '@/lib/db/products';

// ============================================
// TYPES
// ============================================

/** Compact product representation for AI context. */
export interface ProductSearchResult {
  id: string;
  name: string;
  price: number;
  description: string;
  sizes: string[];
  colors: string[];
  stock: number;
  inStock: boolean;
  stockMessage?: string;
  imageUrl: string | null;
  variantStock?: any;
  sizeStock?: any;
  pricingPolicy: {
    isNegotiable: boolean;
    minPrice: number | null;
    bulkDiscount: string | null;
  };
  product_attributes: Record<string, any> | null;
  media_images: string[];
  media_videos: string[];
}

export interface SearchProductsOutput {
  success: boolean;
  products: ProductSearchResult[];
  message: string;
}

// ============================================
// CONSTANTS
// ============================================

const MAX_RESULTS = 5;
const MAX_DESCRIPTION_LENGTH = 120;

// ============================================
// MAIN FUNCTION
// ============================================

/**
 * Searches for products relevant to the customer's query.
 *
 * Returns a compact, token-efficient list of matching products
 * with only the fields the AI agent needs. Every query is scoped
 * to the given workspaceId — no cross-tenant leakage.
 *
 * @param query - Natural language search query from the customer
 * @param workspaceId - Workspace scope (injected by orchestrator, never by AI)
 * @returns Compact product list or empty result with message
 */
export async function searchProducts(
  query: string,
  workspaceId: string,
  requestedSize?: string,
  requestedColor?: string
): Promise<SearchProductsOutput> {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    return {
      success: false,
      products: [],
      message: 'Empty search query.',
    };
  }

  if (!workspaceId) {
    return {
      success: false,
      products: [],
      message: 'Missing workspace context.',
    };
  }

  try {
    const rawProducts = await searchProductsByKeywordsWithScoring(
      trimmedQuery,
      workspaceId,
      MAX_RESULTS
    );

    if (rawProducts.length === 0) {
      return {
        success: true,
        products: [],
        message: `No products found matching "${trimmedQuery}".`,
      };
    }

    const products = rawProducts.map(p => toCompactProduct(p, requestedSize, requestedColor));

    return {
      success: true,
      products,
      message: `Found ${products.length} product(s) matching "${trimmedQuery}".`,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[search-products] Failed for query "${trimmedQuery}":`, errorMessage);

    return {
      success: false,
      products: [],
      message: `Search failed: ${errorMessage}`,
    };
  }
}

// ============================================
// HELPERS
// ============================================

/**
 * Maps a full DB product row to the compact format the agent sees.
 * Truncates description to save tokens. Extracts pricing_policy safely.
 */
function toCompactProduct(row: Record<string, any>, requestedSize?: string, requestedColor?: string): ProductSearchResult {
  const description = row.description || '';
  const pricingPolicy = row.pricing_policy as Record<string, any> | null;

  let actualStock = row.stock_quantity ?? 0;
  
  // Check variant stock if size/color provided
  if (requestedSize || requestedColor) {
    if (row.variant_stock && Array.isArray(row.variant_stock)) {
      const variant = row.variant_stock.find((v: any) => 
        (!requestedSize || v.size?.toUpperCase() === requestedSize.toUpperCase()) &&
        (!requestedColor || v.color?.toLowerCase() === requestedColor.toLowerCase())
      );
      if (variant !== undefined) {
        actualStock = variant.quantity ?? 0;
      }
    } else if (row.variant_stock && typeof row.variant_stock === 'object') {
      // Fallback for object map: e.g. {"M_Blue": 5}
      const key = `${requestedSize || ''}_${requestedColor || ''}`.replace(/^_|_$/g, '');
      const val = (row.variant_stock as Record<string,any>)[key];
      if (val !== undefined) actualStock = Number(val);
    } else if (requestedSize && row.size_stock && Array.isArray(row.size_stock)) {
      const sizeVariant = row.size_stock.find((s: any) => s.size?.toUpperCase() === requestedSize.toUpperCase());
      if (sizeVariant !== undefined) {
         actualStock = sizeVariant.quantity ?? 0;
      }
    }
  }

  const inStock = actualStock > 0;
  if (!inStock && (requestedSize || requestedColor)) {
    console.log(`⚠️ [STOCK FILTER] Removed [Size ${requestedSize || 'Any'} / Color ${requestedColor || 'Any'}] — quantity: 0`);
  }

  return {
    id: row.id,
    name: row.name || 'Unnamed product',
    price: row.price ?? 0,
    description: truncateDescription(description),
    sizes: Array.isArray(row.sizes) ? row.sizes : [],
    colors: Array.isArray(row.colors) ? row.colors : [],
    stock: actualStock,
    inStock,
    stockMessage: !inStock ? `Out of stock for requested variation.` : undefined,
    imageUrl: Array.isArray(row.image_urls) && row.image_urls.length > 0
      ? row.image_urls[0]
      : null,
    variantStock: row.variant_stock || null,
    sizeStock: row.size_stock || null,
    pricingPolicy: {
      isNegotiable: pricingPolicy?.isNegotiable ?? false,
      minPrice: pricingPolicy?.minPrice ?? null,
      bulkDiscount: pricingPolicy?.bulkDiscount ?? null,
    },
    product_attributes: row.product_attributes || null,
    media_images: row.media_images || [],
    media_videos: row.media_videos || [],
  };
}

/**
 * Truncates a description to MAX_DESCRIPTION_LENGTH characters,
 * breaking at the last word boundary to avoid mid-word cuts.
 */
function truncateDescription(text: string): string {
  if (text.length <= MAX_DESCRIPTION_LENGTH) {
    return text;
  }

  const truncated = text.substring(0, MAX_DESCRIPTION_LENGTH);
  const lastSpace = truncated.lastIndexOf(' ');

  return lastSpace > 0
    ? truncated.substring(0, lastSpace) + '…'
    : truncated + '…';
}
