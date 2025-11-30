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

    // Get workspace
    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .select('id, name')
      .eq('owner_id', user.id)
      .single()

    if (workspaceError || !workspace) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }

    // Get workspace settings
    const { data: settings, error: settingsError } = await supabase
      .from('workspace_settings')
      .select('*')
      .eq('workspace_id', workspace.id)
      .single()

    // If no settings exist, return defaults
    if (settingsError || !settings) {
      const defaultConfig = {
        businessName: workspace.name || "Your Business",
        greeting: "আসসালামু আলাইকুম! 👋\nআমি আপনার AI assistant।\nআপনি কোন product খুঁজছেন?",
        tone: "friendly",
        bengaliPercent: 80,
        useEmojis: true,
        confidenceThreshold: 75,
        showImageConfirmation: true,
        deliveryCharges: {
          insideDhaka: 60,
          outsideDhaka: 120
        },
        deliveryTime: "3-5 business days",
        autoMentionDelivery: true,
        paymentMethods: {
          bkash: { enabled: true, number: "" },
          nagad: { enabled: true, number: "" },
          cod: { enabled: false }
        },
        paymentMessage: "Payment করতে আমাদের bKash এ send করুন।\nScreenshot পাঠালে আমরা verify করব।",
        behaviorRules: {
          multiProduct: false,
          askSize: true,
          showStock: true,
          offerAlternatives: false,
          sendConfirmation: true
        },
        fastLaneMessages: {
          productConfirm: "দারুণ! 🎉\n\nআপনার সম্পূর্ণ নামটি বলবেন?\n(Example: Zayed Bin Hamid)",
          productDecline: "কোনো সমস্যা নেই! 😊\n\nঅন্য product এর ছবি পাঠান অথবা \"help\" লিখুন।",
          nameCollected: "আপনার সাথে পরিচিত হয়ে ভালো লাগলো, {name}! 😊\n\nএখন আপনার ফোন নম্বর দিন। 📱\n(Example: 01712345678)",
          phoneCollected: "পেয়েছি! 📱\n\nএখন আপনার ডেলিভারি ঠিকানাটি দিন। 📍\n(Example: House 123, Road 4, Dhanmondi, Dhaka)",
          orderConfirmed: "✅ অর্ডারটি কনফার্ম করা হয়েছে!\n\nআপনার অর্ডার সফলভাবে সম্পন্ন হয়েছে। শীঘ্রই আমরা আপনার সাথে যোগাযোগ করবো।\n\nআমাদের সাথে কেনাকাটার জন্য ধন্যবাদ! 🎉",
          orderCancelled: "অর্ডার cancel করা হয়েছে। 😊\n\nকোনো সমস্যা নেই! নতুন অর্ডার করতে product এর ছবি পাঠান।"
        }
      }
      return NextResponse.json(defaultConfig)
    }

    // Return existing settings
    return NextResponse.json({
      businessName: settings.business_name || workspace.name,
      greeting: settings.greeting_message,
      tone: settings.conversation_tone,
      bengaliPercent: settings.bengali_percent,
      useEmojis: settings.use_emojis,
      confidenceThreshold: settings.confidence_threshold,
      showImageConfirmation: settings.show_image_confirmation,
      deliveryCharges: {
        insideDhaka: settings.delivery_charge_inside_dhaka,
        outsideDhaka: settings.delivery_charge_outside_dhaka
      },
      deliveryTime: settings.delivery_time,
      autoMentionDelivery: settings.auto_mention_delivery,
      paymentMethods: settings.payment_methods,
      paymentMessage: settings.payment_message,
      behaviorRules: settings.behavior_rules,
      fastLaneMessages: settings.fast_lane_messages || {
        productConfirm: "দারুণ! 🎉\n\nআপনার সম্পূর্ণ নামটি বলবেন?\n(Example: Zayed Bin Hamid)",
        productDecline: "কোনো সমস্যা নেই! 😊\n\nঅন্য product এর ছবি পাঠান অথবা \"help\" লিখুন।",
        nameCollected: "আপনার সাথে পরিচিত হয়ে ভালো লাগলো, {name}! 😊\n\nএখন আপনার ফোন নম্বর দিন। 📱\n(Example: 01712345678)",
        phoneCollected: "পেয়েছি! 📱\n\nএখন আপনার ডেলিভারি ঠিকানাটি দিন। 📍\n(Example: House 123, Road 4, Dhanmondi, Dhaka)",
        orderConfirmed: "✅ অর্ডারটি কনফার্ম করা হয়েছে!\n\nআপনার অর্ডার সফলভাবে সম্পন্ন হয়েছে। শীঘ্রই আমরা আপনার সাথে যোগাযোগ করবো।\n\nআমাদের সাথে কেনাকাটার জন্য ধন্যবাদ! 🎉",
        orderCancelled: "অর্ডার cancel করা হয়েছে। 😊\n\nকোনো সমস্যা নেই! নতুন অর্ডার করতে product এর ছবি পাঠান।"
      }
    })
  } catch (error) {
    console.error('AI Setup API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get workspace
    const { data: workspace, error: workspaceError } = await supabase
      .from('workspaces')
      .select('id')
      .eq('owner_id', user.id)
      .single()

    if (workspaceError || !workspace) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }

    const body = await request.json()

    // Prepare settings data
    const settingsData = {
      workspace_id: workspace.id,
      business_name: body.businessName,
      greeting_message: body.greeting,
      conversation_tone: body.tone,
      bengali_percent: body.bengaliPercent,
      use_emojis: body.useEmojis,
      confidence_threshold: body.confidenceThreshold,
      show_image_confirmation: body.showImageConfirmation,
      delivery_charge_inside_dhaka: body.deliveryCharges?.insideDhaka,
      delivery_charge_outside_dhaka: body.deliveryCharges?.outsideDhaka,
      delivery_time: body.deliveryTime,
      auto_mention_delivery: body.autoMentionDelivery,
      payment_methods: body.paymentMethods,
      payment_message: body.paymentMessage,
      behavior_rules: body.behaviorRules,
      fast_lane_messages: body.fastLaneMessages,
    }

    // Upsert settings (insert or update)
    const { data, error } = await supabase
      .from('workspace_settings')
      .upsert(settingsData, {
        onConflict: 'workspace_id'
      })
      .select()
      .single()

    if (error) {
      console.error('Error saving AI settings:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Invalidate settings cache so next load gets fresh data
    const { invalidateSettingsCache } = await import('@/lib/workspace/settings-cache');
    invalidateSettingsCache(workspace.id);

    return NextResponse.json({ 
      success: true, 
      message: 'AI configuration saved successfully',
      data 
    })
  } catch (error) {
    console.error('AI Setup update API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
