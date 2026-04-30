import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { USD_TO_BDT_RATE } from '@/lib/ai/usage-tracker';

// System-wide cost analytics
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Get all usage data for the last 30 days
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    
    // We get last 1000 records for analysis to ensure totals are more accurate
    const { data: usageData, error } = await supabase
      .from('api_usage')
      .select('*, workspaces(name)')
      .gte('created_at', thirtyDaysAgo)
      .order('created_at', { ascending: false })
      .limit(1000);

    if (error) {
      console.error('Usage data error:', error);
      return NextResponse.json({ error: 'Failed to fetch usage data' }, { status: 500 });
    }

    // Aggregate data
    let totalCost = 0;
    let totalRequests = 0;
    let todayCost = 0;
    let weekCost = 0;
    let monthCost = 0;
    
    const breakdown: Record<string, { cost: number; count: number; tokens: number }> = {};
    const historyMap: Record<string, number> = {};
    const workspaceCosts: Record<string, { today: number; week: number; month: number; name?: string }> = {};
    const recentCalls: any[] = [];

    (usageData || []).forEach((record: any, index: number) => {
      // Cost comes raw from DB as USD, convert to BDT for consistent UI
      const cost = Number(record.cost) * USD_TO_BDT_RATE;
      const createdAt = record.created_at;
      const workspaceId = record.workspace_id;
      const tokens = record.total_tokens || 0;

      // Keep recent 100 calls for table
      if (index < 100) {
        recentCalls.push({
          id: record.id,
          date: createdAt,
          workspaceId,
          workspaceName: record.workspaces?.name || 'Unknown',
          feature: formatApiType(record.feature_name || record.api_type || 'unknown'),
          model: record.model || 'unknown',
          tokens,
          costUSD: Number(record.cost),
          costBDT: cost,
        });
      }

      totalCost += cost;
      totalRequests += 1;

      // Time-based aggregation
      if (createdAt >= todayStart) todayCost += cost;
      if (createdAt >= weekStart) weekCost += cost;
      if (createdAt >= monthStart) monthCost += cost;

      // Type breakdown (prefer new feature_name, fallback to old api_type)
      const type = record.feature_name || record.api_type || 'unknown';
      if (!breakdown[type]) breakdown[type] = { cost: 0, count: 0, tokens: 0 };
      breakdown[type].cost += cost;
      breakdown[type].count += 1;
      breakdown[type].tokens += tokens;

      // History by date
      const date = new Date(createdAt).toISOString().split('T')[0];
      if (!historyMap[date]) historyMap[date] = 0;
      historyMap[date] += cost;

      // Per-workspace costs
      if (workspaceId) {
        if (!workspaceCosts[workspaceId]) {
          workspaceCosts[workspaceId] = { today: 0, week: 0, month: 0 };
        }
        if (createdAt >= todayStart) workspaceCosts[workspaceId].today += cost;
        if (createdAt >= weekStart) workspaceCosts[workspaceId].week += cost;
        if (createdAt >= monthStart) workspaceCosts[workspaceId].month += cost;
      }
    });

    // Get workspace names
    const workspaceIds = Object.keys(workspaceCosts);
    if (workspaceIds.length > 0) {
      const { data: workspaces } = await supabase
        .from('workspaces')
        .select('id, name')
        .in('id', workspaceIds);
      
      (workspaces || []).forEach((ws: any) => {
        if (workspaceCosts[ws.id]) {
          workspaceCosts[ws.id].name = ws.name;
        }
      });
    }

    // Format breakdown
    const formattedBreakdown = Object.entries(breakdown)
      .map(([type, stats]) => ({
        type: formatApiType(type),
        rawType: type,
        cost: stats.cost,
        count: stats.count,
        percentage: totalCost > 0 ? (stats.cost / totalCost) * 100 : 0,
      }))
      .sort((a, b) => b.cost - a.cost);

    // Format history (last 30 days)
    const history = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      history.push({
        date: dateStr,
        displayDate: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        cost: historyMap[dateStr] || 0,
      });
    }

    // Format per-workspace breakdown
    const perWorkspace = Object.entries(workspaceCosts)
      .map(([id, costs]) => ({
        id,
        name: costs.name || 'Unknown',
        today: costs.today,
        week: costs.week,
        month: costs.month,
      }))
      .sort((a, b) => b.month - a.month);

    // Get conversation count for avg calculation
    const { count: convCount } = await supabase
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', monthStart);

    // -----------------------------------------------------------------
    // CALCULATE TWO SPECIFIC PRICING METRICS
    // -----------------------------------------------------------------
    const messengerCostsByConv: Record<string, number> = {};
    let commentCostsTotal = 0;
    let commentCallCount = 0;
    let voiceCostsTotal = 0;
    let voiceCallCount = 0;

    (usageData || []).forEach((record: any) => {
      // Use consistent BDT rate for all metrics
      const cost = Number(record.cost) * USD_TO_BDT_RATE;
      const feature = record.feature_name;

      // Group Messenger costs by conversation
      if (feature === 'agent_response' && record.conversation_id) {
        messengerCostsByConv[record.conversation_id] = (messengerCostsByConv[record.conversation_id] || 0) + cost;
      }

      // Track Comment Classification as single-inference events
      if (feature === 'comment_auto_reply') {
        commentCostsTotal += cost;
        commentCallCount += 1;
      }

      // Track Voice Transcription events
      if (feature === 'voice_transcription') {
        voiceCostsTotal += cost;
        voiceCallCount += 1;
      }
    });

    const messengerConvIds = Object.keys(messengerCostsByConv);
    const avgCostMessenger = messengerConvIds.length > 0
      ? Object.values(messengerCostsByConv).reduce((a, b) => a + b, 0) / messengerConvIds.length
      : 0;
    
    const avgCostComment = commentCallCount > 0
      ? commentCostsTotal / commentCallCount
      : 0;

    const avgCostVoiceTotal = voiceCallCount > 0
      ? voiceCostsTotal / voiceCallCount
      : 0;

    return NextResponse.json({
      summary: {
        totalCost,
        totalRequests,
        todayCost,
        weekCost,
        monthCost,
        avgCostPerConversation: (convCount || 0) > 0 
          ? (monthCost / (convCount || 1)).toFixed(2) 
          : '0.00',
        conversationsThisMonth: convCount || 0,
        exchangeRate: USD_TO_BDT_RATE,
        avgCostMessenger,
        avgCostComment,
        totalVoiceCost: voiceCostsTotal,
        totalVoiceRequests: voiceCallCount,
        avgCostVoice: avgCostVoiceTotal,
      },
      breakdown: formattedBreakdown,

      history: history.reverse(), // Reverse to show oldest to newest left-to-right on chart
      perWorkspace,
      recentCalls,
    });
  } catch (error) {
    console.error('Admin costs error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function formatApiType(type: string): string {
  switch (type) {
    case 'agent_response': return 'Sales Agent Chat';
    case 'memory_summarization': return 'Context Compression';
    case 'image_recognition_tier3': case 'openai_vision': return 'Vision Scan (Tier 3)';
    case 'auto_tagging': return 'Product Auto-Tagging';
    case 'hash_match': return 'Image Cache Hit';
    case 'voice_transcription': return 'Voice Transcription';
    default: return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
}
