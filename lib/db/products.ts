import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';

type Product = Database['public']['Tables']['products']['Row'];

/**
 * Fetches a single product by ID with full data including pricing_policy
 */
export async function getProductById(
  productId: string,
  workspaceId?: string
): Promise<Product | null> {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    let query = supabase
      .from('products')
      .select('*')
      .eq('id', productId);
    
    if (workspaceId) {
      query = query.eq('workspace_id', workspaceId);
    }
    
    const { data, error } = await query.single();

    if (error) {
      console.error('Error fetching product by ID:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Unexpected error in getProductById:', error);
    return null;
  }
}

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
      
      // Search in colors array (case-insensitive contains)
      orConditions.push(`colors.cs.{${keyword}}`);
    });

    // Apply OR filter
    const orFilterString = orConditions.join(',');
    console.log(`🔍 [DB QUERY] Supabase OR filter: ${orFilterString}`);
    queryBuilder = queryBuilder.or(orFilterString);

    // Limit results to 5
    queryBuilder = queryBuilder.limit(5);

    // Execute the query
    const { data, error } = await queryBuilder;

    if (error) {
      console.error('Error searching products:', error);
      throw new Error(`Failed to search products: ${error.message}`);
    }

    if (!data || data.length === 0) {
      console.log(`🔍 [DB RESULT] No products found for query: "${query}"`);
      return [];
    }

    console.log(`✓ Found ${data.length} product(s) matching query: "${query}"`);
    data.forEach((product: any, i: number) => {
      console.log(`   📦 [DB RESULT ${i + 1}] id=${product.id} | name="${product.name}" | price=৳${product.price} | stock=${product.stock_quantity} | search_keywords=${JSON.stringify(product.search_keywords)}`);
    });
    
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
  limit: number = 5,
  flavor?: string
): Promise<Product[]> {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const normalizedQuery = query.trim();
    
    // Fetch products for the workspace, optionally filtering by cake_category
    let queryBuilder = supabase
      .from('products')
      .select('*')
      .eq('workspace_id', workspaceId);
    
    if (flavor) {
      // Filter by flavor OR category matching the requested flavor
      queryBuilder = queryBuilder.or(`flavor.ilike.%${flavor}%,category.ilike.%${flavor}%`);
    }

    const { data: allProducts, error } = await queryBuilder;

    if (error) {
      console.error('Error fetching products:', error);
      throw new Error(`Failed to fetch products: ${error.message}`);
    }

    if (!allProducts || allProducts.length === 0) {
      return [];
    }

    if (!normalizedQuery) {
      // If no query but category provided, return top products in category
      return (allProducts as Product[]).slice(0, limit);
    }

    const keywords = normalizedQuery.toLowerCase().split(/\s+/);

    // Score each product based on keyword matches
    const scoredProducts = (allProducts as Product[]).map((product) => {
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
      });

      return { product, score };
    });

    // Filter products with score > 0 and sort by score (descending)
    const matchedProducts = scoredProducts
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ product }) => product);

    console.log(`✓ Found ${matchedProducts.length} product(s) with scoring for query: "${query}"${flavor ? ` with flavor: "${flavor}"` : ''}`);
    
    return matchedProducts;
  } catch (error) {
    console.error('Unexpected error in searchProductsByKeywordsWithScoring:', error);
    throw error;
  }
}

/**
 * Gets a summary of all unique categories and flavors available in a workspace.
 * Used to give the AI agent dynamic context about the catalog.
 */
export async function getCatalogSummary(workspaceId: string) {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const { data, error } = await supabase
      .from('products')
      .select('category, flavor')
      .eq('workspace_id', workspaceId);

    if (error) throw error;

    const categories = new Set<string>();
    const flavors = new Set<string>();

    data.forEach(p => {
      if (p.category) categories.add(p.category);
      if (p.flavor) flavors.add(p.flavor);
    });

    return {
      categories: Array.from(categories).filter(Boolean),
      flavors: Array.from(flavors).filter(Boolean)
    };
  } catch (error) {
    console.error('Error fetching catalog summary:', error);
    return { categories: [], flavors: [] };
  }
}
