import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { invalidateSettingsCache } from '@/lib/workspace/settings-cache'
import { generateAndStoreExampleEmbeddings } from '@/lib/ai/embeddings/example-embeddings'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { Database } from '@/types/supabase'

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
      order_collection_style: body.order_collection_style,
      quick_form_prompt: body.quick_form_prompt,
      out_of_stock_message: body.out_of_stock_message,
      // Business Policies
      return_policy: body.returnPolicy,
      quality_guarantee: body.qualityGuarantee,
      business_category: body.businessCategory,
      business_address: body.businessAddress,
      exchange_policy: body.exchangePolicy,
      custom_faqs: body.customFaqs,
      conversation_examples: body.conversationExamples || [],
      business_context: body.businessContext,
      delivery_zones: body.deliveryZones,
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

    // Invalidate cache so the bot gets the new settings immediately
    invalidateSettingsCache(workspace.id)

    // Trigger embedding generation for conversation examples (fire-and-forget)
    if (body.conversationExamples && body.conversationExamples.length > 0) {
      const serviceClient = createServiceClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );
      generateAndStoreExampleEmbeddings(
        workspace.id,
        body.conversationExamples,
        serviceClient
      ).catch(err => console.error('[SETTINGS] Embedding generation failed:', err.message));
    }

    return NextResponse.json({ success: true, settings: data })
  } catch (error) {
    console.error('AI Settings update API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
