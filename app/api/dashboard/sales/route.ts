import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get('days') || '7')
    
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

    // Calculate date range
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // Fetch orders for the date range
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('created_at, total_amount, status')
      .eq('workspace_id', workspace.id)
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .order('created_at', { ascending: true })

    if (ordersError) {
      console.error('Error fetching orders:', ordersError)
      return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 })
    }

    // Group orders by date
    const salesByDate: Record<string, { revenue: number; orders: number }> = {}
    
    orders?.forEach(order => {
      const date = order.created_at.split('T')[0]
      if (!salesByDate[date]) {
        salesByDate[date] = { revenue: 0, orders: 0 }
      }
      salesByDate[date].revenue += Number(order.total_amount || 0)
      salesByDate[date].orders += 1
    })

    // Convert to array format for charts
    const chartData = Object.entries(salesByDate).map(([date, data]) => ({
      date,
      revenue: Math.round(data.revenue),
      orders: data.orders,
    }))

    return NextResponse.json({
      chartData,
      totalRevenue: orders?.reduce((sum, o) => sum + Number(o.total_amount || 0), 0) || 0,
      totalOrders: orders?.length || 0,
    })
  } catch (error) {
    console.error('Sales data error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch sales data' },
      { status: 500 }
    )
  }
}
