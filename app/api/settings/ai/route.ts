import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get workspace for user
    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .select('id')
      .eq('owner_id', user.id)
      .single()

    if (workspaceError || !workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }

    // Get workspace settings
    const { data: settings, error: settingsError } = await supabase
      .from('workspace_settings')
      .select('*')
      .eq('workspace_id', workspace.id)
      .single()

    // If no settings exist, return null (frontend will use defaults)
    if (settingsError && settingsError.code !== 'PGRST116') {
      console.error('Error fetching settings:', settingsError)
      return NextResponse.json({ error: settingsError.message }, { status: 500 })
    }

    return NextResponse.json({ settings: settings || null })
  } catch (error) {
    console.error('AI Settings API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    
    // Get workspace for user
    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .select('id')
      .eq('owner_id', user.id)
      .single()

    if (workspaceError || !workspace) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }

    // Prepare update data
    const updateData = {
      workspace_id: workspace.id,
      business_name: body.businessName,
      greeting_message: body.greeting,
      conversation_tone: body.tone,
      bengali_percent: body.bengaliPercent,
      use_emojis: body.useEmojis,
      confidence_threshold: body.confidenceThreshold,
      delivery_charge_inside_dhaka: body.deliveryCharges?.insideDhaka,
      delivery_charge_outside_dhaka: body.deliveryCharges?.outsideDhaka,
      delivery_time: body.deliveryTime,
      payment_methods: body.paymentMethods,
      payment_message: body.paymentMessage,
      behavior_rules: body.behaviorRules,
      fast_lane_messages: body.fastLaneMessages,
      updated_at: new Date().toISOString()
    }

    // Upsert settings
    const { data, error } = await supabase
      .from('workspace_settings')
      .upsert(updateData, { onConflict: 'workspace_id' })
      .select()
      .single()

    if (error) {
      console.error('Error updating settings:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Invalidate cache (if we had a way to call the server-side cache invalidation from here)
    // For now, we rely on the cache TTL or manual invalidation if needed

    return NextResponse.json({ success: true, settings: data })
  } catch (error) {
    console.error('AI Settings update API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
