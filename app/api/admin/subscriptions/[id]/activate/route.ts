/**
 * POST /api/admin/subscriptions/:id/activate
 * 
 * Admin endpoint to activate a subscription after payment verification.
 * Sets status to 'active', calculates expiry from today, records payment.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'
import { calculateExpiryDate, SUBSCRIPTION_PLANS, type SubscriptionPlan } from '@/lib/subscription/utils'
import { sendAdminSubscriptionEmail, sendSubscriptionActivatedEmail } from '@/lib/email/send'

// Admin email check
const ADMIN_EMAIL = 'admin@gmail.com'

interface ActivateRequest {
  plan: SubscriptionPlan
  duration_days?: number
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

    // Create service role client
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Verify admin access via auth header or session
    const authHeader = request.headers.get('authorization')
    let adminEmail: string | null = null

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7)
      const { data: { user } } = await supabase.auth.getUser(token)
      adminEmail = user?.email || null
    } else {
      // Try to get from cookies (for browser requests)
      const { createClient: createServerClient } = await import('@/lib/supabase/server')
      const serverSupabase = await createServerClient()
      const { data: { user } } = await serverSupabase.auth.getUser()
      adminEmail = user?.email || null
    }

    if (adminEmail !== ADMIN_EMAIL) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Admin access required' },
        { status: 403 }
      )
    }

    // Parse request body
    const body: ActivateRequest = await request.json()

    // Validate required fields
    if (!body.plan || !SUBSCRIPTION_PLANS[body.plan]) {
      return NextResponse.json(
        { error: 'Invalid plan', message: 'Plan must be one of: starter, growth, pro' },
        { status: 400 }
      )
    }

    if (typeof body.amount !== 'number' || body.amount <= 0) {
      return NextResponse.json(
        { error: 'Invalid amount', message: 'Amount must be a positive number' },
        { status: 400 }
      )
    }

    const durationDays = body.duration_days || 30
    const paymentMethod = body.payment_method || 'bkash'

    // Check workspace exists and get owner
    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .select('id, name, subscription_status, total_paid, owner_id')
      .eq('id', workspaceId)
      .single()

    if (workspaceError || !workspace) {
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      )
    }

    // Calculate expiry from today
    const expiryDate = calculateExpiryDate(durationDays)
    const newTotalPaid = (workspace.total_paid || 0) + body.amount

    // Update workspace subscription
    const { error: updateError } = await supabase
      .from('workspaces')
      .update({
        subscription_status: 'active',
        subscription_plan: body.plan,
        subscription_expires_at: expiryDate.toISOString(),
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
      console.error('Error updating workspace:', updateError)
      return NextResponse.json(
        { error: 'Failed to activate subscription' },
        { status: 500 }
      )
    }

    // Record payment in history
    const { error: paymentError } = await supabase
      .from('payment_history')
      .insert({
        workspace_id: workspaceId,
        amount: body.amount,
        payment_method: paymentMethod,
        transaction_id: body.transaction_id || null,
        plan_activated: body.plan,
        duration_days: durationDays,
        notes: body.notes || null,
        activated_by: adminEmail,
      })

    if (paymentError) {
      console.error('Error recording payment:', paymentError)
      // Don't fail the request, subscription is already activated
    }

    // Determine if this is a renewal (was already active before)
    const isRenewal = workspace.subscription_status === 'active'

    // Get owner email for notifications
    let ownerEmail: string | null = null
    try {
      const { data: { user } } = await supabase.auth.admin.getUserById(workspace.owner_id)
      ownerEmail = user?.email || null
    } catch (err) {
      console.error('Error getting owner email:', err)
    }

    // Send admin notification email (non-blocking)
    sendAdminSubscriptionEmail(
      workspace.name,
      ownerEmail || 'Unknown',
      SUBSCRIPTION_PLANS[body.plan].name,
      body.amount,
      paymentMethod,
      durationDays,
      expiryDate,
      body.transaction_id,
      isRenewal
    ).catch(err => console.error('Error sending admin notification:', err))

    // Send user activation email (non-blocking)
    if (ownerEmail) {
      sendSubscriptionActivatedEmail(
        ownerEmail,
        workspace.name,
        SUBSCRIPTION_PLANS[body.plan].name,
        expiryDate,
        durationDays
      ).catch(err => console.error('Error sending user activation email:', err))
    }

    console.log(`✅ Subscription activated for ${workspace.name}: ${body.plan} for ${durationDays} days`)

    return NextResponse.json({
      success: true,
      message: `Subscription activated for ${workspace.name}`,
      subscription: {
        status: 'active',
        plan: body.plan,
        planName: SUBSCRIPTION_PLANS[body.plan].name,
        expiresAt: expiryDate.toISOString(),
        durationDays,
      },
      payment: {
        amount: body.amount,
        method: paymentMethod,
        transactionId: body.transaction_id,
      },
    })
  } catch (error) {
    console.error('Error activating subscription:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
