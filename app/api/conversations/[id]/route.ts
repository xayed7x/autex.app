import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get workspace
    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .select('id')
      .eq('owner_id', user.id)
      .single()

    if (workspaceError || !workspace) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }

    // Get conversation with messages
    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select(`
        *,
        messages (
          id,
          sender,
          sender_type,
          message_text,
          message_type,
          attachments,
          image_url,
          created_at
        )
      `)
      .eq('id', id)
      .eq('workspace_id', workspace.id)
      .single()

    if (conversationError) {
      console.error('Error fetching conversation:', conversationError)
      return NextResponse.json({ error: conversationError.message }, { status: 500 })
    }

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // Sort messages by created_at and deduplicate
    if (conversation.messages) {
      // Sort chronologically
      conversation.messages.sort((a: any, b: any) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )
      
      conversation.messages = conversation.messages
    }

    // NOTE: Manual flags are now cleared only when an actual reply is sent 
    // or when the owner explicitly dismisses them. Simply viewing the 
    // conversation no longer clears the flag to prevent state leakage.

    return NextResponse.json(conversation)
  } catch (error) {
    console.error('Conversation detail API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get workspace
    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .select('id')
      .eq('owner_id', user.id)
      .single()

    if (workspaceError || !workspace) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }

    const body = await request.json()
    const { current_state } = body

    // Update conversation
    const { data, error } = await supabase
      .from('conversations')
      .update({ current_state })
      .eq('id', id)
      .eq('workspace_id', workspace.id)
      .select()
      .single()

    if (error) {
      console.error('Error updating conversation:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Conversation update API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get workspace
    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .select('id')
      .eq('owner_id', user.id)
      .single()

    if (workspaceError || !workspace) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }

    // Verify conversation belongs to this workspace
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id')
      .eq('id', id)
      .eq('workspace_id', workspace.id)
      .single()

    if (convError || !conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // Delete messages first (FK constraint)
    await supabase
      .from('messages')
      .delete()
      .eq('conversation_id', id)

    // Reset the conversation instead of deleting it
    const { error: resetError } = await supabase
      .from('conversations')
      .update({
        context: {
          state: 'IDLE',
          cart: [],
          checkout: {},
          metadata: { messageCount: 0 }
        },
        current_state: 'IDLE',
        memory_summary: null,
        memory_summarized_at: null,
        control_mode: 'bot',
        last_message_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('workspace_id', workspace.id)

    if (resetError) {
      console.error('Error resetting conversation:', resetError)
      return NextResponse.json({ error: resetError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Conversation delete API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

