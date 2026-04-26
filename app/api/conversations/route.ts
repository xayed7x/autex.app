import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
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

    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || 'all'
    const search = searchParams.get('search') || ''
    const needsManualResponse = searchParams.get('needs_manual_response')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = (page - 1) * limit

    // Build query
    let query = supabase
      .from('conversations')
      .select(`
        *,
        messages (
          id,
          sender,
          sender_type,
          message_text,
          message_type,
          created_at
        )
      `, { count: 'exact' })
      .order('created_at', { foreignTable: 'messages', ascending: false })
      .eq('workspace_id', workspace.id)
      .order('last_message_at', { ascending: false })
      .range(offset, offset + limit - 1)

    // Apply filters
    if (search) {
      query = query.or(`customer_name.ilike.%${search}%,customer_psid.ilike.%${search}%`)
    }

    if (status !== 'all') {
      query = query.eq('current_state', status.toUpperCase())
    }

    // Filter for conversations needing manual response
    if (needsManualResponse === 'true') {
      query = query.eq('needs_manual_response', true)
    }

    const { data: conversations, error: conversationsError, count } = await query

    if (conversationsError) {
      console.error('Error fetching conversations:', conversationsError)
      return NextResponse.json({ error: conversationsError.message }, { status: 500 })
    }

    // Get message counts for each conversation
    const conversationsWithCounts = await Promise.all(
      (conversations || []).map(async (conversation) => {
        const { count: messageCount } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('conversation_id', conversation.id)

        return {
          ...conversation,
          message_count: messageCount || 0,
          last_message: conversation.messages?.[0] || null
        }
      })
    )

    // Get count of conversations needing manual response (for badge)
    // Only count if they are NOT in bot or hybrid mode
    const { count: manualCount } = await supabase
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspace.id)
      .eq('needs_manual_response', true)
      .not('control_mode', 'in', '("bot","hybrid")')

    return NextResponse.json({
      conversations: conversationsWithCounts,
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
      manualResponseCount: manualCount || 0
    })
  } catch (error) {
    console.error('Conversations API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
