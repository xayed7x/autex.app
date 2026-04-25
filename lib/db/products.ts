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
  limit: number = 20,
  offset: number = 0,
  flavor?: string,
  category?: string
): Promise<Product[]> {
  const STOPWORDS = new Set(['er', 'jonno', 'lagbe', 'chai', 'daen', 'dekhun', 'dekan', 'the', 'a', 'an', 'for', 'want', 'need', 'give', 'show', 'please', 'sir', 'maam', 'vai', 'apa', 'of', 'to', 'in', 'on', 'with']);
  
  const CATEGORY_ALIASES: Record<string, string> = {
    'aniversary': 'anniversary',
    'aniversery': 'anniversary',
    'anniversery': 'anniversary',
    'anivarsary': 'anniversary',
    'anivarsery': 'anniversary',
    'barthday': 'birthday',
    'brithday': 'birthday',
    'borthday': 'birthday',
    'weedding': 'wedding',
    'weding': 'wedding',
    'ভ্যালেন্টাইন': 'valentine',
    'বার্থডে': 'birthday',
    'অ্যানিভারসারি': 'anniversary',
    'বিয়ে': 'wedding',
  };

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const normalizedQuery = query.trim();
    
    // Build the query with keyword filtering directly in SQL to avoid fetching all products
    let queryBuilder = supabase
      .from('products')
      .select('*')
      .eq('workspace_id', workspaceId);
    
    if (flavor) {
      queryBuilder = queryBuilder.ilike('flavor', `%${flavor}%`);
    }

    if (category && category !== 'all') {
      queryBuilder = queryBuilder.ilike('category', `%${category}%`);
    }

    // Optimization: If there are keywords, apply them in the DB query
    if (normalizedQuery) {
      const rawKeywords = normalizedQuery.toLowerCase().split(/\s+/);
      const keywords = rawKeywords
        .map(kw => CATEGORY_ALIASES[kw] || kw)
        .filter(kw => kw.length >= 2 && !STOPWORDS.has(kw));

      const orConditions: string[] = [];
      
      keywords.forEach(keyword => {
        orConditions.push(`name.ilike.%${keyword}%`);
        orConditions.push(`description.ilike.%${keyword}%`);
        orConditions.push(`category.ilike.%${keyword}%`);
        orConditions.push(`search_keywords.cs.{${keyword}}`);
      });

      if (orConditions.length > 0) {
        queryBuilder = queryBuilder.or(orConditions.join(','));
      }
    }

    // Limit the initial DB fetch to a reasonable amount (e.g., 100) to keep memory low
    // while still allowing JS-based scoring for relevance ranking
    const { data: matchedProducts, error } = await queryBuilder.limit(100);

    if (error) {
      console.error('Error fetching products:', error);
      throw new Error(`Failed to fetch products: ${error.message}`);
    }

    if (!matchedProducts || matchedProducts.length === 0) {
      return [];
    }

    if (!normalizedQuery) {
      return (matchedProducts as Product[]).slice(offset, offset + limit);
    }

    const rawKeywords = normalizedQuery.toLowerCase().split(/\s+/);
    const keywords = rawKeywords
      .map(kw => CATEGORY_ALIASES[kw] || kw)
      .filter(kw => kw.length >= 2 && !STOPWORDS.has(kw));

    // Score only the subset of products matched by DB
    const scoredProducts = (matchedProducts as Product[]).map((product) => {
      let score = 0;

      keywords.forEach((keyword) => {
        const nameLower = (product.name || '').toLowerCase();
        const catLower = (product.category || '').toLowerCase();
        const descLower = (product.description || '').toLowerCase();

        // Check category (Extreme high weight for exact match)
        if (catLower === keyword) {
          score += 50;
        } else if (catLower.includes(keyword)) {
          score += 25;
        }

        // Check name (high weight)
        if (nameLower.includes(keyword)) {
          score += 15;
        }

        // Check search_keywords array (medium-high weight)
        if (product.search_keywords?.some(
          (kw) => kw.toLowerCase().includes(keyword)
        )) {
          score += 10;
        }

        // Check description (low weight)
        if (descLower.includes(keyword)) {
          score += 5;
        }
      });

      return { product, score };
    });

    // Sort by score (descending) and return requested page
    const finalProducts = scoredProducts
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(offset, offset + limit)
      .map(({ product }) => product);

    console.log(`✓ Found ${finalProducts.length} product(s) with optimized scoring for query: "${query}"`);
    
    return finalProducts;
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
