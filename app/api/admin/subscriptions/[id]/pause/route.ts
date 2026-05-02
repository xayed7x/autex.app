/**
 * POST /api/admin/subscriptions/:id/pause
 * 
 * Admin endpoint to pause a subscription.
 * Bot stops working but subscription time keeps ticking.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

// Admin email check - allows multiple emails separated by commas
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'admin@gmail.com').split(',').map(e => e.trim())

interface PauseRequest {
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

    const body: PauseRequest = await request.json().catch(() => ({}))
    const reason = body.reason || 'Admin initiated pause'

    // Get workspace
    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .select('id, name, admin_paused')
      .eq('id', workspaceId)
      .single()

    if (workspaceError || !workspace) {
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      )
    }

    if (workspace.admin_paused) {
      return NextResponse.json(
        { error: 'Already paused', message: 'This subscription is already paused' },
        { status: 400 }
      )
    }

    // Pause the subscription
    const { error: updateError } = await supabase
      .from('workspaces')
      .update({
        admin_paused: true,
        admin_paused_at: new Date().toISOString(),
        admin_paused_reason: reason,
      })
      .eq('id', workspaceId)

    if (updateError) {
      console.error('Error pausing subscription:', updateError)
      return NextResponse.json(
        { error: 'Failed to pause subscription' },
        { status: 500 }
      )
    }

    console.log(`⏸️ Subscription paused for ${workspace.name}: ${reason}`)

    return NextResponse.json({
      success: true,
      message: `Subscription paused for ${workspace.name}`,
      paused: true,
      reason,
    })
  } catch (error) {
    console.error('Error pausing subscription:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/admin/subscriptions/:id/pause
 * 
 * Resume a paused subscription
 */
export async function DELETE(
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
    
    if (user?.email !== ADMIN_EMAIL) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Admin access required' },
        { status: 403 }
      )
    }

    // Get workspace
    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .select('id, name')
      .eq('id', workspaceId)
      .single()

    if (workspaceError || !workspace) {
      return NextResponse.json(
        { error: 'Workspace not found' },
        { status: 404 }
      )
    }

    // Resume the subscription
    const { error: updateError } = await supabase
      .from('workspaces')
      .update({
        admin_paused: false,
        admin_paused_at: null,
        admin_paused_reason: null,
      })
      .eq('id', workspaceId)

    if (updateError) {
      console.error('Error resuming subscription:', updateError)
      return NextResponse.json(
        { error: 'Failed to resume subscription' },
        { status: 500 }
      )
    }

    console.log(`▶️ Subscription resumed for ${workspace.name}`)

    return NextResponse.json({
      success: true,
      message: `Subscription resumed for ${workspace.name}`,
      paused: false,
    })
  } catch (error) {
    console.error('Error resuming subscription:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
