import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
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
          message_text,
          message_type,
          attachments,
          created_at
        )
      `)
      .eq('id', params.id)
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
      
      // Deduplicate consecutive messages with same content and sender
      const deduplicatedMessages = []
      let lastMessage = null
      
      for (const message of conversation.messages) {
        // Check if this is a duplicate of the last message
        const isDuplicate = lastMessage && 
          lastMessage.sender === message.sender &&
          lastMessage.message_text === message.message_text &&
          Math.abs(new Date(lastMessage.created_at).getTime() - new Date(message.created_at).getTime()) < 5000 // Within 5 seconds
        
        if (!isDuplicate) {
          deduplicatedMessages.push(message)
          lastMessage = message
        }
      }
      
      conversation.messages = deduplicatedMessages
    }

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
  { params }: { params: { id: string } }
) {
  try {
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
      .eq('id', params.id)
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

