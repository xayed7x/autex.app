import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';

type Product = Database['public']['Tables']['products']['Row'];

/**
 * Searches for products based on keywords in the query string.
 * Searches across name, description, and search_keywords columns.
 * 
 * @param query - The search query string (e.g., "Red Saree" or "Polo T-shirt")
 * @param workspaceId - The workspace ID to filter products
 * @returns Array of matched products (limited to 5)
 */
export async function searchProductsByKeywords(
  query: string,
  workspaceId: string
): Promise<Product[]> {
  // Create Supabase client with service role key for server-side operations
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    // Trim and normalize the query
    const normalizedQuery = query.trim();
    
    if (!normalizedQuery) {
      console.warn('Empty search query provided');
      return [];
    }

    // Split the query into individual keywords
    const keywords = normalizedQuery.toLowerCase().split(/\s+/);
    
    console.log(`🔍 Searching for products with keywords:`, keywords);

    // Build the query with OR conditions across multiple columns
    let queryBuilder = supabase
      .from('products')
      .select('*')
      .eq('workspace_id', workspaceId);

    // Create OR filter for each keyword across name, description, and search_keywords
    const orConditions: string[] = [];
    
    keywords.forEach((keyword) => {
      // Search in name (case-insensitive)
      orConditions.push(`name.ilike.%${keyword}%`);
      
      // Search in description (case-insensitive)
      orConditions.push(`description.ilike.%${keyword}%`);
      
      // Search in search_keywords array (case-insensitive contains)
      orConditions.push(`search_keywords.cs.{${keyword}}`);
    });

    // Apply OR filter
    queryBuilder = queryBuilder.or(orConditions.join(','));

    // Limit results to 5
    queryBuilder = queryBuilder.limit(5);

    // Execute the query
    const { data, error } = await queryBuilder;

    if (error) {
      console.error('Error searching products:', error);
      throw new Error(`Failed to search products: ${error.message}`);
    }

    if (!data || data.length === 0) {
      console.log('No products found for query:', query);
      return [];
    }

    console.log(`✓ Found ${data.length} product(s) matching query: "${query}"`);
    
    return data;
  } catch (error) {
    console.error('Unexpected error in searchProductsByKeywords:', error);
    throw error;
  }
}

/**
 * Advanced search with scoring based on keyword matches.
 * Returns products sorted by relevance.
 * 
 * @param query - The search query string
 * @param workspaceId - The workspace ID to filter products
 * @param limit - Maximum number of results (default: 5)
 * @returns Array of matched products sorted by relevance
 */
export async function searchProductsByKeywordsWithScoring(
  query: string,
  workspaceId: string,
  limit: number = 5
): Promise<Product[]> {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const normalizedQuery = query.trim();
    
    if (!normalizedQuery) {
      return [];
    }

    const keywords = normalizedQuery.toLowerCase().split(/\s+/);

    // Fetch all products for the workspace
    const { data: allProducts, error } = await supabase
      .from('products')
      .select('*')
      .eq('workspace_id', workspaceId);

    if (error) {
      console.error('Error fetching products:', error);
      throw new Error(`Failed to fetch products: ${error.message}`);
    }

    if (!allProducts || allProducts.length === 0) {
      return [];
    }

    // Score each product based on keyword matches
    const scoredProducts = allProducts.map((product) => {
      let score = 0;

      keywords.forEach((keyword) => {
        // Check name (higher weight)
        if (product.name?.toLowerCase().includes(keyword)) {
          score += 3;
        }

        // Check description (medium weight)
        if (product.description?.toLowerCase().includes(keyword)) {
          score += 2;
        }

        // Check search_keywords array (high weight for exact matches)
        if (product.search_keywords?.some(
          (kw) => kw.toLowerCase().includes(keyword)
        )) {
          score += 4;
        }

        // Check category (lower weight)
        if (product.category?.toLowerCase().includes(keyword)) {
          score += 1;
        }
      });

      return { product, score };
    });

    // Filter products with score > 0 and sort by score (descending)
    const matchedProducts = scoredProducts
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ product }) => product);

    console.log(`✓ Found ${matchedProducts.length} product(s) with scoring for query: "${query}"`);
    
    return matchedProducts;
  } catch (error) {
    console.error('Unexpected error in searchProductsByKeywordsWithScoring:', error);
    throw error;
  }
}
