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

    // Get user's workspace
    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .select('id')
      .eq('owner_id', user.id)
      .single()

    if (workspaceError || !workspace) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }

    const workspaceId = workspace.id

    // Calculate date ranges
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayISO = today.toISOString()

    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)
    const startOfMonthISO = startOfMonth.toISOString()

    // Fetch orders today
    const { data: ordersToday, error: ordersError } = await supabase
      .from('orders')
      .select('total_amount')
      .eq('workspace_id', workspaceId)
      .gte('created_at', todayISO)

    if (ordersError) {
      console.error('Error fetching orders:', ordersError)
    }

    const ordersCount = ordersToday?.length || 0
    const revenueToday = ordersToday?.reduce((sum, o) => sum + Number(o.total_amount || 0), 0) || 0

    // Fetch conversations for this workspace
    const { data: conversations, error: conversationsError } = await supabase
      .from('conversations')
      .select('id')
      .eq('workspace_id', workspaceId)

    const conversationIds = conversations?.map(c => c.id) || []

    // Fetch messages today
    let messagesCount = 0
    if (conversationIds.length > 0) {
      const { data: messagesData, error: messagesError } = await supabase
        .from('messages')
        .select('id')
        .in('conversation_id', conversationIds)
        .gte('created_at', todayISO)

      if (messagesError) {
        console.error('Error fetching messages:', messagesError)
      }

      messagesCount = messagesData?.length || 0
    }

    // Fetch AI usage this month
    const { data: apiUsage, error: apiUsageError } = await supabase
      .from('api_usage')
      .select('cost')
      .eq('workspace_id', workspaceId)
      .gte('created_at', startOfMonthISO)

    if (apiUsageError) {
      console.error('Error fetching API usage:', apiUsageError)
    }

    const aiCost = apiUsage?.reduce((sum, u) => sum + Number(u.cost || 0), 0) || 0

    // Calculate trends (compare with last week)
    const lastWeek = new Date(today)
    lastWeek.setDate(lastWeek.getDate() - 7)
    const lastWeekISO = lastWeek.toISOString()

    const { data: ordersLastWeek } = await supabase
      .from('orders')
      .select('total_amount')
      .eq('workspace_id', workspaceId)
      .gte('created_at', lastWeekISO)
      .lt('created_at', todayISO)

    const ordersLastWeekCount = ordersLastWeek?.length || 0
    const revenueLastWeek = ordersLastWeek?.reduce((sum, o) => sum + Number(o.total_amount || 0), 0) || 0

    const ordersTrend = ordersLastWeekCount > 0 
      ? Math.round(((ordersCount - ordersLastWeekCount) / ordersLastWeekCount) * 100)
      : 0

    const revenueTrend = revenueLastWeek > 0
      ? Math.round(((revenueToday - revenueLastWeek) / revenueLastWeek) * 100)
      : 0

    return NextResponse.json({
      ordersToday: ordersCount,
      revenueToday: Math.round(revenueToday),
      messagesToday: messagesCount,
      aiCostThisMonth: Math.round(aiCost * 100) / 100, // Round to 2 decimals
      trends: {
        orders: ordersTrend,
        revenue: revenueTrend,
      },
    })
  } catch (error) {
    console.error('Dashboard stats error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch dashboard stats' },
      { status: 500 }
    )
  }
}
