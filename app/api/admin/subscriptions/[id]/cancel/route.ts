/**
 * POST /api/admin/subscriptions/:id/cancel
 * 
 * Admin endpoint to cancel a subscription.
 * Sets status to 'expired', data is archived (not deleted).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

// Admin email check - allows multiple emails separated by commas
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'admin@gmail.com').split(',').map(e => e.trim())

interface CancelRequest {
  reason?: string
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

    // Verify admin access
    const { createClient: createServerClient } = await import('@/lib/supabase/server')
    const serverSupabase = await createServerClient()
    const { data: { user } } = await serverSupabase.auth.getUser()
    
    if (!user?.email || !ADMIN_EMAILS.includes(user.email)) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Admin access required' },
        { status: 403 }
      )
    }

    const body: CancelRequest = await request.json().catch(() => ({}))
    const reason = body.reason || 'Admin cancelled'

    // Get workspace
    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .select('id, name, subscription_status')
      .eq('id', workspaceId)
      .single()

    if (workspaceError || !workspace) {
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      )
    }

    if (workspace.subscription_status === 'expired') {
      return NextResponse.json(
        { error: 'Already cancelled', message: 'This subscription is already expired' },
        { status: 400 }
      )
    }

    // Cancel the subscription
    const { error: updateError } = await supabase
      .from('workspaces')
      .update({
        subscription_status: 'expired',
        admin_paused: false,
        admin_paused_at: null,
        admin_paused_reason: reason, // Keep reason for audit
      })
      .eq('id', workspaceId)

    if (updateError) {
      console.error('Error cancelling subscription:', updateError)
      return NextResponse.json(
        { error: 'Failed to cancel subscription' },
        { status: 500 }
      )
    }

    console.log(`❌ Subscription cancelled for ${workspace.name}: ${reason}`)

    return NextResponse.json({
      success: true,
      message: `Subscription cancelled for ${workspace.name}`,
      status: 'expired',
      reason,
      note: 'Data is archived and can be restored by reactivating the subscription.',
    })
  } catch (error) {
    console.error('Error cancelling subscription:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
