import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { USD_TO_BDT_RATE } from '@/lib/ai/usage-tracker';

// List all workspaces with metrics
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get all workspaces with subscription data (simplified query)
    const { data: workspaces, error: wsError } = await supabase
      .from('workspaces')
      .select('id, name, created_at, owner_id, subscription_status, subscription_plan, trial_ends_at, subscription_expires_at, admin_paused, last_payment_date, total_paid')
      .order('created_at', { ascending: false });

    if (wsError) {
      console.error('Workspaces error:', wsError);
      return NextResponse.json({ error: 'Failed to fetch workspaces' }, { status: 500 });
    }

    // Get all profiles for lookup
    const ownerIds = (workspaces || []).map((ws: any) => ws.owner_id).filter(Boolean);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, business_name, phone')
      .in('id', ownerIds);
    
    const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

    // Get metrics for each workspace
    const workspacesWithMetrics = await Promise.all(
      (workspaces || []).map(async (ws: any) => {
        // Get profile from map
        const profile = profileMap.get(ws.owner_id);
        
        // Parallel queries for this workspace
        const [convResult, orderResult, todayCostResult, lifetimeCostResult, lastConvResult] = await Promise.all([
          // Conversation count
          supabase
            .from('conversations')
            .select('id', { count: 'exact', head: true })
            .eq('workspace_id', ws.id),
          
          // Order count
          supabase
            .from('orders')
            .select('id', { count: 'exact', head: true })
            .eq('workspace_id', ws.id),
          
          // Total cost (today)
          supabase
            .from('api_usage')
            .select('cost')
            .eq('workspace_id', ws.id)
            .gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),

          // Total cost (lifetime)
          supabase
            .from('api_usage')
            .select('cost')
            .eq('workspace_id', ws.id),
          
          // Last conversation
          supabase
            .from('conversations')
            .select('last_message_at')
            .eq('workspace_id', ws.id)
            .order('last_message_at', { ascending: false })
            .limit(1)
            .single(),
        ]);

        const totalConversations = convResult.count || 0;
        const totalOrders = orderResult.count || 0;
        const todayCost = (todayCostResult.data || []).reduce(
          (sum: number, row: any) => sum + (Number(row.cost) || 0) * USD_TO_BDT_RATE, 
          0
        );
        const lifetimeUsageCost = (lifetimeCostResult.data || []).reduce(
          (sum: number, row: any) => sum + (Number(row.cost) || 0) * USD_TO_BDT_RATE, 
          0
        );
        const successRate = totalConversations > 0 
          ? ((totalOrders / totalConversations) * 100).toFixed(1)
          : '0.0';

        return {
          id: ws.id,
          name: ws.name,
          businessName: profile?.business_name || ws.name,
          phone: profile?.phone || '-',
          createdAt: ws.created_at,
          totalConversations,
          totalOrders,
          successRate: parseFloat(successRate),
          todayCost,
          totalUsageCost: lifetimeUsageCost,
          lastActiveAt: lastConvResult.data?.last_message_at || ws.created_at,
          // Subscription fields
          subscriptionStatus: ws.subscription_status || 'trial',
          subscriptionPlan: ws.subscription_plan || null,
          trialEndsAt: ws.trial_ends_at || null,
          subscriptionExpiresAt: ws.subscription_expires_at || null,
          adminPaused: ws.admin_paused || false,
          lastPaymentDate: ws.last_payment_date || null,
          totalPaid: ws.total_paid || 0,
        };
      })
    );

    return NextResponse.json({
      workspaces: workspacesWithMetrics,
      total: workspacesWithMetrics.length,
    });
  } catch (error) {
    console.error('Admin workspaces error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
