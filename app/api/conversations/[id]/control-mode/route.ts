import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { Database } from '@/types/supabase'

type ControlMode = 'bot' | 'manual' | 'hybrid'

/**
 * PATCH /api/conversations/[id]/control-mode
 * 
 * Update the control mode for a conversation.
 * Allows setting to 'bot', 'manual', or 'hybrid'.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params
    const supabase = await createClient()
    
    // ========================================
    // 1. VALIDATE AUTHENTICATION
    // ========================================
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'You must be logged in' }, 
        { status: 401 }
      )
    }

    // Get user's workspace
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
    // 2. PARSE AND VALIDATE REQUEST BODY
    // ========================================
    
    const body = await request.json()
    const { control_mode, clear_pause } = body

    const validModes: ControlMode[] = ['bot', 'manual', 'hybrid']
    if (!control_mode || !validModes.includes(control_mode)) {
      return NextResponse.json(
        { error: 'Invalid request', message: 'control_mode must be one of: bot, manual, hybrid' }, 
        { status: 400 }
      )
    }

    // ========================================
    // 3. VERIFY CONVERSATION OWNERSHIP
    // ========================================
    
    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('id, workspace_id, control_mode')
      .eq('id', conversationId)
      .eq('workspace_id', workspace.id)
      .single()

    if (conversationError || !conversation) {
      return NextResponse.json(
        { error: 'Conversation not found', message: 'This conversation does not exist or you do not have access' }, 
        { status: 404 }
      )
    }

    // ========================================
    // 4. UPDATE CONTROL MODE
    // ========================================
    
    // Use admin client for update (bypasses RLS)
    const adminSupabase = createAdminClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    const updateData: any = {
      control_mode,
    }

    // If switching to bot mode, clear manual reply tracking and manual flags
    if (control_mode === 'bot' || clear_pause) {
      updateData.last_manual_reply_at = null
      updateData.last_manual_reply_by = null
      updateData.bot_pause_until = null
      updateData.needs_manual_response = false
      updateData.manual_flag_reason = null
      updateData.manual_flagged_at = null
    }

    // If switching to hybrid, clear manual flags (owner is taking over partially)
    if (control_mode === 'hybrid') {
      updateData.needs_manual_response = false
      updateData.manual_flag_reason = null
      updateData.manual_flagged_at = null
    }

    // If switching to manual, track when it was set
    if (control_mode === 'manual') {
      updateData.last_manual_reply_at = new Date().toISOString()
      updateData.last_manual_reply_by = user.id
    }

    const { data: updatedConversation, error: updateError } = await adminSupabase
      .from('conversations')
      .update(updateData)
      .eq('id', conversationId)
      .select('id, control_mode, last_manual_reply_at, last_manual_reply_by, bot_pause_until')
      .single()

    if (updateError) {
      console.error('Error updating control mode:', updateError)
      return NextResponse.json(
        { error: 'Update failed', message: 'Failed to update control mode' }, 
        { status: 500 }
      )
    }

    console.log(`🎛️ [CONTROL MODE API] Updated conversation ${conversationId} to ${control_mode}`)

    return NextResponse.json({
      success: true,
      ...updatedConversation,
    })

  } catch (error) {
    console.error('Control mode API error:', error)
    return NextResponse.json(
      { error: 'Internal server error', message: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/conversations/[id]/control-mode
 * 
 * Get the current control mode for a conversation.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params
    const supabase = await createClient()
    
    // Validate authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'You must be logged in' }, 
        { status: 401 }
      )
    }

    // Get user's workspace
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('id')
      .eq('owner_id', user.id)
      .single()

    if (!workspace) {
      return NextResponse.json(
        { error: 'No workspace found' }, 
        { status: 404 }
      )
    }

    // Get conversation
    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('id, control_mode, last_manual_reply_at, last_manual_reply_by, bot_pause_until')
      .eq('id', conversationId)
      .eq('workspace_id', workspace.id)
      .single()

    if (conversationError || !conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' }, 
        { status: 404 }
      )
    }

    return NextResponse.json(conversation)

  } catch (error) {
    console.error('Control mode GET API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
