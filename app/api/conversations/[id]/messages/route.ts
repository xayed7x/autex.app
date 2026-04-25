import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendMessage, sendImage } from '@/lib/facebook/messenger'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params
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
    const { text, attachment_url, attachment_type } = body
 
    if ((!text || text.trim().length === 0) && !attachment_url) {
      return NextResponse.json({ error: 'Message text or attachment is required' }, { status: 400 })
    }

    // Get conversation details
    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('id, fb_page_id, customer_psid, workspace_id, control_mode')
      .eq('id', conversationId)
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
      if (attachment_url) {
        // Send media attachment
        await sendImage(
          conversation.fb_page_id.toString(),
          conversation.customer_psid,
          attachment_url,
          attachment_type === 'video' ? 'video' : 'image'
        )
        
        // If there's also text, send it as a separate message
        if (text && text.trim().length > 0) {
          await sendMessage(
            conversation.fb_page_id.toString(),
            conversation.customer_psid,
            text.trim()
          )
        }
      } else {
        // Send plain text message
        await sendMessage(
          conversation.fb_page_id.toString(),
          conversation.customer_psid,
          text.trim()
        )
      }
 
      console.log('✅ Manual message(s) sent via Facebook')
    } catch (fbError: any) {
      console.error('❌ Facebook API error:', fbError)
      return NextResponse.json(
        { error: `Failed to send message: ${fbError.message}` },
        { status: 500 }
      )
    }
 
    // Save message to database
    const { data: savedMessage, error: saveError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversation.id,
        sender: 'human',
        sender_type: 'owner',
        message_text: text?.trim() || null,
        message_type: attachment_type || 'text',
        image_url: attachment_type === 'image' ? attachment_url : null,
        attachments: attachment_url ? [{ 
          type: attachment_type || 'image', 
          payload: { url: attachment_url } 
        }] : null,
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

    // Update conversation's last_message_at and manual reply timestamps
    // We NO LONGER force hybrid mode here as per user request: "the bot will always be enabled"
    const now = new Date().toISOString()
    
    const { error: updateError } = await supabase
      .from('conversations')
      .update({ 
        last_message_at: now,
        last_manual_reply_at: now,
        // Clear manual flag when owner responds
        needs_manual_response: false,
        manual_flag_reason: null,
        manual_flagged_at: null,
      })
      .eq('id', conversation.id)

    if (updateError) {
      console.error('Error updating conversation:', updateError)
    } else {
      console.log(`🎛️ [MANUAL MESSAGE] Updated timestamps, maintained mode: ${conversation.control_mode || 'bot'}`)
    }

    return NextResponse.json({
      success: true,
      message: savedMessage || {
        conversation_id: conversation.id,
        sender: 'human',
        message_text: text?.trim() || null,
        message_type: attachment_type || 'text',
        created_at: new Date().toISOString(),
      },
      control_mode: conversation.control_mode || 'bot',
    })
  } catch (error) {
    console.error('Manual message API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
