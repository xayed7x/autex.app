import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get workspace ID
    const { data: workspaceData } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .single();

    if (!workspaceData) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    const workspaceId = workspaceData.workspace_id;

    // Fetch all usage data for the workspace
    // Note: For a real production app with millions of rows, we would use a materialized view or RPC
    // But for this scale, fetching raw rows and aggregating in memory is fine and flexible
    const { data: usageData, error: usageError } = await supabase
      .from('api_usage')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: true });

    if (usageError) {
      console.error('Error fetching usage data:', usageError);
      return NextResponse.json({ error: 'Failed to fetch usage data' }, { status: 500 });
    }

    // Aggregate Data
    let totalCost = 0;
    let totalRequests = 0;
    const breakdown: Record<string, { cost: number; count: number }> = {};
    const historyMap: Record<string, number> = {};

    usageData.forEach((record) => {
      const cost = Number(record.cost);
      totalCost += cost;
      totalRequests += 1;

      // Breakdown by Type
      const type = record.api_type || 'unknown';
      if (!breakdown[type]) {
        breakdown[type] = { cost: 0, count: 0 };
      }
      breakdown[type].cost += cost;
      breakdown[type].count += 1;

      // History by Date
      const date = new Date(record.created_at).toISOString().split('T')[0];
      if (!historyMap[date]) {
        historyMap[date] = 0;
      }
      historyMap[date] += cost;
    });

    // Format for Frontend
    const formattedBreakdown = Object.entries(breakdown).map(([type, stats]) => ({
      type: formatApiType(type),
      rawType: type,
      cost: stats.cost,
      count: stats.count,
      percentage: totalCost > 0 ? (stats.cost / totalCost) * 100 : 0
    })).sort((a, b) => b.cost - a.cost);

    // Fill in missing dates for the last 30 days for a smooth chart
    const history = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      history.push({
        date: dateStr,
        displayDate: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        cost: historyMap[dateStr] || 0
      });
    }

    return NextResponse.json({
      total_cost: totalCost,
      total_requests: totalRequests,
      breakdown: formattedBreakdown,
      history
    });

  } catch (error) {
    console.error('Error in admin usage API:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function formatApiType(type: string): string {
  switch (type) {
    case 'openai_vision':
      return 'Image Recognition (Tier 3)';
    case 'auto_tagging':
      return 'Product Auto-Tagging';
    case 'gpt-4-turbo':
    case 'gpt-4':
      return 'Chatbot (GPT-4)';
    case 'gpt-3.5-turbo':
      return 'Chatbot (GPT-3.5)';
    default:
      return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }
}
