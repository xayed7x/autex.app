import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// List all conversations across all workspaces
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get total count of all conversations
    const { count: totalConversations, error: countError } = await supabase
      .from('conversations')
      .select('id', { count: 'exact', head: true });

    if (countError) {
      console.error('Count error:', countError);
    }

    // Get conversations with workspace info, message counts, and order status in ONE query
    const { data: conversations, error } = await supabase
      .from('conversations')
      .select(`
        id,
        customer_name,
        current_state,
        last_message_at,
        workspace_id,
        workspaces!inner(id, name),
        messages(count),
        orders(id)
      `)
      .order('last_message_at', { ascending: false })
      .limit(200); // Optimized limit

    if (error) {
      console.error('Conversations error:', error);
      return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 });
    }

    // Map the results to the expected format
    const conversationsWithDetails = (conversations || []).map((conv: any) => ({
      id: conv.id,
      customerName: conv.customer_name || 'Unknown',
      workspaceName: conv.workspaces?.name || 'Unknown',
      workspaceId: conv.workspace_id,
      state: conv.current_state,
      messageCount: conv.messages?.[0]?.count || 0,
      lastMessageAt: conv.last_message_at,
      hasOrder: (conv.orders || []).length > 0,
    }));

    return NextResponse.json({
      conversations: conversationsWithDetails,
      total: totalConversations || conversationsWithDetails.length,
    });
  } catch (error) {
    console.error('Admin conversations error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
