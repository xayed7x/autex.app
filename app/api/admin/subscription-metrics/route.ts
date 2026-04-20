import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Aggregated subscription and revenue metrics
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString();
    const fourteenDaysFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();

    // Parallel queries
    const [
      workspacesResult,
      paymentHistoryResult,
      thisMonthPaymentsResult,
      lastMonthPaymentsResult,
      expiringTrialsResult,
      expiringSubsResult,
    ] = await Promise.all([
      // All workspaces with subscription data
      supabase
        .from('workspaces')
        .select('id, name, subscription_status, admin_paused, created_at, trial_ends_at, subscription_expires_at, total_paid'),
      
      // Total payment history
      supabase
        .from('payment_history')
        .select('id, amount, created_at, workspace_id'),
      
      // This month's payments
      supabase
        .from('payment_history')
        .select('amount')
        .gte('created_at', monthStart),
      
      // Last month's payments
      supabase
        .from('payment_history')
        .select('amount')
        .gte('created_at', lastMonthStart)
        .lt('created_at', monthStart),
      
      // Trials expiring soon
      supabase
        .from('workspaces')
        .select('id, name, trial_ends_at')
        .eq('subscription_status', 'trial')
        .lte('trial_ends_at', fourteenDaysFromNow)
        .gte('trial_ends_at', now.toISOString()),
      
      // Subscriptions expiring soon
      supabase
        .from('workspaces')
        .select('id, name, subscription_expires_at')
        .eq('subscription_status', 'active')
        .lte('subscription_expires_at', fourteenDaysFromNow)
        .gte('subscription_expires_at', now.toISOString()),
    ]);

    const workspaces = workspacesResult.data || [];
    const paymentHistory = paymentHistoryResult.data || [];

    // Count by status
    const counts = {
      total: workspaces.length,
      trial: workspaces.filter(w => w.subscription_status === 'trial').length,
      active: workspaces.filter(w => w.subscription_status === 'active' && !w.admin_paused).length,
      expired: workspaces.filter(w => w.subscription_status === 'expired').length,
      paused: workspaces.filter(w => w.admin_paused).length,
    };

    // Revenue calculations
    const totalRevenue = paymentHistory.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const thisMonthRevenue = (thisMonthPaymentsResult.data || []).reduce(
      (sum, p) => sum + (Number(p.amount) || 0), 0
    );
    const lastMonthRevenue = (lastMonthPaymentsResult.data || []).reduce(
      (sum, p) => sum + (Number(p.amount) || 0), 0
    );

    // Conversion metrics
    // paid = active users, churned = expired users who were once trial
    const paidUsers = counts.active;
    const churnedUsers = counts.expired;
    const conversionRate = (paidUsers + churnedUsers) > 0
      ? ((paidUsers / (paidUsers + churnedUsers)) * 100).toFixed(1)
      : '0.0';

    // Calculate avg time to convert (days from workspace creation to first payment)
    const usersWithPayments = new Set(paymentHistory.map(p => p.workspace_id));
    const convertedWorkspaces = workspaces.filter(w => usersWithPayments.has(w.id));
    
    let avgDaysToConvert = 0;
    if (convertedWorkspaces.length > 0) {
      const totalDays = convertedWorkspaces.reduce((sum, w) => {
        const firstPayment = paymentHistory
          .filter(p => p.workspace_id === w.id)
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0];
        
        if (firstPayment) {
          const days = Math.ceil(
            (new Date(firstPayment.created_at).getTime() - new Date(w.created_at).getTime()) / 
            (1000 * 60 * 60 * 24)
          );
          return sum + Math.max(0, days);
        }
        return sum;
      }, 0);
      avgDaysToConvert = Math.round(totalDays / convertedWorkspaces.length);
    }

    // Retention: users who paid more than once
    const paymentCountByWorkspace = paymentHistory.reduce((acc, p) => {
      acc[p.workspace_id] = (acc[p.workspace_id] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const firstTimePayers = usersWithPayments.size;
    const repeatPayers = Object.values(paymentCountByWorkspace).filter(count => count > 1).length;
    const retentionRate = firstTimePayers > 0 
      ? ((repeatPayers / firstTimePayers) * 100).toFixed(1)
      : '0.0';

    // Monthly revenue trend (last 6 months)
    const monthlyRevenue = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const nextMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const monthPayments = paymentHistory.filter(p => {
        const pDate = new Date(p.created_at);
        return pDate >= date && pDate < nextMonth;
      });
      monthlyRevenue.push({
        month: date.toLocaleDateString('en-US', { month: 'short' }),
        revenue: monthPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0),
      });
    }

    // Expiring soon (combine trials and subscriptions)
    const expiringSoon = [
      ...(expiringTrialsResult.data || []).map(w => ({
        id: w.id,
        name: w.name,
        type: 'trial' as const,
        expiresAt: w.trial_ends_at,
      })),
      ...(expiringSubsResult.data || []).map(w => ({
        id: w.id,
        name: w.name,
        type: 'subscription' as const,
        expiresAt: w.subscription_expires_at,
      })),
    ].sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime());

    return NextResponse.json({
      counts,
      conversion: {
        trialToPaidRate: parseFloat(conversionRate),
        avgDaysToConvert,
        retentionRate: parseFloat(retentionRate),
        paidUsers,
        churnedUsers,
        repeatPayers,
      },
      revenue: {
        total: totalRevenue,
        thisMonth: thisMonthRevenue,
        lastMonth: lastMonthRevenue,
        monthlyTrend: monthlyRevenue,
        avgPerUser: paidUsers > 0 ? Math.round(totalRevenue / paidUsers) : 0,
      },
      expiringSoon,
    });
  } catch (error) {
    console.error('Subscription metrics error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
