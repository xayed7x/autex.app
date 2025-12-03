/**
 * Facebook Pages API
 * Manages connected Facebook pages for the current workspace
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/facebook/pages
 * Fetches all connected Facebook pages for the current workspace
 */
export async function GET(request: NextRequest) {
  try {
    // Verify user is authenticated
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Get workspace ID
    const { data: workspaceData, error: workspaceError } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .single();
    
    if (workspaceError || !workspaceData) {
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      );
    }
    
    // Fetch connected pages
    const { data: pages, error: pagesError } = await supabase
      .from('facebook_pages')
      .select('id, page_name, created_at')
      .eq('workspace_id', workspaceData.workspace_id)
      .order('created_at', { ascending: false });
    
    if (pagesError) {
      console.error('❌ Error fetching pages:', pagesError);
      return NextResponse.json(
        { error: 'Failed to fetch pages' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      pages: pages || [],
    });
    
  } catch (error) {
    console.error('❌ Error in GET /api/facebook/pages:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/facebook/pages/:id
 * Disconnects a Facebook page
 */
export async function DELETE(request: NextRequest) {
  try {
    // Get page ID from URL
    const url = new URL(request.url);
    const pageId = url.searchParams.get('id');
    
    if (!pageId) {
      return NextResponse.json(
        { error: 'Page ID is required' },
        { status: 400 }
      );
    }
    
    // Verify user is authenticated
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Get workspace ID
    const { data: workspaceData, error: workspaceError } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .single();
    
    if (workspaceError || !workspaceData) {
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      );
    }
    
    // Verify page belongs to user's workspace
    const { data: pageData, error: pageError } = await supabase
      .from('facebook_pages')
      .select('id, page_name, encrypted_access_token')
      .eq('id', pageId)
      .eq('workspace_id', workspaceData.workspace_id)
      .single();
    
    if (pageError || !pageData) {
      return NextResponse.json(
        { error: 'Page not found or access denied' },
        { status: 404 }
      );
    }
    
    // Note: We could unsubscribe from webhook here, but it requires decrypting the token
    // For now, we'll just delete from database
    // Facebook will automatically stop sending webhooks when the app is uninstalled
    
    // Delete page from database
    const { error: deleteError } = await supabase
      .from('facebook_pages')
      .delete()
      .eq('id', pageId)
      .eq('workspace_id', workspaceData.workspace_id);
    
    if (deleteError) {
      console.error('❌ Error deleting page:', deleteError);
      return NextResponse.json(
        { error: 'Failed to disconnect page' },
        { status: 500 }
      );
    }
    
    console.log(`✅ Page ${pageData.page_name} disconnected`);
    
    return NextResponse.json({
      success: true,
      message: 'Page disconnected successfully',
    });
    
  } catch (error) {
    console.error('❌ Error in DELETE /api/facebook/pages:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
