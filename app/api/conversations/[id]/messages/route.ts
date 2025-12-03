import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendMessage } from '@/lib/facebook/messenger'

export async function POST(
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

    // Parse request body
    const body = await request.json()
    const { text } = body

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json({ error: 'Message text is required' }, { status: 400 })
    }

    // Get conversation details
    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('id, fb_page_id, customer_psid, workspace_id')
      .eq('id', params.id)
      .eq('workspace_id', workspace.id)
      .single()

    if (conversationError || !conversation) {
      console.error('Error fetching conversation:', conversationError)
      return NextResponse.json(
        { error: 'Conversation not found or access denied' },
        { status: 404 }
      )
    }

    // Send message via Facebook Messenger
    try {
      const fbResponse = await sendMessage(
        conversation.fb_page_id.toString(),
        conversation.customer_psid,
        text.trim()
      )

      console.log('✅ Manual message sent via Facebook:', fbResponse.message_id)
    } catch (fbError: any) {
      console.error('❌ Facebook API error:', fbError)
      return NextResponse.json(
        { error: `Failed to send message: ${fbError.message}` },
        { status: 500 }
      )
    }

    // Save message to database with sender='human'
    const { data: savedMessage, error: saveError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversation.id,
        sender: 'human',
        message_text: text.trim(),
        message_type: 'text',
        attachments: null,
      })
      .select()
      .single()

    if (saveError) {
      console.error('Error saving message to database:', saveError)
      // Message was sent to Facebook but failed to save to DB
      // This is a partial success - we should still return success
      // but log the error for monitoring
      console.warn('⚠️ Message sent to Facebook but failed to save to database')
    }

    // Update conversation's last_message_at timestamp
    const { error: updateError } = await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', conversation.id)

    if (updateError) {
      console.error('Error updating conversation timestamp:', updateError)
    }

    return NextResponse.json({
      success: true,
      message: savedMessage || {
        conversation_id: conversation.id,
        sender: 'human',
        message_text: text.trim(),
        created_at: new Date().toISOString(),
      },
    })
  } catch (error) {
    console.error('Manual message API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
