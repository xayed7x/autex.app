import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rate-limit'
import * as Sentry from '@sentry/nextjs'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limiting
    const isAllowed = checkRateLimit(user.id)
    if (!isAllowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      )
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
    const range = searchParams.get('range') || '7d'
    
    // Calculate date range
    const days = parseInt(range.replace('d', ''))
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)
    startDate.setHours(0, 0, 0, 0)

    // Fetch orders in date range
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('created_at, total_amount, status, product_id')
      .eq('workspace_id', workspace.id)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true })

    if (ordersError) {
      console.error('Error fetching orders:', ordersError)
      return NextResponse.json({ error: ordersError.message }, { status: 500 })
    }

    // Group sales by date
    const salesByDate: Record<string, { revenue: number; orders: number }> = {}
    let totalRevenue = 0
    let totalOrders = 0

    orders?.forEach((order) => {
      const date = order.created_at.split('T')[0]
      if (!salesByDate[date]) {
        salesByDate[date] = { revenue: 0, orders: 0 }
      }
      salesByDate[date].revenue += Number(order.total_amount)
      salesByDate[date].orders += 1
      totalRevenue += Number(order.total_amount)
      totalOrders += 1
    })

    // Fill in missing dates with zeros
    const dateArray: Array<{ date: string; revenue: number; orders: number }> = []
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      const dateStr = date.toISOString().split('T')[0]
      dateArray.push({
        date: dateStr,
        revenue: salesByDate[dateStr]?.revenue || 0,
        orders: salesByDate[dateStr]?.orders || 0,
      })
    }

    // Get top products
    const { data: topProductsData, error: topProductsError } = await supabase
      .from('orders')
      .select('product_id, total_amount, product_details')
      .eq('workspace_id', workspace.id)
      .gte('created_at', startDate.toISOString())
      .not('product_id', 'is', null)

    if (topProductsError) {
      console.error('Error fetching top products:', topProductsError)
    }

    // Aggregate by product
    const productStats: Record<string, { name: string; revenue: number; count: number }> = {}
    
    topProductsData?.forEach((order) => {
      const productId = order.product_id
      if (!productId) return
      
      if (!productStats[productId]) {
        productStats[productId] = {
          name: order.product_details?.name || 'Unknown Product',
          revenue: 0,
          count: 0,
        }
      }
      productStats[productId].revenue += Number(order.total_amount)
      productStats[productId].count += 1
    })

    const topProducts = Object.entries(productStats)
      .map(([id, stats]) => ({ id, ...stats }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)

    // Calculate conversion rate
    const { data: conversations, error: conversationsError } = await supabase
      .from('conversations')
      .select('id')
      .eq('workspace_id', workspace.id)
      .gte('created_at', startDate.toISOString())

    const totalConversations = conversations?.length || 0
    const conversionRate = totalConversations > 0 
      ? ((totalOrders / totalConversations) * 100).toFixed(1)
      : '0'

    // Calculate average order value
    const averageOrderValue = totalOrders > 0
      ? (totalRevenue / totalOrders).toFixed(2)
      : '0'

    // Get status breakdown
    const statusBreakdown = orders?.reduce((acc, order) => {
      const status = order.status || 'unknown'
      acc[status] = (acc[status] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    return NextResponse.json({
      salesByDate: dateArray,
      totalRevenue,
      totalOrders,
      topProducts,
      conversionRate: parseFloat(conversionRate),
      averageOrderValue: parseFloat(averageOrderValue),
      statusBreakdown,
      dateRange: range,
    })
  } catch (error) {
    console.error('Analytics API error:', error)
    Sentry.captureException(error, {
      tags: { api_route: 'analytics' }
    })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
