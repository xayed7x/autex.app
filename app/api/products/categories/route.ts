import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/products/categories
 * Fetch unique product categories for the current workspace
 */
export async function GET(request: NextRequest) {
  try {
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

    // Fetch unique categories from products table
    // We use a simple select and filter in JS to avoid complex raw SQL for now, 
    // given the scale of product lists it's performant enough.
    const { data: products, error } = await supabase
      .from('products')
      .select('category')
      .eq('workspace_id', workspace.id)
      .not('category', 'is', null);

    if (error) {
      console.error('Error fetching categories:', error);
      return NextResponse.json(
        { error: 'Failed to fetch categories' },
        { status: 500 }
      );
    }

    // Extract unique categories and sort them
    const uniqueCategories = Array.from(new Set(products.map(p => p.category)))
      .filter(Boolean)
      .sort((a, b) => a!.localeCompare(b!));

    return NextResponse.json({ categories: uniqueCategories });
  } catch (error) {
    console.error('Error in GET /api/products/categories:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
