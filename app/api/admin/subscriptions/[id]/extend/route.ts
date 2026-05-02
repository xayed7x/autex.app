/**
 * POST /api/admin/subscriptions/:id/extend
 * 
 * Admin endpoint to extend an existing subscription.
 * Adds days from TODAY (not from old expiry), records payment.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import { calculateExpiryDate, SUBSCRIPTION_PLANS } from '@/lib/subscription/utils'
import { sendAdminSubscriptionEmail } from '@/lib/email/send'

interface ExtendRequest {
  days?: number
  amount: number
  payment_method?: string
  transaction_id?: string
  notes?: string
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: workspaceId } = await params

    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Verify admin access - allow multiple admins from ADMIN_EMAILS
    const { createClient: createServerClient } = await import('@/lib/supabase/server')
    const serverSupabase = await createServerClient()
    const { data: { user } } = await serverSupabase.auth.getUser()
    
    const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'admin@gmail.com').split(',').map(e => e.trim())
    
    if (!user?.email || !ADMIN_EMAILS.includes(user.email)) {
      console.error(`[Admin] Unauthorized access attempt by: ${user?.email}`)
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Admin access required' },
        { status: 403 }
      )
    }

    const body: ExtendRequest = await request.json()

    if (typeof body.amount !== 'number' || body.amount <= 0) {
      return NextResponse.json(
        { error: 'Invalid amount', message: 'Amount must be a positive number' },
        { status: 400 }
      )
    }

    const daysToAdd = body.days || 30
    const paymentMethod = body.payment_method || 'bkash'

    // Get current workspace
    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .select('id, name, subscription_status, subscription_plan, subscription_expires_at, total_paid, owner_id')
      .eq('id', workspaceId)
      .single()

    if (workspaceError || !workspace) {
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      )
    }

    // Calculate new expiry from TODAY (not from old expiry)
    const newExpiryDate = calculateExpiryDate(daysToAdd)
    const newTotalPaid = (workspace.total_paid || 0) + body.amount

    // Update workspace
    const { error: updateError } = await supabase
      .from('workspaces')
      .update({
        subscription_status: 'active',
        subscription_expires_at: newExpiryDate.toISOString(),
        admin_paused: false,
        admin_paused_at: null,
        admin_paused_reason: null,
        last_payment_date: new Date().toISOString(),
        last_payment_amount: body.amount,
        last_payment_method: paymentMethod,
        total_paid: newTotalPaid,
      })
      .eq('id', workspaceId)

    if (updateError) {
      console.error('Error extending subscription:', updateError)
      return NextResponse.json(
        { error: 'Failed to extend subscription' },
        { status: 500 }
      )
    }

    // Record payment
    await supabase.from('payment_history').insert({
      workspace_id: workspaceId,
      amount: body.amount,
      payment_method: paymentMethod,
      transaction_id: body.transaction_id || null,
      plan_activated: workspace.subscription_plan || 'extension',
      duration_days: daysToAdd,
      notes: body.notes || `Extended by ${daysToAdd} days`,
      activated_by: user.email,
    })

    // Get owner email for notifications
    let ownerEmail: string | null = null
    try {
      const { data: { user: owner } } = await supabase.auth.admin.getUserById(workspace.owner_id)
      ownerEmail = owner?.email || null
    } catch (err) {
      console.error('Error getting owner email:', err)
    }

    // Send admin notification email (non-blocking)
    const planName = workspace.subscription_plan 
      ? SUBSCRIPTION_PLANS[workspace.subscription_plan as keyof typeof SUBSCRIPTION_PLANS]?.name 
      : 'Extension'
    
    sendAdminSubscriptionEmail(
      workspace.name,
      ownerEmail || 'Unknown',
      planName || 'Subscription Extension',
      body.amount,
      paymentMethod,
      daysToAdd,
      newExpiryDate,
      body.transaction_id,
      true // isRenewal
    ).catch(err => console.error('Error sending admin notification:', err))

    console.log(`✅ Subscription extended for ${workspace.name}: +${daysToAdd} days`)

    return NextResponse.json({
      success: true,
      message: `Subscription extended for ${workspace.name}`,
      subscription: {
        status: 'active',
        newExpiresAt: newExpiryDate.toISOString(),
        daysAdded: daysToAdd,
      },
      payment: {
        amount: body.amount,
        method: paymentMethod,
      },
    })
  } catch (error) {
    console.error('Error extending subscription:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
