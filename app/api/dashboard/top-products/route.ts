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

    // Get orders with product details from last 30 days
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('product_id, quantity, product_price')
      .eq('workspace_id', workspace.id)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .not('product_id', 'is', null)

    if (ordersError) {
      console.error('Error fetching orders:', ordersError)
      return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 })
    }

    // Group by product and calculate totals
    const productSales: Record<string, { quantity: number; revenue: number }> = {}
    
    orders?.forEach(order => {
      const productId = order.product_id!
      if (!productSales[productId]) {
        productSales[productId] = { quantity: 0, revenue: 0 }
      }
      productSales[productId].quantity += order.quantity || 1
      productSales[productId].revenue += Number(order.product_price || 0) * (order.quantity || 1)
    })

    // Get product details
    const productIds = Object.keys(productSales)
    
    if (productIds.length === 0) {
      return NextResponse.json({ topProducts: [] })
    }

    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('id, name, price, image_urls, stock_quantity')
      .in('id', productIds)

    if (productsError) {
      console.error('Error fetching products:', productsError)
      return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 })
    }

    // Combine product data with sales data
    const topProducts = products?.map(product => ({
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.image_urls?.[0] || null,
      stock: product.stock_quantity,
      soldQuantity: productSales[product.id].quantity,
      revenue: Math.round(productSales[product.id].revenue),
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit) || []

    return NextResponse.json({ topProducts })
  } catch (error) {
    console.error('Top products error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch top products' },
      { status: 500 }
    )
  }
}
