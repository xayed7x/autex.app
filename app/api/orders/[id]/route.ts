import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { loadWorkspaceSettings } from '@/lib/workspace/settings'
import { sendMessage } from '@/lib/facebook/messenger'
import { deductStockFromOrderItems } from '@/lib/products/deduct-stock'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: order, error } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    return NextResponse.json(order)
  } catch (error) {
    console.error('Get order error:', error)
    return NextResponse.json({ error: 'Failed to fetch order' }, { status: 500 })
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { status, payment_status, staff_note } = body

    // 1. Fetch existing order to check if status actually changed
    // We also need conversation_id, fb_page_id, workspace_id, customer_name, order_number
    const { data: existingOrder, error: existingError } = await supabase
      .from('orders')
      .select('*, conversations(customer_psid)')
      .eq('id', id)
      .single()

    if (existingError || !existingOrder) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const updateData: any = {
      updated_at: new Date().toISOString(),
    }

    if (status) updateData.status = status
    if (payment_status) updateData.payment_status = payment_status
    if (staff_note !== undefined) updateData.staff_note = staff_note

    // 2. Perform the update
    const { data: order, error } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Update order error:', error)
      return NextResponse.json({ error: 'Failed to update order' }, { status: 500 })
    }

    // 3. Stock Deduction Logic (Preserved)
    if (status === 'completed' && existingOrder.status !== 'completed') {
      const settings = await loadWorkspaceSettings(existingOrder.workspace_id)
      
      if (settings.businessCategory !== 'food') {
        const { data: orderItemsData, error: itemsError } = await supabase
          .from('order_items')
          .select('product_id, quantity, selected_size, selected_color')
          .eq('order_id', existingOrder.id);
          
        if (!itemsError && orderItemsData && orderItemsData.length > 0) {
          const orderItems = orderItemsData.map(item => ({
            product_id: item.product_id,
            quantity: item.quantity,
            size: item.selected_size,
            color: item.selected_color
          }));
          await deductStockFromOrderItems(supabase, orderItems);
        } else if (itemsError) {
          console.error('[Order API] Could not fetch order_items for stock deduction:', itemsError);
        }
      }
    }

    return NextResponse.json(order)
  } catch (error) {
    console.error('Update order error:', error)
    return NextResponse.json({ error: 'Failed to update order' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { error } = await supabase
      .from('orders')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Delete order error:', error)
      return NextResponse.json({ error: 'Failed to delete order' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete order error:', error)
    return NextResponse.json({ error: 'Failed to delete order' }, { status: 500 })
  }
}
