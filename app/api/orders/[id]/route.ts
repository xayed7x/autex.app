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
    const { status, payment_status } = body

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

    // 3. Automated Notification Logic
    if (status && status !== existingOrder.status && existingOrder.conversation_id && existingOrder.fb_page_id) {
      // Get the customer PSID from the joined conversation data
      // Supabase returns relations as array or object. `conversations` is the relation name.
      const conversationData = Array.isArray(existingOrder.conversations) 
        ? existingOrder.conversations[0] 
        : existingOrder.conversations;
        
      const customerPsid = conversationData?.customer_psid;

      if (customerPsid) {
        // Load Workspace Settings to get templates
        const settings = await loadWorkspaceSettings(existingOrder.workspace_id)
        
        // Determine which template to send
        let messageTemplate = '';
        if (status === 'completed') {
          messageTemplate = settings.fastLaneMessages.orderConfirmed;
          
          // Deduct stock when the order is confirmed
          const { data: orderItemsData, error: itemsError } = await supabase
            .from('order_items')
            .select('product_id, quantity, selected_size, selected_color')
            .eq('order_id', existingOrder.id);
            
          if (!itemsError && orderItemsData && orderItemsData.length > 0) {
             // Map selected_size/color to size/color for the stock utility
             const orderItems = orderItemsData.map(item => ({
               product_id: item.product_id,
               quantity: item.quantity,
               size: item.selected_size,
               color: item.selected_color
             }));
             await deductStockFromOrderItems(supabase, orderItems);
          } else {
             console.error('[Order API] Could not fetch order_items for stock deduction:', itemsError);
          }
        } else if (status === 'cancelled') {
          messageTemplate = settings.fastLaneMessages.orderCancelled;
          
          // Note: If order transitions from 'completed' to 'cancelled', we should ideally restock.
          // But for now, we just implement deduct on confirm.
        }

        if (messageTemplate) {
          // Replace dynamic variables
          const finalMessage = messageTemplate
            .replace(/\{name\}/g, existingOrder.customer_name || 'Customer')
            .replace(/\{orderNumber\}/g, existingOrder.order_number || '')
            .replace(/\{deliveryDays\}/g, settings.deliveryTime || '3-5');

          // Send message
          try {
            await sendMessage(
              existingOrder.fb_page_id,
              customerPsid,
              finalMessage
            );

            // Save to messages table with sender_type: 'automated'
            await supabase.from('messages').insert({
              conversation_id: existingOrder.conversation_id,
              sender: 'bot',
              sender_type: 'automated', // IMPORTANT: Does not trigger bot pause
              message_type: 'text',
              message_text: finalMessage,
              created_at: new Date().toISOString()
            });

            console.log(`[Order API] Automated status notification sent to PSID ${customerPsid} for order ${existingOrder.id}`);
          } catch (msgError) {
            console.error('[Order API] Failed to send automated status message:', msgError);
            // Don't fail the API request if message sending fails
          }
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
