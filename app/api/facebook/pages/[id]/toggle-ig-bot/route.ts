import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * PATCH /api/facebook/pages/[id]/toggle-ig-bot
 * 
 * Enable or disable the Instagram bot for a Facebook page
 * 
 * Request body: { ig_bot_enabled: boolean }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: pageId } = await params
    const supabase = await createClient()

    // ========================================
    // 1. VALIDATE AUTHENTICATION
    // ========================================

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'You must be logged in to update page settings' },
        { status: 401 }
      )
    }

    // ========================================
    // 2. GET USER'S WORKSPACE
    // ========================================

    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .select('id')
      .eq('owner_id', user.id)
      .single()

    if (workspaceError || !workspace) {
      return NextResponse.json(
        { error: 'No workspace found', message: 'You do not have access to this resource' },
        { status: 404 }
      )
    }

    // ========================================
    // 3. VALIDATE REQUEST BODY
    // ========================================

    let body
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON', message: 'Request body must be valid JSON' },
        { status: 400 }
      )
    }

    const { ig_bot_enabled } = body

    if (typeof ig_bot_enabled !== 'boolean') {
      return NextResponse.json(
        { error: 'Invalid input', message: 'ig_bot_enabled must be a boolean value' },
        { status: 400 }
      )
    }

    // ========================================
    // 4. VERIFY PAGE EXISTS AND BELONGS TO USER
    // ========================================

    const { data: page, error: pageError } = await supabase
      .from('facebook_pages')
      .select('id, page_name, workspace_id, ig_bot_enabled')
      .eq('id', pageId)
      .single()

    if (pageError || !page) {
      return NextResponse.json(
        { error: 'Page not found', message: 'The specified Facebook page does not exist' },
        { status: 404 }
      )
    }

    // Verify ownership
    if (page.workspace_id !== workspace.id) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'You do not have permission to modify this page' },
        { status: 403 }
      )
    }

    // ========================================
    // 5. UPDATE DATABASE
    // ========================================

    const { data: updatedPage, error: updateError } = await supabase
      .from('facebook_pages')
      .update({ ig_bot_enabled })
      .eq('id', pageId)
      .select('id, page_name, ig_bot_enabled')
      .single()

    if (updateError) {
      console.error('Error updating page ig_bot_enabled:', updateError)
      return NextResponse.json(
        { error: 'Database error', message: 'Failed to update page settings' },
        { status: 500 }
      )
    }

    console.log(`🤖 IG Bot ${ig_bot_enabled ? 'enabled' : 'disabled'} for page: ${updatedPage.page_name} (${pageId})`)

    // ========================================
    // 6. RETURN SUCCESS RESPONSE
    // ========================================

    return NextResponse.json({
      success: true,
      page: {
        id: String(updatedPage.id),
        name: updatedPage.page_name,
        ig_bot_enabled: updatedPage.ig_bot_enabled,
      },
    })

  } catch (error) {
    console.error('Toggle IG bot error:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
