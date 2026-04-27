import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { Database } from '@/types/supabase'
import { decryptToken } from '@/lib/facebook/crypto-utils'
import { processingLock } from '@/lib/conversation/processing-lock'

const GRAPH_API_VERSION = 'v21.0'
const GRAPH_API_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`

/**
 * POST /api/conversations/[id]/send-message
 * 
 * Allows owner to send a message to a customer from the dashboard.
 * Updates control_mode to 'hybrid' and tracks manual reply.
 */
export async function POST(
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
        { error: 'Unauthorized', message: 'You must be logged in to send messages' }, 
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
    // 2. PARSE REQUEST BODY
    // ========================================
    
    const body = await request.json()
    const { text } = body

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json(
        { error: 'Invalid request', message: 'Message text is required' }, 
        { status: 400 }
      )
    }

    const messageText = text.trim()

    // ========================================
    // 3. GET CONVERSATION (with ownership check)
    // ========================================
    
    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('id, workspace_id, fb_page_id, customer_psid, control_mode, customer_name, needs_manual_response')
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
    // 4. GET FACEBOOK PAGE ACCESS TOKEN
    // ========================================
    
    // Use admin client to access facebook_pages (bypasses RLS)
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

    const { data: fbPage, error: pageError } = await adminSupabase
      .from('facebook_pages')
      .select('id, encrypted_access_token')
      .eq('id', conversation.fb_page_id)
      .single()

    if (pageError || !fbPage) {
      return NextResponse.json(
        { error: 'Facebook page not found', message: 'The connected Facebook page could not be found' }, 
        { status: 404 }
      )
    }

    // Decrypt access token
    let accessToken: string
    try {
      accessToken = decryptToken(fbPage.encrypted_access_token)
    } catch (decryptError) {
      console.error('Failed to decrypt access token:', decryptError)
      return NextResponse.json(
        { error: 'Token error', message: 'Failed to decrypt Facebook access token. Please reconnect your page.' }, 
        { status: 500 }
      )
    }

    // ========================================
    // 5. ACQUIRE LOCK AND SEND MESSAGE
    // ========================================
    
    // Check if bot is currently processing
    const botLock = processingLock.isLocked(conversationId)
    if (botLock?.lock_type === 'bot_processing') {
      console.log('🔒 [DASHBOARD SEND] Bot is processing, waiting briefly...')
      // Wait up to 2 seconds for bot to finish
      await processingLock.waitForLock(conversationId, 2000)
    }

    // Acquire lock for owner sending
    const lockAcquired = processingLock.acquireLock(conversationId, 'owner_sending', 3000)
    if (!lockAcquired) {
      console.log('⚠️ [DASHBOARD SEND] Could not acquire lock, proceeding anyway')
    }

    try {
      const requestBody = {
        recipient: {
          id: conversation.customer_psid,
        },
        message: {
          text: messageText,
        },
      }

      const apiUrl = `${GRAPH_API_BASE_URL}/${fbPage.id}/messages?access_token=${accessToken}`
      
      console.log(`📤 [DASHBOARD SEND] Sending message to ${conversation.customer_name || conversation.customer_psid}`)

    const fbResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    if (!fbResponse.ok) {
      const errorData = await fbResponse.json()
      console.error('Facebook API Error:', errorData)
      
      // Handle specific error cases
      if (fbResponse.status === 401) {
        return NextResponse.json(
          { error: 'Token expired', message: 'Your Facebook access token has expired. Please reconnect your page in Settings.' }, 
          { status: 401 }
        )
      }
      
      if (fbResponse.status === 429) {
        return NextResponse.json(
          { error: 'Rate limited', message: 'Too many messages sent. Please wait a moment and try again.' }, 
          { status: 429 }
        )
      }

      // Check for user-specific errors (e.g., 24-hour messaging window)
      if (errorData?.error?.code === 10 || errorData?.error?.error_subcode === 2018278) {
        return NextResponse.json(
          { error: 'Messaging window closed', message: 'Cannot send message. The 24-hour messaging window has expired. Wait for the customer to send a new message.' }, 
          { status: 400 }
        )
      }

      return NextResponse.json(
        { 
          error: 'Facebook API error', 
          message: errorData?.error?.message || 'Failed to send message via Facebook. Please try again.' 
        }, 
        { status: 500 }
      )
    }

    const fbResult = await fbResponse.json()
    console.log(`✅ [DASHBOARD SEND] Message sent successfully: ${fbResult.message_id}`)

    // ========================================
    // 6. UPDATE CONVERSATION CONTROL MODE & CLEAR MANUAL FLAG
    // ========================================
    
    const currentMode = conversation.control_mode || 'bot'
    // STRICTOR MANUAL PRESERVATION: If the conversation is flagged for review 
    // or already in manual mode, KEEP it in manual.
    const isFlagged = (conversation as any).needs_manual_response === true
    const newMode = (currentMode === 'manual' || isFlagged) ? 'manual' : 'hybrid'
    const now = new Date().toISOString()

    await adminSupabase
      .from('conversations')
      .update({
        control_mode: newMode,
        last_manual_reply_at: now,
        last_manual_reply_by: user.id,
        last_message_at: now,
        // Clear manual flag when owner responds
        needs_manual_response: false,
        manual_flag_reason: null,
        manual_flagged_at: null,
      })
      .eq('id', conversationId)

    console.log(`🎛️ [DASHBOARD SEND] Updated control_mode to: ${newMode}, cleared manual flag`)

    // ========================================
    // 7. SAVE MESSAGE TO DATABASE
    // ========================================
    
    const { data: savedMessage, error: messageError } = await adminSupabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender: 'page',
        sender_type: 'owner',
        message_text: messageText,
        message_type: 'text',
      })
      .select('id, created_at')
      .single()

    if (messageError) {
      console.error('Failed to save message to database:', messageError)
      // Don't return error - message was already sent successfully
    }

    // ========================================
    // 8. RETURN SUCCESS RESPONSE
    // ========================================
    
    return NextResponse.json({
      success: true,
      message_id: fbResult.message_id,
      recipient_id: fbResult.recipient_id,
      saved_message_id: savedMessage?.id,
      control_mode: newMode,
      timestamp: savedMessage?.created_at || now,
    })

    } finally {
      // Always release lock
      processingLock.releaseLock(conversationId)
    }

  } catch (error) {
    console.error('Dashboard send message error:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error', 
        message: 'An unexpected error occurred. Please try again.' 
      },
      { status: 500 }
    )
  }
}
