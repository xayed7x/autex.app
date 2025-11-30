import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '5')
    
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

    // Fetch recent orders
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id, order_number, customer_name, total_amount, status, created_at, product_id')
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (ordersError) {
      console.error('Error fetching orders:', ordersError)
      return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 })
    }

    // Get product names for orders that have product_id
    const productIds = orders?.filter(o => o.product_id).map(o => o.product_id!) || []
    
    let productNames: Record<string, string> = {}
    if (productIds.length > 0) {
      const { data: products } = await supabase
        .from('products')
        .select('id, name')
        .in('id', productIds)

      productNames = products?.reduce((acc, p) => {
        acc[p.id] = p.name
        return acc
      }, {} as Record<string, string>) || {}
    }

    // Format orders for display
    const recentOrders = orders?.map(order => ({
      id: order.id,
      orderNumber: order.order_number || `ORD-${order.id.slice(0, 8)}`,
      customer: order.customer_name,
      product: order.product_id ? productNames[order.product_id] || 'Unknown Product' : 'Multiple Items',
      amount: Math.round(Number(order.total_amount || 0)),
      status: order.status,
      date: order.created_at,
    })) || []

    return NextResponse.json({ recentOrders })
  } catch (error) {
    console.error('Recent orders error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch recent orders' },
      { status: 500 }
    )
  }
}
