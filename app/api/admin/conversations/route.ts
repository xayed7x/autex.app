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

    // Get conversations with workspace info (limiting to a higher number like 1000 for safety)
    const { data: conversations, error } = await supabase
      .from('conversations')
      .select(`
        id,
        customer_name,
        current_state,
        last_message_at,
        workspace_id,
        workspaces!inner(id, name)
      `)
      .order('last_message_at', { ascending: false })
      .limit(1000);

    if (error) {
      console.error('Conversations error:', error);
      return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 });
    }

    // Get message counts and order status for each conversation
    const conversationsWithDetails = await Promise.all(
      (conversations || []).map(async (conv: any) => {
        const [msgResult, orderResult] = await Promise.all([
          supabase
            .from('messages')
            .select('id', { count: 'exact', head: true })
            .eq('conversation_id', conv.id),
          supabase
            .from('orders')
            .select('id')
            .eq('conversation_id', conv.id)
            .limit(1),
        ]);

        return {
          id: conv.id,
          customerName: conv.customer_name || 'Unknown',
          workspaceName: conv.workspaces?.name || 'Unknown',
          workspaceId: conv.workspace_id,
          state: conv.current_state,
          messageCount: msgResult.count || 0,
          lastMessageAt: conv.last_message_at,
          hasOrder: (orderResult.data || []).length > 0,
        };
      })
    );

    return NextResponse.json({
      conversations: conversationsWithDetails,
      total: totalConversations || conversationsWithDetails.length,
    });
  } catch (error) {
    console.error('Admin conversations error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
