import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Single conversation detail with messages and costs
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const USD_TO_BDT = 120;

    // Get conversation with workspace
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select(`
        id,
        customer_name,
        customer_psid,
        current_state,
        context,
        created_at,
        last_message_at,
        workspace_id,
        workspaces!inner(id, name)
      `)
      .eq('id', id)
      .single();

    if (convError || !conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Get messages
    const { data: messages, error: msgError } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true });

    // Get order if exists
    const { data: order } = await supabase
      .from('orders')
      .select('id, order_number, total_amount, status, created_at')
      .eq('conversation_id', id)
      .single();

    // Get API costs for this conversation
    const { data: apiCosts } = await supabase
      .from('api_usage')
      .select('api_type, cost, created_at')
      .eq('conversation_id', id)
      .order('created_at', { ascending: true });

    // If no conversation-level costs, get workspace costs during the conversation time
    let costs = apiCosts || [];
    if (costs.length === 0 && conversation.created_at && conversation.last_message_at) {
      const { data: workspaceCosts } = await supabase
        .from('api_usage')
        .select('api_type, cost, created_at')
        .eq('workspace_id', conversation.workspace_id)
        .gte('created_at', conversation.created_at)
        .lte('created_at', conversation.last_message_at)
        .order('created_at', { ascending: true });
      costs = workspaceCosts || [];
    }

    // Calculate total cost
    const totalCost = costs.reduce((sum, c) => sum + (Number(c.cost) || 0) * USD_TO_BDT, 0);

    // Cost breakdown
    const breakdown: Record<string, { cost: number; count: number }> = {};
    costs.forEach((c: any) => {
      const type = c.api_type || 'unknown';
      if (!breakdown[type]) breakdown[type] = { cost: 0, count: 0 };
      breakdown[type].cost += (Number(c.cost) || 0) * USD_TO_BDT;
      breakdown[type].count += 1;
    });

    const costBreakdown = Object.entries(breakdown)
      .map(([type, stats]) => ({
        type: formatApiType(type),
        rawType: type,
        cost: stats.cost,
        count: stats.count,
      }))
      .sort((a, b) => b.cost - a.cost);

    // Calculate duration
    const startTime = new Date(conversation.created_at).getTime();
    const endTime = new Date(conversation.last_message_at).getTime();
    const durationMinutes = Math.round((endTime - startTime) / (1000 * 60));

    // Determine outcome
    let outcome: 'active' | 'ordered' | 'abandoned' = 'active';
    if (order) {
      outcome = 'ordered';
    } else if (conversation.current_state === 'IDLE') {
      outcome = 'abandoned';
    }

    return NextResponse.json({
      conversation: {
        id: conversation.id,
        customerName: conversation.customer_name || 'Unknown',
        customerPsid: conversation.customer_psid,
        state: conversation.current_state,
        createdAt: conversation.created_at,
        lastMessageAt: conversation.last_message_at,
        durationMinutes,
        outcome,
        workspaceId: conversation.workspace_id,
        workspaceName: (conversation as any).workspaces?.name || 'Unknown',
      },
      messages: (messages || []).map((msg: any) => ({
        id: msg.id,
        senderType: msg.sender_type,
        text: msg.message_text,
        attachments: msg.attachments,
        imageUrl: msg.image_url,
        createdAt: msg.created_at,
      })),
      order: order ? {
        id: order.id,
        orderNumber: order.order_number,
        totalAmount: order.total_amount,
        status: order.status,
        createdAt: order.created_at,
      } : null,
      costs: {
        total: totalCost,
        breakdown: costBreakdown,
        roi: order ? ((Number(order.total_amount) - totalCost) / totalCost * 100).toFixed(0) : null,
        profit: order ? Number(order.total_amount) - totalCost : null,
      },
    });
  } catch (error) {
    console.error('Conversation detail error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function formatApiType(type: string): string {
  switch (type) {
    case 'openai_vision': return 'Vision API';
    case 'auto_tagging': return 'Auto Tagging';
    case 'gpt-4-turbo': case 'gpt-4': return 'AI Director';
    case 'gpt-3.5-turbo': return 'AI (GPT-3.5)';
    case 'hash_match': return 'Cache Hit';
    default: return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
}
