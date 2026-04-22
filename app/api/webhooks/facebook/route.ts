import { NextRequest, NextResponse } from 'next/server';
import {
  verifySignature,
  generateEventId,
  FacebookWebhookPayload,
  MessagingEvent,
} from '@/lib/facebook/utils';
import { processMessage } from '@/lib/conversation/orchestrator';
import { getCachedSettings } from '@/lib/workspace/settings-cache';
import { processingLock } from '@/lib/conversation/processing-lock';
import { logApiUsage } from '@/lib/ai/usage-tracker';
import { transcribeVoiceMessage } from '@/lib/ai/voice-transcription';
import { decryptToken } from '@/lib/facebook/crypto-utils';


export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * Protected states where bot should continue even if owner interrupts
 * These are critical order collection states - incomplete orders are bad UX
 */
const PROTECTED_STATES = [
  'COLLECTING_MULTI_VARIATIONS',
  'COLLECTING_NAME',
  'COLLECTING_PHONE',
  'COLLECTING_ADDRESS',
  'CONFIRMING_ORDER',
  'AWAITING_CUSTOMER_DETAILS',
  'COLLECTING_PAYMENT_DIGITS',
] as const;

/**
 * GET /api/webhooks/facebook
 * Handles Facebook webhook verification
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const verifyToken = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN;

  if (!verifyToken) {
    console.error('FACEBOOK_WEBHOOK_VERIFY_TOKEN is not configured');
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 }
    );
  }

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('Webhook verified successfully');
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn('Webhook verification failed');
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

/**
 * POST /api/webhooks/facebook
 * Handles incoming Facebook webhook events
 */
export async function POST(request: NextRequest) {
  console.log('🔥 [WEBHOOK] POST request received at:', new Date().toISOString());
  
  try {
    // ========================================
    // STEP 1: VERIFY SIGNATURE
    // ========================================
    
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    if (!appSecret) {
      console.error('❌ [WEBHOOK] FACEBOOK_APP_SECRET is not configured');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const rawBody = await request.text();
    const signature = request.headers.get('x-hub-signature-256');

    if (!signature || !verifySignature(rawBody, signature, appSecret)) {
      console.warn('❌ [WEBHOOK] Invalid webhook signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }
    console.log('✅ [WEBHOOK] Signature verified');

    // ========================================
    // STEP 2: PARSE PAYLOAD
    // ========================================
    
    const payload: FacebookWebhookPayload = JSON.parse(rawBody);
    console.log('📦 [WEBHOOK] Payload received, entries:', payload.entry?.length || 0);

    if (payload.object !== 'page' && payload.object !== 'instagram') {
      console.log(`⚠️ [WEBHOOK] Ignoring unsupported event object: ${payload.object}`);
      return NextResponse.json({ status: 'ok' }, { status: 200 });
    }

    const isInstagram = payload.object === 'instagram';
    if (isInstagram) {
      console.log('📸 [WEBHOOK] Instagram webhook event detected');
    }

    // ========================================
    // STEP 3: PROCESS ENTRIES
    // ========================================
    
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    if (payload.entry) {
      for (const entry of payload.entry) {
        if (isInstagram) {
          // Instagram events: entry.id is the Instagram Business Account ID
          if (entry.messaging) {
            for (const event of entry.messaging) {
              await processInstagramMessagingEvent(supabase, entry.id, event);
            }
          }
          
          // Handle Instagram changes (e.g., comments)
          if (entry.changes) {
            for (const change of entry.changes) {
              if (change.field === 'comments') {
                await processInstagramCommentEvent(supabase, entry.id, change.value);
              }
            }
          }
        } else {
          // Facebook Messenger events: entry.id is the Facebook Page ID
          if (entry.messaging) {
            for (const event of entry.messaging) {
              await processMessagingEvent(supabase, entry.id, event);
            }
          }
          
          // Handle Standby events (messages sent while our app is not the primary receiver)
          if (entry.standby) {
            for (const event of entry.standby) {
              console.log('👀 [STANDBY] Detected message while in standby mode');
              await processMessagingEvent(supabase, entry.id, event);
            }
          }
          
          // Handle changes (e.g., comments) — Messenger only
          if (entry.changes) {
            for (const change of entry.changes) {
              if (change.field === 'feed') {
                await processCommentEvent(supabase, entry.id, change.value);
              }
            }
          }
        }
      }
    }

    // ========================================
    // STEP 4: RESPOND
    // ========================================
    console.log('✅ [WEBHOOK] Processing complete, returning 200 OK');
    return NextResponse.json({ status: 'ok' }, { status: 200 });
  } catch (error) {
    console.error('❌ [WEBHOOK] Error processing webhook:', error);
    // Return 200 to prevent Facebook from retrying
    return NextResponse.json({ status: 'error' }, { status: 200 });
  }
}

// In-memory set to track processed event IDs within the current execution context
// to prevent race conditions during parallel webhook processing.
const processedEventIds = new Set<string>();

/**
 * Process a single messaging event
 * 
 * ENHANCED VERSION - Detects owner vs customer messages and handles hybrid control mode
 */
export async function processMessagingEvent(
  supabase: any,
  entryId: string,
  event: MessagingEvent
) {
  try {
    const { sender, recipient, timestamp, message } = event;
    const senderId = sender.id;
    const recipientId = recipient.id;
    const messageId = message?.mid || 'no-mid';
    const messageText = message?.text || '';
    
    // ========================================
    // 0. ROBUST IDEMPOTENCY LOCK
    // ========================================
    const eventId = generateEventId(entryId, timestamp, messageId);
    
    // Check in-memory first (fastest)
    if (processedEventIds.has(eventId)) {
      console.log(`🛡️ [IDEMPOTENCY] Blocked in-memory duplicate: ${eventId}`);
      return;
    }
    
    // Check DB (source of truth)
    const { data: existingEvent } = await supabase
      .from('webhook_events')
      .select('id')
      .eq('event_id', eventId)
      .single();

    if (existingEvent) {
      console.log(`🛡️ [IDEMPOTENCY] Blocked database duplicate: ${eventId}`);
      processedEventIds.add(eventId); // Sync memory
      return;
    }

    // Immediate insertion to lock the event ID
    try {
      await supabase.from('webhook_events').insert({
        event_id: eventId,
        event_type: 'messaging',
        payload: event,
      });
      processedEventIds.add(eventId);
      // Auto-cleanup memory after 60 seconds
      setTimeout(() => processedEventIds.delete(eventId), 60000);
    } catch (dbError) {
      // If insertion fails, it's likely a race condition where another thread just inserted it
      console.log(`🛡️ [IDEMPOTENCY] Blocked concurrent duplicate (DB insertion failed): ${eventId}`);
      processedEventIds.add(eventId);
      return;
    }

    // ========================================
    // FILTER ECHOES & SYSTEM MESSAGES
    // ========================================
    if (message?.is_echo) {
      const appId = (message as any).app_id;
      const ourAppId = process.env.FACEBOOK_APP_ID;
      
      // If it's an echo from OUR bot, ignore it (we already saved it)
      if (appId && String(appId) === String(ourAppId)) {
        console.log('🗣️ [ECHO] Ignoring bot\'s own message echo');
        return;
      }
      
      // Otherwise, it's an owner message from Messenger app/Meta Suite - continue processing
      console.log('👤 [ECHO] Detected manual reply echo from Messenger/Meta Suite');
    }

    
    // ========================================
    // DETECT MESSAGE SOURCE (Owner vs Customer)
    // ========================================
    
    // In Facebook webhooks, entry.id is ALWAYS the Page ID.
    // This is the most robust way to find the workspace.
    console.log(`🔍 [WEBHOOK_DEBUG] Entry ID: ${entryId}, Sender: ${senderId}, Recipient: ${recipientId}`);
    
    // Fetch the page using entries.id (Page ID)
    const { data: fbPageCheck, error: lookupError } = await supabase
      .from('facebook_pages')
      .select('id, workspace_id, bot_enabled, encrypted_access_token')
      .eq('id', entryId)
      .limit(1)
      .single();
    
    if (lookupError || !fbPageCheck) {
      console.error(`❌ [SOURCE DETECTION] No Facebook page record found for ID: ${entryId}. Re-sync might be needed.`);
      // Fallback matching logic
      const { data: fallbackPage } = await supabase
        .from('facebook_pages')
        .select('id, workspace_id, bot_enabled')
        .or(`id.eq.${senderId},id.eq.${recipientId}`)
        .limit(1)
        .single();
        
      if (!fallbackPage) return;
      fbPageCheck = fallbackPage;
    }

    const actualPageId = String(fbPageCheck.id);
    const isOwnerMessage = senderId === actualPageId;
    const customerPsid = isOwnerMessage ? recipientId : senderId;
    const pageId = actualPageId;
    
    console.log(`🔍 [SOURCE DETECTION] Workspace: ${fbPageCheck.workspace_id}, Is Owner: ${isOwnerMessage}, Customer: ${customerPsid}`);

    // Immediate Sender Action: Mark as Seen
    if (!isOwnerMessage) {
      const { markSeen } = await import('@/lib/facebook/messenger');
      await markSeen(actualPageId, customerPsid);
    }

    // If it's a customer message and the bot is enabled, take thread control from Meta Business Suite
    if (!isOwnerMessage && fbPageCheck.bot_enabled) {
      try {
        console.log('🤖 [HANDOVER] Requesting thread control for customer assist');
        const { takeThreadControl } = await import('@/lib/facebook/messenger');
        await takeThreadControl(pageId, customerPsid);
      } catch (handoverError) {
        console.warn('⚠️ [HANDOVER] Could not take thread control (non-fatal):', handoverError);
        // Continue anyway - bot can still respond without thread control in many cases
      }
    }

    // ========================================
    // GLOBAL BOT TOGGLE CHECK
    // ========================================
    const referral = event.referral || event.postback?.referral;
    if (!isOwnerMessage && fbPageCheck.bot_enabled === false) {
      console.log(`🛑 Bot disabled for page ${pageId} - skipping AI processing`);
      // Standard messages will be logged later in the flow if we don't return here.
      // But for postbacks and referrals, we should just halt.
      if (event.postback || referral) {
        return;
      }
      // For regular messages, we let it fall through to the message logging part 
      // but we must ENSURE we don't hit the orchestrator or transcription.
    }
    
    if (referral && referral.ref) {
      console.log(`🔗 [REFERRAL] Referral flow triggered. Ref: ${referral.ref}`);
      
      // Ensure conversation exists for logging
      const { data: conv } = await supabase.rpc('get_or_create_conversation', {
        p_workspace_id: fbPageCheck.workspace_id,
        p_fb_page_id: fbPageCheck.id,
        p_customer_psid: customerPsid
      });

      if (conv) {
        await supabase.from('messages').insert({
          conversation_id: conv.id,
          sender: customerPsid,
          sender_type: 'customer',
          message_text: `[Referral: ${referral.ref}]`,
          message_type: 'referral'
        });
      }

      if (referral.ref.startsWith('product_')) {
        const productId = referral.ref.replace('product_', '');
        await sendReferralProductCard(
          supabase,
          pageId,
          customerPsid,
          fbPageCheck.workspace_id,
          productId
        );
        return; // Halt standard processing
      }
    }

    // ========================================
    // HANDLE POSTBACK (Button Clicks)
    // ========================================
    
    if (event.postback) {
      const payload = event.postback.payload;
      console.log('🔘 Postback event detected:', payload);

      // Handle "Get Started" (new thread without product referral)
      if (payload === 'GET_STARTED') {
        console.log(`🚀 [GET_STARTED] Generic welcome for: ${customerPsid}`);
        
        // Ensure conversation exists for logging
        const { data: conv } = await supabase.rpc('get_or_create_conversation', {
          p_workspace_id: fbPageCheck.workspace_id,
          p_fb_page_id: fbPageCheck.id,
          p_customer_psid: customerPsid
        });

        if (conv) {
          await supabase.from('messages').insert({
            conversation_id: conv.id,
            sender: customerPsid,
            sender_type: 'customer',
            message_text: '[Clicked Get Started]',
            message_type: 'postback'
          });
        }

        const { sendMessage } = await import('@/lib/facebook/messenger');
        const settings = await getCachedSettings(fbPageCheck.workspace_id);
        
        await sendMessage(
          pageId,
          customerPsid,
          settings.greeting || "আসসালামু আলাইকুম! 😊 আমি Meem, এই shop এর sales team এ আছি। কীভাবে সাহায্য করতে পারি? 🛍️"
        );
        return; // Halt standard processing
      }
      
      // Handle "Order Now" button click
      if (payload.startsWith('ORDER_NOW_')) {
        const productId = payload.replace('ORDER_NOW_', '');
        console.log(`🛍️ Order Now clicked for product: ${productId}`);

        // Fetch product details
        const { data: product } = await supabase
          .from('products')
          .select('id, name, price, flavor')
          .eq('id', productId)
          .single();

        if (product) {
          // ENSURE CONVERSATION EXISTS
          const { data: fbPage } = await supabase
            .from('facebook_pages')
            .select('id, workspace_id, bot_enabled')
            .eq('id', pageId)
            .single();

          if (fbPage) {
            let { data: conversation } = await supabase
              .from('conversations')
              .select('*')
              .eq('fb_page_id', fbPage.id)
              .eq('customer_psid', customerPsid)
              .single();

            // Create conversation if it doesn't exist
            if (!conversation) {
              const { fetchFacebookProfile } = await import('@/lib/facebook/profile');
              const profile = await fetchFacebookProfile(customerPsid, pageId, supabase);

              const { data: newConv } = await supabase
                .from('conversations')
                .insert({
                  workspace_id: fbPage.workspace_id,
                  fb_page_id: fbPage.id,
                  customer_psid: customerPsid,
                  customer_name: profile?.name || 'Unknown Customer',
                  customer_profile_pic_url: profile?.profile_pic,
                  current_state: 'IDLE',
                  context: { state: 'IDLE', cart: [], checkout: {} },
                  last_message_at: new Date(timestamp).toISOString(),
                })
                .select()
                .single();
              conversation = newConv;
            }

            if (conversation) {
              // Log the postback action
              await supabase.from('messages').insert({
                conversation_id: conversation.id,
                sender: customerPsid,
                sender_type: 'customer',
                message_text: `[Clicked Order Now: ${product.name}]`,
                message_type: 'postback'
              });

              const context = conversation.context as any || {};
              const metadata = context.metadata || {};

              // Update conversation context
              metadata.activeProductId = product.id;
              metadata.activeProductName = product.name;
              metadata.flavor = product.flavor;
              metadata.orderStage = 'COLLECTING_INFO';
              context.metadata = metadata;

              // Save updated context to DB
              await supabase
                .from('conversations')
                .update({ context })
                .eq('id', conversation.id);

              // Call processMessage with a system-injected message
              // Trigger the Quick Form (Name, Phone, Address, Design, Flavor, Date)
              const settings = await getCachedSettings(fbPage.workspace_id);
              const quickForm = settings.quick_form_prompt || `🌸✨ কেক অর্ডার ফর্ম ✨🌸
প্রিয় গ্রাহক, অনুগ্রহ করে অর্ডার কনফার্ম করার জন্য নিচের ফর্মটি একবারে সম্পূর্ণ কপি করে পূরণ করে পাঠান —

⬇️ এই ফরম্যাটে লিখুন: ⬇️

1️⃣ জেলা সদর / উপজেলা:
2️⃣ সম্পূর্ণ ঠিকানা:
3️⃣ মোবাইল নম্বর:
4️⃣ কেকের ডিজাইন ও শুভেচ্ছা বার্তা:
5️⃣ কেকের ফ্লেভার:
6️⃣ ডেলিভারির তারিখ ও সময়:

📌 বিশেষ অনুরোধ:
👉 অনুগ্রহ করে সকল তথ্য একসাথে ও সঠিকভাবে পাঠাবেন। আলাদা আলাদা করে তথ্য দিলে অর্ডার প্রসেস করতে সমস্যা হয়।`;

              await processMessage({
                workspaceId: fbPage.workspace_id,
                fbPageId: Number(fbPage.id),
                conversationId: conversation.id,
                customerPsid,
                pageId,
                messageText: `[SYSTEM: Customer clicked Order Now for product: ${product.name} (${product.flavor}). START ORDER COLLECTION using THIS QUICK FORM: \n\n${quickForm}]`,
                isTestMode: false,
                botEnabled: fbPage.bot_enabled,
              });
            }
          }
        }
        return;
      }

      // Handle "More Photos" button click
      if (payload.startsWith('MORE_PHOTOS_')) {
        const productId = payload.replace('MORE_PHOTOS_', '');
        console.log(`📸 More Photos clicked for product: ${productId}`);

        const { data: product } = await supabase
          .from('products')
          .select('name, media_images')
          .eq('id', productId)
          .single();

        const { sendMessage, sendImage } = await import('@/lib/facebook/messenger');

        if (product && product.media_images && product.media_images.length > 0) {
          // Log user interaction
          const { data: convData } = await supabase
            .from('conversations')
            .select('id')
            .eq('customer_psid', customerPsid)
            .eq('fb_page_id', pageId)
            .single();
          
          if (convData) {
            await supabase.from('messages').insert({
              conversation_id: convData.id,
              sender: 'customer',
              sender_type: 'customer',
              message_text: `More Photos: ${product.name}`,
              message_type: 'postback',
            });
          }

          const { data: fbPage } = await supabase
            .from('facebook_pages')
            .select('encrypted_access_token')
            .eq('id', pageId)
            .single();

          if (fbPage) {
            const { decryptToken } = await import('@/lib/facebook/crypto-utils');
            const accessToken = decryptToken(fbPage.encrypted_access_token);
            
            // Send each image as an individual attachment
            for (const imageUrl of product.media_images) {
              await sendImage(pageId, customerPsid, imageUrl, accessToken);
            }
          }
        } else {
          await sendMessage(pageId, customerPsid, "এই product এর আর কোনো ছবি এখন নেই Sir 🙏");
        }
        return;
      }
      
      // Handle "View Details" button click
      if (payload.startsWith('VIEW_DETAILS_')) {
        const productId = payload.replace('VIEW_DETAILS_', '');
        console.log(`📋 View Details clicked for product: ${productId}`);
        
        // Fetch full product details
        const { data: product } = await supabase
          .from('products')
          .select('*')
          .eq('id', productId)
          .single();
        
        if (product) {
          // ENSURE CONVERSATION EXISTS & LOG MESSAGE
          const { data: fbPage } = await supabase
            .from('facebook_pages')
            .select('id, workspace_id')
            .eq('id', pageId)
            .single();

          if (fbPage) {
            let { data: conversation } = await supabase
              .from('conversations')
              .select('*')
              .eq('fb_page_id', fbPage.id)
              .eq('customer_psid', customerPsid)
              .single();

            if (!conversation) {
              // Fetch profile
              const { fetchFacebookProfile } = await import('@/lib/facebook/profile');
              const profile = await fetchFacebookProfile(customerPsid, pageId, supabase);

              const { data: newConv } = await supabase
                .from('conversations')
                .insert({
                  workspace_id: fbPage.workspace_id,
                  fb_page_id: fbPage.id,
                  customer_psid: customerPsid,
                  customer_name: profile?.name || 'Unknown Customer',
                  customer_profile_pic_url: profile?.profile_pic,
                  current_state: 'IDLE',
                  context: { state: 'IDLE', cart: [], checkout: {} },
                  last_message_at: new Date(timestamp).toISOString(),
                })
                .select()
                .single();
              conversation = newConv;
            } else {
               // Backfill profile if missing
               const needsProfileBackfill = !conversation.customer_profile_pic_url || 
                 !conversation.customer_name || 
                 conversation.customer_name === 'Unknown Customer' ||
                 conversation.customer_name === 'Facebook User';
               
               if (needsProfileBackfill) {
                 const { fetchFacebookProfile } = await import('@/lib/facebook/profile');
                 const profile = await fetchFacebookProfile(customerPsid, pageId, supabase);
                 if (profile) {
                   const profileUpdates: any = {};
                   if (profile.name && profile.name !== 'Facebook User') {
                     profileUpdates.customer_name = profile.name;
                   }
                   if (profile.profile_pic) {
                     profileUpdates.customer_profile_pic_url = profile.profile_pic;
                   }
                   if (Object.keys(profileUpdates).length > 0) {
                     await supabase.from('conversations').update(profileUpdates).eq('id', conversation.id);
                   }
                 }
               }
            }

            // Log the user interaction as a message
            if (conversation) {
              await supabase.from('messages').insert({
                conversation_id: conversation.id,
                sender: 'customer',
                sender_type: 'customer',
                message_text: `View Details: ${product.name}`,
                message_type: 'postback',
              });
            }
          }

          // Parse variations if available
          let variations;
          if (product.variations) {
            variations = {
              colors: product.variations.colors || [],
              sizes: product.variations.sizes || [],
            };
          }
          
          // Send detailed product information
          const { sendMessage } = await import('@/lib/facebook/messenger');
          const { Replies } = await import('@/lib/conversation/replies');
          
          const detailsMessage = Replies.PRODUCT_DETAILS({
            name: product.name,
            price: product.price,
            description: product.description,
            stock: product.stock_quantity,
            category: product.category,
            variations,
            colors: product.colors,
            sizes: product.sizes,
          });
          
          await sendMessage(pageId, customerPsid, detailsMessage);
        }
        return;
      }
      
      // Unknown postback
      console.log('⚠️ Unknown postback payload:', payload);
      return;
    }

    // ========================================
    // HANDLE MESSAGES
    // ========================================
    
    // All IDs and text already captured at top of function
    const replyToMid = message?.reply_to?.mid || null;

    // Extract image URL if present
    let imageUrl: string | undefined;
    let modifiedMessageText = message?.text || '';

    if (message?.attachments && message.attachments.length > 0) {
      // Handle Images
      const imageAttachment = message.attachments.find(
        (att) => att.type === 'image'
      );
      if (imageAttachment && imageAttachment.payload?.url) {
        imageUrl = imageAttachment.payload.url;
        console.log('📸 Image attachment detected:', imageUrl);
      }

      // Handle Audio (Voice Messages)
      const audioAttachment = message.attachments.find(
        (att) => att.type === 'audio'
      );
      if (audioAttachment && audioAttachment.payload?.url) {
        console.log('🎙️ Audio attachment detected');
        
        // We only transcribe customer messages for the bot
        if (!isOwnerMessage && fbPageCheck?.encrypted_access_token && fbPageCheck.bot_enabled) {
          try {
            const accessToken = decryptToken(fbPageCheck.encrypted_access_token);
            const transcript = await transcribeVoiceMessage(audioAttachment.payload.url, accessToken);
            
            if (transcript) {
              modifiedMessageText = `[Voice: ${transcript}]`;
              
              // Log usage as whisper-1 (assume 1 min minimum for fallback if duration unknown)
              await logApiUsage({
                workspaceId: fbPageCheck.workspace_id,
                featureName: 'voice_transcription',
                model: 'whisper-1',
                cost: 0.006 
              });
            } else {
              // Transcription failed - send fallback and stop
              const { sendMessage } = await import('@/lib/facebook/messenger');
              await sendMessage(pageId, customerPsid, "আমাদের এখানে ভয়েস শুনতে একটু সমস্যা হচ্ছে। আপনি যদি একটু লিখে জানাতেন, তাহলে অনেক সুবিধা হতো। 😊");
              return;
            }
          } catch (error) {
            console.error('❌ Error transcribing voice message:', error);
            // Fallback
            const { sendMessage } = await import('@/lib/facebook/messenger');
            await sendMessage(pageId, customerPsid, "আমাদের এখানে ভয়েস শুনতে একটু সমস্যা হচ্ছে। আপনি যদি একটু লিখে জানাতেন, তাহলে অনেক সুবিধা হতো। 😊");
            return;
          }
        } else {
          modifiedMessageText = '[Voice Message]';
        }
      }
    }


    // ========================================
    // FIND OR CREATE CONVERSATION
    // ========================================
    
    // We already have fbPageCheck from source detection, use it
    const fbPage = fbPageCheck;
    
    let { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('fb_page_id', fbPage.id)
      .eq('customer_psid', customerPsid)
      .single();

    if (convError || !conversation) {
      // Fetch profile
      const { fetchFacebookProfile } = await import('@/lib/facebook/profile');
      const profile = await fetchFacebookProfile(customerPsid, pageId, supabase);
      
      // Create new conversation
      const { data: newConversation, error: createError } = await supabase
        .from('conversations')
        .insert({
          workspace_id: fbPage.workspace_id,
          fb_page_id: fbPage.id,
          customer_psid: customerPsid,
          customer_name: profile?.name || 'Customer',
          customer_profile_pic_url: profile?.profile_pic,
          current_state: 'IDLE',
          control_mode: 'bot', // Default to bot control
          context: { 
            state: 'IDLE',
            cart: [],
            checkout: {},
            metadata: {
              messageCount: 0,
            },
          },
          last_message_at: new Date(timestamp).toISOString(),
        })
        .select('*')
        .single();

      if (createError) {
        console.error('Error creating conversation:', createError);
        return;
      }

      conversation = newConversation;
    } else {
       // Backfill profile for existing conversation if name or pic is missing
       console.log('\n========================================');
       console.log('🔄 [BACKFILL CHECK] Checking if profile backfill needed...');
       console.log(`🔄 [BACKFILL CHECK] Current customer_name: "${conversation.customer_name}"`);
       console.log(`🔄 [BACKFILL CHECK] Current profile_pic: ${conversation.customer_profile_pic_url ? 'exists' : 'missing'}`);
       
       const needsProfileBackfill = !conversation.customer_profile_pic_url || 
         !conversation.customer_name || 
         conversation.customer_name === 'Unknown Customer' ||
         conversation.customer_name === 'Facebook User';
       
       console.log(`🔄 [BACKFILL CHECK] Needs backfill: ${needsProfileBackfill}`);
       console.log('========================================');
       
       if (needsProfileBackfill) {
         console.log('🔄 [BACKFILL] Fetching fresh profile from Facebook...');
         const { fetchFacebookProfile } = await import('@/lib/facebook/profile');
         const profile = await fetchFacebookProfile(customerPsid, pageId, supabase);
         
         if (profile) {
           console.log(`🔄 [BACKFILL] Fetched profile - Name: "${profile.name}", Pic: ${profile.profile_pic ? 'yes' : 'no'}`);
           
           const profileUpdates: any = {};
           if (profile.name && profile.name !== 'Facebook User') {
             profileUpdates.customer_name = profile.name;
             console.log(`🔄 [BACKFILL] Will update customer_name to: "${profile.name}"`);
           }
           if (profile.profile_pic) {
             profileUpdates.customer_profile_pic_url = profile.profile_pic;
           }
           if (Object.keys(profileUpdates).length > 0) {
             await supabase.from('conversations').update(profileUpdates).eq('id', conversation.id);
           }
         }
       }
    }

    // ========================================
    // HANDLE OWNER MESSAGE (from Messenger app)
    // ========================================
    
    if (isOwnerMessage) {
      console.log('👤 [OWNER MESSAGE] Detected owner reply from Messenger app');
      
      // Save the owner's message with sender_type = 'owner'
      await supabase.from('messages').insert({
        conversation_id: conversation.id,
        sender: 'page', // Keep 'page' for backward compatibility
        sender_type: 'owner', // New field to distinguish owner from bot
        message_text: modifiedMessageText,
        message_type: message.attachments ? 'attachment' : 'text',
        attachments: message.attachments || null,
        mid: messageId || null,
        image_url: imageUrl || null,
      });
      
      // Update conversation to hybrid mode and track manual reply
      // Always transition to hybrid — the owner replying IS handling the flagged request
      const newMode = 'hybrid';
      
      await supabase
        .from('conversations')
        .update({
          control_mode: newMode,
          last_manual_reply_at: new Date().toISOString(),
          last_manual_reply_by: 'owner',
          last_message_at: new Date(timestamp).toISOString(),
          // Clear manual flag — owner has handled it by replying
          needs_manual_response: false,
          manual_flag_reason: null,
          manual_flagged_at: null,
        })
        .eq('id', conversation.id);
      
      console.log(`✅ [OWNER MESSAGE] Saved message, control_mode set to: ${newMode}, manual flag cleared`);
      console.log('⏭️ [OWNER MESSAGE] Skipping bot processing');
      
      // Skip bot processing entirely for owner messages
      return;
    }

    // ========================================
    // CHECK SUBSCRIPTION STATUS
    // ========================================
    
    const { checkBotPermission } = await import('@/lib/subscription/utils');
    const botPermission = await checkBotPermission(fbPage.workspace_id, supabase);
    
    if (!botPermission.allowed) {
      console.log(`🛑 Bot blocked by subscription: ${botPermission.reason}`);
      
      // Still save the customer message to database
      await supabase.from('messages').insert({
        conversation_id: conversation.id,
        sender: customerPsid,
        sender_type: 'customer',
        message_text: modifiedMessageText,
        message_type: message.attachments ? 'attachment' : 'text',
        attachments: message.attachments || null,
      });
      
      // Update last_message_at
      await supabase
        .from('conversations')
        .update({ last_message_at: new Date(timestamp).toISOString() })
        .eq('id', conversation.id);
      
      console.log('✅ Customer message saved, but bot blocked due to subscription status');
      return;
    }

    // ========================================
    // CHECK GLOBAL BOT TOGGLE (Redundant check for regular messages)
    // ========================================
    
    // Check if bot is globally disabled for this page
    if (fbPage.bot_enabled === false) {
      console.log(`🛑 Bot disabled for page ${pageId} - saving message only`);
      
      // Still save the customer message to database
      await supabase.from('messages').insert({
        conversation_id: conversation.id,
        sender: customerPsid,
        sender_type: 'customer',
        message_text: modifiedMessageText,
        message_type: message.attachments ? 'attachment' : 'text',
        attachments: message.attachments || null,
      });
      
      // Update last_message_at
      await supabase
        .from('conversations')
        .update({ last_message_at: new Date(timestamp).toISOString() })
        .eq('id', conversation.id);
      
      console.log('✅ Customer message saved, but bot will not respond');
      return;
    }

    // ========================================
    // LOG CUSTOMER MESSAGE
    // ========================================
    
    await supabase.from('messages').insert({
      conversation_id: conversation.id,
      sender: customerPsid,
      sender_type: 'customer',
      message_text: modifiedMessageText,
      message_type: message.attachments ? 'attachment' : 'text',
      attachments: message.attachments || null,
      image_url: imageUrl || null,
      mid: messageId || null,
    });
    
    // Update last_message_at for customer messages
    await supabase
      .from('conversations')
      .update({ last_message_at: new Date(timestamp).toISOString() })
      .eq('id', conversation.id);

    // ========================================
    // CHECK HYBRID CONTROL MODE
    // ========================================
    
    const controlMode = conversation.control_mode || 'bot';
    const lastManualReplyAt = conversation.last_manual_reply_at;
    const currentState = conversation.current_state || 'IDLE';
    const isProtectedState = PROTECTED_STATES.includes(currentState as any);
    
    console.log(`🎛️ [CONTROL MODE] Current mode: ${controlMode}`);
    console.log(`🎛️ [CONTROL MODE] Current state: ${currentState}`);
    console.log(`🎛️ [CONTROL MODE] Is protected state: ${isProtectedState}`);
    console.log(`🎛️ [CONTROL MODE] Last manual reply: ${lastManualReplyAt || 'never'}`);
    
    // If fully manual mode, skip bot entirely (unless in protected state)
    if (controlMode === 'manual' && !isProtectedState) {
      console.log('⏭️ [CONTROL MODE] Manual mode - skipping bot processing');
      return;
    } else if (controlMode === 'manual' && isProtectedState) {
      console.log('🛡️ [CONTROL MODE] Manual mode but in protected state - bot continues for order flow');
      // Set flag so bot can acknowledge owner message after order completes
      const context = conversation.context || {};
      context.owner_interrupted = true;
      await supabase
        .from('conversations')
        .update({ context })
        .eq('id', conversation.id);
    }
    
    // If hybrid mode, check if owner replied recently (within 30 minutes)
    if (controlMode === 'hybrid' && lastManualReplyAt) {
      const HYBRID_PAUSE_MINUTES = 30;
      const lastReplyTime = new Date(lastManualReplyAt).getTime();
      const now = Date.now();
      const minutesSinceLastReply = (now - lastReplyTime) / (1000 * 60);
      
      console.log(`🎛️ [CONTROL MODE] Minutes since last manual reply: ${minutesSinceLastReply.toFixed(1)}`);
      
      if (minutesSinceLastReply < HYBRID_PAUSE_MINUTES) {
        // Check if in protected state - if so, don't pause
        if (isProtectedState) {
          console.log(`🛡️ [CONTROL MODE] In protected state (${currentState}) - bot continues despite owner reply`);
          // Set flag so bot can acknowledge owner message after order completes
          const context = conversation.context || {};
          context.owner_interrupted = true;
          await supabase
            .from('conversations')
            .update({ context })
            .eq('id', conversation.id);
          // Continue to orchestrator (don't return)
        } else {
          console.log(`⏭️ [CONTROL MODE] Owner replied ${minutesSinceLastReply.toFixed(1)} mins ago - skipping bot`);
          return;
        }
      } else {
        console.log(`✅ [CONTROL MODE] ${minutesSinceLastReply.toFixed(1)} mins since last reply - bot can respond`);
        
        // Reset to bot mode since pause period has passed
        await supabase
          .from('conversations')
          .update({ control_mode: 'bot' })
          .eq('id', conversation.id);
        console.log('🔄 [CONTROL MODE] Reset to bot mode after pause period');
      }
    }
    
    // Check if bot_pause_until is set (but respect protected states)
    if (conversation.bot_pause_until && !isProtectedState) {
      const pauseUntil = new Date(conversation.bot_pause_until).getTime();
      const now = Date.now();
      
      if (now < pauseUntil) {
        const minutesRemaining = ((pauseUntil - now) / (1000 * 60)).toFixed(1);
        console.log(`⏭️ [CONTROL MODE] Bot paused for ${minutesRemaining} more minutes - skipping`);
        return;
      } else {
        // Clear expired pause
        await supabase
          .from('conversations')
          .update({ bot_pause_until: null })
          .eq('id', conversation.id);
        console.log('🔄 [CONTROL MODE] Bot pause expired, cleared');
      }
    } else if (conversation.bot_pause_until && isProtectedState) {
      console.log('🛡️ [CONTROL MODE] Bot pause ignored due to protected state');
    }

    // ========================================
    // CALL ORCHESTRATOR (Bot Processing)
    // ========================================
    
    console.log('🎭 Calling Orchestrator...');
    
    // Try to acquire lock for bot processing
    const lockAcquired = processingLock.acquireLock(conversation.id, 'bot_processing', 15000);
    
    if (!lockAcquired) {
      // Check if owner is currently sending
      const currentLock = processingLock.isLocked(conversation.id);
      if (currentLock?.lock_type === 'owner_sending') {
        console.log('⏸️ [BOT] Owner is sending message, waiting...');
        const released = await processingLock.waitForLock(conversation.id, 3000);
        if (!released) {
          console.log('⏭️ [BOT] Owner still sending, skipping bot response to avoid duplicate');
          return;
        }
        // Try to acquire again
        if (!processingLock.acquireLock(conversation.id, 'bot_processing', 15000)) {
          console.log('⏭️ [BOT] Could not acquire lock after waiting, skipping');
          return;
        }
      } else {
        console.log('⏭️ [BOT] Could not acquire lock, skipping processing');
        return;
      }
    }

    try {
      // Check one more time if owner replied while we were waiting
      const { data: freshConv } = await supabase
        .from('conversations')
        .select('control_mode, last_manual_reply_at')
        .eq('id', conversation.id)
        .single();
      
      if (freshConv?.control_mode === 'hybrid' || freshConv?.control_mode === 'manual') {
        const lastManualReply = freshConv.last_manual_reply_at;
        if (lastManualReply) {
          const timeSinceReply = Date.now() - new Date(lastManualReply).getTime();
          if (timeSinceReply < 5000) { // Owner replied in last 5 seconds
            console.log('⏭️ [BOT] Owner just replied, aborting bot response');
            return;
          }
        }
      }

      // Show typing indicator
      const { typingOn } = await import('@/lib/facebook/messenger');
      await typingOn(pageId, customerPsid);

      await processMessage({
        pageId,
        customerPsid,
        messageText: (modifiedMessageText || '').replace(/^\[Voice: (.*)\]$/i, '$1') || undefined,
        imageUrl,
        mid: messageId,
        replyToMid,
        workspaceId: fbPage.workspace_id,
        fbPageId: fbPage.id,
        conversationId: conversation.id,
        botEnabled: fbPage.bot_enabled,
      });

      console.log('✅ Message processed successfully');
    } finally {
      // Always release lock
      processingLock.releaseLock(conversation.id);
    }
  } catch (error) {
    console.error('❌ Error processing messaging event:', error);
  }
}

/**
 * Process a single Instagram DM messaging event
 * 
 * Instagram webhooks arrive with object: "instagram" and entry.id = Instagram Business Account ID.
 * We look up the facebook_pages row by instagram_account_id to find the associated page and workspace.
 * 
 * Key differences from Messenger:
 * - No postback/template support (Instagram API limitation)
 * - entry.id is the Instagram Business Account ID, not the Facebook Page ID
 * - Sender/recipient IDs are Instagram-Scoped User IDs (IGSIDs)
 * - Messages are sent via the same Graph API /{page-id}/messages endpoint using the Page Access Token
 */
export async function processInstagramMessagingEvent(
  supabase: any,
  igAccountId: string,
  event: MessagingEvent
) {
  try {
    const { sender, recipient, timestamp, message } = event;
    const senderId = sender.id;
    const recipientId = recipient.id;

    console.log(`📸 [INSTAGRAM] Processing event from IG account: ${igAccountId}`);
    console.log(`📸 [INSTAGRAM] sender.id: ${senderId}, recipient.id: ${recipientId}`);

    // ========================================
    // LOOK UP PAGE BY INSTAGRAM ACCOUNT ID
    // ========================================

    const { data: fbPage } = await supabase
      .from('facebook_pages')
      .select('id, workspace_id, bot_enabled, ig_bot_enabled, instagram_account_id')
      .eq('instagram_account_id', igAccountId)
      .eq('status', 'connected')
      .single();

    if (!fbPage) {
      console.error(`❌ [INSTAGRAM] No facebook_page found with instagram_account_id: ${igAccountId}`);
      return;
    }

    const pageId = String(fbPage.id);
    console.log(`📸 [INSTAGRAM] Resolved to Facebook Page ID: ${pageId}, Workspace: ${fbPage.workspace_id}`);

    // ========================================
    // DETECT MESSAGE SOURCE (Owner vs Customer)
    // ========================================
    
    // For Instagram: 
    // - Customer to Business: sender.id = customer IGSID, recipient.id = IG Business Account ID
    // - Business to Customer: sender.id = IG Business Account ID, recipient.id = customer IGSID
    const isOwnerMessage = senderId === igAccountId;
    const customerIgsid = isOwnerMessage ? recipientId : senderId;

    console.log(`📸 [INSTAGRAM] Is Owner Message: ${isOwnerMessage}`);
    console.log(`📸 [INSTAGRAM] Customer IGSID: ${customerIgsid}`);

    // Immediate Sender Action: Mark as Seen
    if (!isOwnerMessage) {
      const { markSeen } = await import('@/lib/facebook/messenger');
      await markSeen(pageId, customerIgsid);
    }

    // ========================================
    // HANDLE POSTBACKS (Instagram has limited support)
    // ========================================

    if (event.postback) {
      console.log(`📸 [INSTAGRAM] Postback received: ${event.postback.payload}`);
      // Instagram postbacks are limited — log and skip for now
      // Product card buttons (ORDER_NOW_, VIEW_DETAILS_) don't exist on Instagram
      return;
    }

    // ========================================
    // HANDLE MESSAGES
    // ========================================

    if (!message || !message.mid) {
      console.log('📸 [INSTAGRAM] Skipping non-message event');
      return;
    }

    const messageText = message.text || '';
    const messageId = message.mid;
    const replyToMid = message.reply_to?.mid || null;

    // Extract image URL if present
    let imageUrl: string | undefined;
    let modifiedMessageText = message.text || '';

    if (message.attachments && message.attachments.length > 0) {
      const imageAttachment = message.attachments.find(
        (att) => att.type === 'image'
      );
      if (imageAttachment && imageAttachment.payload?.url) {
        imageUrl = imageAttachment.payload.url;
        console.log('📸 [INSTAGRAM] Image attachment detected:', imageUrl);
      }

      const audioAttachment = message.attachments.find(
        (att) => att.type === 'audio'
      );
      if (audioAttachment) {
        console.log('📸 [INSTAGRAM] Audio attachment detected');
        // For now, Instagram doesn't have the Whisper integration applied, but we ensure
        // it doesn't trigger the old "can't hear" AI rule.
        modifiedMessageText = '(Voice Message)';
      }
    }

    // ========================================
    // CHECK IDEMPOTENCY
    // ========================================

    const eventId = generateEventId(igAccountId, timestamp, messageId);

    const { data: existingEvent } = await supabase
      .from('webhook_events')
      .select('id')
      .eq('event_id', eventId)
      .single();

    if (existingEvent) {
      console.log(`📸 [INSTAGRAM] Duplicate event detected: ${eventId}`);
      return;
    }

    // Log event
    await supabase.from('webhook_events').insert({
      event_id: eventId,
      event_type: 'instagram_messaging',
      payload: event,
    });

    // ========================================
    // FIND OR CREATE CONVERSATION
    // ========================================
    
    let { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('fb_page_id', fbPage.id)
      .eq('customer_psid', customerIgsid)
      .single();

    if (convError || !conversation) {
      // Fetch Instagram profile (uses same Graph API endpoint)
      const { fetchFacebookProfile } = await import('@/lib/facebook/profile');
      const profile = await fetchFacebookProfile(customerIgsid, pageId, supabase);

      // Create new conversation
      const { data: newConversation, error: createError } = await supabase
        .from('conversations')
        .insert({
          workspace_id: fbPage.workspace_id,
          fb_page_id: fbPage.id,
          customer_psid: customerIgsid,
          customer_name: profile?.name || 'Instagram User',
          customer_profile_pic_url: profile?.profile_pic,
          current_state: 'IDLE',
          control_mode: 'bot',
          context: {
            state: 'IDLE',
            cart: [],
            checkout: {},
            metadata: {
              messageCount: 0,
              source: 'instagram',
            },
          },
          last_message_at: new Date(timestamp).toISOString(),
        })
        .select('*')
        .single();

      if (createError) {
        console.error('❌ [INSTAGRAM] Error creating conversation:', createError);
        return;
      }

      conversation = newConversation;
    } else {
      // Backfill profile if missing
      const needsProfileBackfill = !conversation.customer_profile_pic_url ||
        !conversation.customer_name ||
        conversation.customer_name === 'Unknown Customer' ||
        conversation.customer_name === 'Instagram User' ||
        conversation.customer_name === 'Facebook User';

      if (needsProfileBackfill) {
        const { fetchFacebookProfile } = await import('@/lib/facebook/profile');
        const profile = await fetchFacebookProfile(customerIgsid, pageId, supabase);

        if (profile) {
          const profileUpdates: any = {};
          if (profile.name && profile.name !== 'Facebook User') {
            profileUpdates.customer_name = profile.name;
          }
          if (profile.profile_pic) {
            profileUpdates.customer_profile_pic_url = profile.profile_pic;
          }
          if (Object.keys(profileUpdates).length > 0) {
            await supabase.from('conversations').update(profileUpdates).eq('id', conversation.id);
          }
        }
      }
    }

    // ========================================
    // HANDLE OWNER MESSAGE
    // ========================================

    if (isOwnerMessage) {
      console.log('📸 [INSTAGRAM] Detected owner reply from Instagram app');

      await supabase.from('messages').insert({
        conversation_id: conversation.id,
        sender: 'page',
        sender_type: 'owner',
        message_text: modifiedMessageText,
        message_type: message.attachments ? 'attachment' : 'text',
        attachments: message.attachments || null,
        mid: messageId || null,
        image_url: imageUrl || null,
      });

      const currentMode = conversation.control_mode || 'bot';
      const newMode = currentMode === 'manual' ? 'manual' : 'hybrid';

      await supabase
        .from('conversations')
        .update({
          control_mode: newMode,
          last_manual_reply_at: new Date().toISOString(),
          last_manual_reply_by: 'owner',
          last_message_at: new Date(timestamp).toISOString(),
        })
        .eq('id', conversation.id);

      console.log(`✅ [INSTAGRAM] Owner message saved, control_mode: ${newMode}`);
      return;
    }

    // ========================================
    // CHECK SUBSCRIPTION STATUS
    // ========================================

    const { checkBotPermission } = await import('@/lib/subscription/utils');
    const botPermission = await checkBotPermission(fbPage.workspace_id, supabase);

    if (!botPermission.allowed) {
      console.log(`🛑 [INSTAGRAM] Bot blocked by subscription: ${botPermission.reason}`);

      await supabase.from('messages').insert({
        conversation_id: conversation.id,
        sender: customerIgsid,
        sender_type: 'customer',
        message_text: modifiedMessageText,
        message_type: message.attachments ? 'attachment' : 'text',
        attachments: message.attachments || null,
      });

      await supabase
        .from('conversations')
        .update({ last_message_at: new Date(timestamp).toISOString() })
        .eq('id', conversation.id);

      return;
    }

    // ========================================
    // CHECK INSTAGRAM BOT TOGGLE
    // ========================================

    if (fbPage.ig_bot_enabled === false) {
      console.log(`🛑 [INSTAGRAM] IG Bot disabled for page ${pageId} — saving message only`);

      await supabase.from('messages').insert({
        conversation_id: conversation.id,
        sender: customerIgsid,
        sender_type: 'customer',
        message_text: modifiedMessageText,
        message_type: message.attachments ? 'attachment' : 'text',
        attachments: message.attachments || null,
      });

      await supabase
        .from('conversations')
        .update({ last_message_at: new Date(timestamp).toISOString() })
        .eq('id', conversation.id);

      return;
    }

    // ========================================
    // LOG CUSTOMER MESSAGE
    // ========================================

    await supabase.from('messages').insert({
      conversation_id: conversation.id,
      sender: customerIgsid,
      sender_type: 'customer',
      message_text: modifiedMessageText,
      message_type: message.attachments ? 'attachment' : 'text',
      attachments: message.attachments || null,
      image_url: imageUrl || null,
      mid: messageId || null,
    });

    await supabase
      .from('conversations')
      .update({ last_message_at: new Date(timestamp).toISOString() })
      .eq('id', conversation.id);

    // ========================================
    // CHECK HYBRID CONTROL MODE
    // ========================================

    const controlMode = conversation.control_mode || 'bot';
    const lastManualReplyAt = conversation.last_manual_reply_at;
    const currentState = conversation.current_state || 'IDLE';
    const isProtectedState = PROTECTED_STATES.includes(currentState as any);

    if (controlMode === 'manual' && !isProtectedState) {
      console.log('⏭️ [INSTAGRAM] Manual mode — skipping bot processing');
      return;
    } else if (controlMode === 'manual' && isProtectedState) {
      console.log('🛡️ [INSTAGRAM] Manual mode but protected state — bot continues');
      const context = conversation.context || {};
      context.owner_interrupted = true;
      await supabase
        .from('conversations')
        .update({ context })
        .eq('id', conversation.id);
    }

    if (controlMode === 'hybrid' && lastManualReplyAt) {
      const HYBRID_PAUSE_MINUTES = 30;
      const lastReplyTime = new Date(lastManualReplyAt).getTime();
      const minutesSinceLastReply = (Date.now() - lastReplyTime) / (1000 * 60);

      if (minutesSinceLastReply < HYBRID_PAUSE_MINUTES) {
        if (isProtectedState) {
          console.log(`🛡️ [INSTAGRAM] Protected state — bot continues despite owner reply`);
          const context = conversation.context || {};
          context.owner_interrupted = true;
          await supabase.from('conversations').update({ context }).eq('id', conversation.id);
        } else {
          console.log(`⏭️ [INSTAGRAM] Owner replied ${minutesSinceLastReply.toFixed(1)} mins ago — skipping bot`);
          return;
        }
      } else {
        await supabase
          .from('conversations')
          .update({ control_mode: 'bot' })
          .eq('id', conversation.id);
        console.log('🔄 [INSTAGRAM] Reset to bot mode after pause period');
      }
    }

    if (conversation.bot_pause_until && !isProtectedState) {
      const pauseUntil = new Date(conversation.bot_pause_until).getTime();
      if (Date.now() < pauseUntil) {
        console.log(`⏭️ [INSTAGRAM] Bot paused — skipping`);
        return;
      } else {
        await supabase.from('conversations').update({ bot_pause_until: null }).eq('id', conversation.id);
      }
    }

    // ========================================
    // CALL ORCHESTRATOR (Bot Processing)
    // ========================================

    console.log('📸 [INSTAGRAM] Calling Orchestrator...');

    const lockAcquired = processingLock.acquireLock(conversation.id, 'bot_processing', 15000);

    if (!lockAcquired) {
      const currentLock = processingLock.isLocked(conversation.id);
      if (currentLock?.lock_type === 'owner_sending') {
        const released = await processingLock.waitForLock(conversation.id, 3000);
        if (!released) {
          console.log('⏭️ [INSTAGRAM] Owner still sending, skipping bot response');
          return;
        }
        if (!processingLock.acquireLock(conversation.id, 'bot_processing', 15000)) {
          console.log('⏭️ [INSTAGRAM] Could not acquire lock after waiting');
          return;
        }
      } else {
        console.log('⏭️ [INSTAGRAM] Could not acquire lock, skipping processing');
        return;
      }
    }

    try {
      // Check if owner replied while waiting for lock
      const { data: freshConv } = await supabase
        .from('conversations')
        .select('control_mode, last_manual_reply_at')
        .eq('id', conversation.id)
        .single();

      if (freshConv?.control_mode === 'hybrid' || freshConv?.control_mode === 'manual') {
        const lastManualReply = freshConv.last_manual_reply_at;
        if (lastManualReply) {
          const timeSinceReply = Date.now() - new Date(lastManualReply).getTime();
          if (timeSinceReply < 5000) {
            console.log('⏭️ [INSTAGRAM] Owner just replied, aborting bot response');
            return;
          }
        }
      }

      await processMessage({
        pageId,
        customerPsid: customerIgsid,
        messageText: modifiedMessageText || undefined,
        imageUrl,
        mid: messageId,
        replyToMid,
        workspaceId: fbPage.workspace_id,
        fbPageId: fbPage.id,
        conversationId: conversation.id,
        botEnabled: fbPage.ig_bot_enabled,
      });

      console.log('✅ [INSTAGRAM] Message processed successfully');
    } finally {
      processingLock.releaseLock(conversation.id);
    }
  } catch (error) {
    console.error('❌ [INSTAGRAM] Error processing Instagram messaging event:', error);
  }
}

/**
 * Process a single Instagram Comment from the 'changes' webhook
 * Handles automatic public reply and private DM for Instagram comments.
 */
export async function processInstagramCommentEvent(
  supabase: any,
  igAccountId: string,
  commentData: any
) {
  try {
    const commentId = commentData.id;
    const fromId = commentData.from?.id;
    const fromUsername = commentData.from?.username;
    const message = commentData.text;

    console.log(`📸💬 [IG_COMMENT] Processing comment ${commentId} from ${fromUsername}`);

    // Step 1: Idempotency Check
    const { data: existingEvent } = await supabase
      .from('webhook_events')
      .select('id')
      .eq('event_id', `ig_comment_${commentId}`)
      .single();

    if (existingEvent || !commentId || commentId === 'undefined') {
      console.log(`📸💬 [IG_COMMENT] Skipping duplicate or invalid IG comment: ${commentId}`);
      return;
    }

    // Log the event immediately to prevent race conditions
    await supabase.from('webhook_events').insert({
      event_id: `ig_comment_${commentId}`,
      event_type: 'ig_comment',
      payload: commentData,
    });

    // Basic Filters
    if (!message) return;
    const text = message.trim();

    // Skip if comment is from the page itself
    if (fromId === igAccountId) {
      console.log('📸💬 [IG_COMMENT] Skipping own page comment to prevent loop');
      return;
    }

    const hasRealText = /[a-zA-Z\u0980-\u09FF]/.test(text);
    if (!hasRealText || text.length < 2) {
      console.log('📸💬 [IG_COMMENT] Skipping emoji-only or too short comment:', text);
      return;
    }

    // Step 2: Find workspace by IG Account Id
    const { data: fbPage } = await supabase
      .from('facebook_pages')
      .select('id, workspace_id, encrypted_access_token, ig_bot_enabled')
      .eq('instagram_account_id', igAccountId)
      .eq('status', 'connected')
      .single();

    if (!fbPage) {
      console.log('📸💬 [IG_COMMENT] No facebook_page found for igAccountId:', igAccountId);
      return;
    }

    if (!fbPage.ig_bot_enabled) {
      console.log('📸💬 [IG_COMMENT] IG Bot disabled for this page. Skipping automation.');
      return;
    }

    const { decryptToken } = await import('@/lib/facebook/crypto-utils');
    const decryptedToken = decryptToken(fbPage.encrypted_access_token);

    // Step 3: Classify comment using AI
    const classification = await classifyComment(text, fbPage.workspace_id);

    console.log(`📸💬 [IG_COMMENT] Classification: ${classification.type}`);

    // Step 4: Build replies based on classification
    let publicReplyText = '';
    let privateDmText = '';
    
    if (classification.type === 'price_inquiry') {
      publicReplyText = `ধন্যবাদ! details আপনার inbox এ পাঠানো হয়েছে 📥`;
      privateDmText = `হ্যালো! আপনি আমাদের একটি পোস্টে price সম্পর্কে জানতে চেয়েছিলেন। বিস্তারিত জানতে বা অর্ডার করতে আমাকে জানান 😊`;
    } else if (classification.type === 'appreciation') {
      publicReplyText = `ধন্যবাদ! 🙏 আপনার ভালো লেগেছে জেনে খুশি হলাম।`;
    } else if (classification.type === 'complaint') {
      publicReplyText = `আন্তরিকভাবে দুঃখিত। আমরা আপনার inbox এ message পাঠিয়েছি, দয়া করে একটু check করুন 🙏`;
      privateDmText = `হ্যালো, আমরা আপনার কমেন্ট দেখেছি। সমস্যার জন্য আমরা দুঃখিত। দয়া করে বিস্তারিত জানান, আমরা দ্রুত সমাধান করার চেষ্টা করবো।`;
    } else {
      publicReplyText = `ধন্যবাদ! যেকোনো প্রয়োজনে inbox এ message করুন 😊`;
    }

    // Step 5: Send Replies (Public first, then Private DM)
    const { replyToInstagramComment, sendPrivateReplyToInstagramComment } = await import('@/lib/facebook/messenger');

    // 5a. Public Reply
    try {
      console.log(`📸💬 [IG_COMMENT] Attempting public reply | Text: "${publicReplyText}"`);
      const publicResult = await replyToInstagramComment(commentId, publicReplyText, decryptedToken);
      
      if (publicResult?.id) {
        console.log(`📸💬 [IG_COMMENT] Public reply successful: ${publicResult.id}`);
        // Log bot's public reply to database
        await supabase.from('messages').insert({
          conversation_id: null,
          sender: String(fbPage.id),
          sender_type: 'bot',
          message_text: `[IG_PUBLIC_REPLY] ${publicReplyText}`,
          message_type: 'comment',
        });
      }
    } catch (publicError) {
      console.error(`📸💬 [IG_COMMENT] Error sending public reply:`, publicError);
    }

    // 5b. Private DM Reply
    if (privateDmText) {
      try {
        console.log(`📸💬 [IG_COMMENT] Attempting private DM reply | Text: "${privateDmText}"`);
        // Note: Graph API requires the Facebook Page ID for the /messages endpoint, not the IG Account ID.
        const privateResult = await sendPrivateReplyToInstagramComment(
          String(fbPage.id), 
          commentId, 
          privateDmText, 
          decryptedToken
        );
        
        if (privateResult?.message_id || privateResult?.already_replied) {
          console.log(`📸💬 [IG_COMMENT] Private DM reply initiated successfully`);
          
          await supabase.from('messages').insert({
            conversation_id: null,
            sender: String(fbPage.id),
            sender_type: 'bot',
            message_text: `[IG_PRIVATE_DM_REPLY] ${privateDmText}`,
            message_type: 'comment',
          });
        }
      } catch (privateError) {
        console.error(`📸💬 [IG_COMMENT] Error sending private DM reply:`, privateError);
      }
    }

    // Step 6: Save Original Customer Comment to DB for dashboard visibility
    await supabase.from('messages').insert({
      conversation_id: null,
      sender: fromId,
      sender_type: 'customer',
      message_text: `[IG_COMMENT] ${text}`,
      message_type: 'comment',
    });

  } catch (err) {
    console.error(`❌ [WEBHOOK] Critical error in processInstagramCommentEvent:`, err);
  }
}

/**
 * Process a Facebook comment event from the feed webhook
 */
export async function processCommentEvent(
  supabase: any,
  pageId: string,
  commentData: {
    comment_id: string;
    post_id: string;
    from: { id: string; name: string };
    message: string;
    created_time: number;
  }
) {
  try {
    const commentId = commentData.comment_id;
    const postId = commentData.post_id;
    const fromId = commentData.from?.id;
    const fromName = commentData.from?.name;

    console.log(`💬 [COMMENT_EVENT] Processing comment ${commentId} on post ${postId} from ${fromName}`);

    // Step 1: Idempotency Check
    const { data: existingEvent } = await supabase
      .from('webhook_events')
      .select('id')
      .eq('event_id', `comment_${commentId}`)
      .single();

    if (existingEvent || !commentId || commentId === 'undefined') {
      console.log(`💬 [COMMENT_EVENT] Skipping duplicate or invalid comment: ${commentId}`);
      return;
    }

    // Log the event immediately to prevent race conditions
    await supabase.from('webhook_events').insert({
      event_id: `comment_${commentId}`,
      event_type: 'comment',
      payload: commentData,
    });

    // Step 2: Basic Filters
    const text = commentData.message.trim();
    
    // Skip if comment is from the page itself (bot's own comments)
    if (fromId === pageId) {
      console.log('💬 [COMMENT_EVENT] Skipping own page comment to prevent loop');
      return;
    }

    const hasRealText = /[a-zA-Z\u0980-\u09FF]/.test(text);
    if (!hasRealText || text.length < 2) {
      console.log('💬 [COMMENT_EVENT] Skipping emoji-only or too short comment:', text);
      return;
    }

    // Step 2: Find workspace by pageId
    const { data: fbPage } = await supabase
      .from('facebook_pages')
      .select('id, workspace_id, page_name, page_username, encrypted_access_token')
      .eq('id', pageId)
      .single();

    if (!fbPage) {
      console.log('💬 [COMMENT] No facebook_page found for pageId:', pageId);
      return;
    }

    // Use decrypted token from fbPage for API calls
    const { decryptToken } = await import('@/lib/facebook/crypto-utils');
    const decryptedToken = decryptToken(fbPage.encrypted_access_token);

    // Step 3: Classify comment using AI
    const classification = await classifyComment(text, fbPage.workspace_id);

    console.log(`💬 [COMMENT] Classification: ${classification.type}`);

    // Step 4: Search for product from post caption (BEFORE public reply)
    let topProduct: any = null;
    let caption: string | null = null;
    const accessToken = decryptedToken;
    const customerId = commentData.from.id;

    try {
      console.log(`📨 [COMMENT] Fetching caption for post: ${postId}`);
      let postCaptionStr: string | null = null;
      try {
        const response = await fetch(
          `https://graph.facebook.com/v24.0/${postId}?fields=message&access_token=${accessToken}`
        );
        if (response.ok) {
          const data = await response.json();
          postCaptionStr = data.message || null;
        }
      } catch (error) {
        console.error(`💬 [COMMENT] Error fetching post caption:`, error);
      }
      caption = postCaptionStr;

      if (caption) {
        const { searchProducts } = await import('@/lib/ai/tools/search-products');
        console.log(`📨 [COMMENT] Searching products for caption: "${caption.substring(0, 50)}..."`);
        
        const searchResult = await searchProducts(caption, fbPage.workspace_id);
        topProduct = searchResult.products?.[0];
        
        if (topProduct) {
          console.log(`📨 [COMMENT] Product found: ${topProduct.name} (ID: ${topProduct.id})`);
        } else {
          console.log(`📨 [COMMENT] No product found matching caption.`);
        }
      } else {
        console.log(`📨 [COMMENT] No caption available for post ${postId}`);
      }
    } catch (searchError) {
      console.error(`📨 [COMMENT] Error searching for product:`, searchError);
    }

    // Step 5: Build reply based on classification
    let replyText = '';
    
    if (classification.type === 'price_inquiry') {
      if (topProduct) {
        const pageUsername = fbPage.page_username || fbPage.id;
        const encodedUsername = encodeURIComponent(pageUsername);
        const mmeLink = `m.me/${encodedUsername}?ref=product_${topProduct.id}`;
        
        console.log(`💬 [COMMENT] m.me link: ${mmeLink}`);
        replyText = `details ও অর্ডারের জন্য inbox এ message করুন 👉 ${mmeLink}`;
      } else {
        replyText = `details জানতে inbox এ message করুন 😊 আমরা সাথে সাথে reply করবো!`;
      }
    } else if (classification.type === 'appreciation') {
      replyText = `ধন্যবাদ! 🙏 আপনার ভালো লেগেছে জেনে খুশি হলাম। যেকোনো প্রয়োজনে inbox করুন 😊`;
    } else if (classification.type === 'complaint') {
      replyText = `আন্তরিকভাবে দুঃখিত। আমাদের inbox এ message করুন, আমরা সমস্যাটা সমাধান করবো 🙏`;
    } else {
      replyText = `ধন্যবাদ! যেকোনো প্রয়োজনে inbox এ message করুন 😊`;
    }

    // No mention tag needed - standard replies to comment_id trigger notifications in v24.0
    // replyText = `@[${commentData.from.id}] ${replyText}`;

    // Step 6: Reply to comment publicly
    try {
      const { replyToComment } = await import('@/lib/facebook/messenger');
      console.log(`💬 [COMMENT_EVENT] Attempting public reply | ID: ${commentId} | Text: "${replyText}"`);
      
      const result = await replyToComment(commentId, replyText, decryptedToken);
      
      if (result?.id) {
        console.log(`💬 [COMMENT_EVENT] Public reply successful: ${result.id}`);
        
        // Log bot's public reply to database
        await supabase.from('messages').insert({
          conversation_id: null,
          sender: pageId,
          sender_type: 'bot',
          message_text: `[REPLY] ${replyText}`,
          message_type: 'comment',
        });
      }
    } catch (publicError) {
      console.error(`💬 [COMMENT_EVENT] Error sending public reply:`, publicError);
    }

    // Reverted to Link-to-Inbox strategy as standard Private Replies are currently restricted 
    // by Meta permissions or App Review status.

    // Step 8: Save comment to DB for dashboard visibility
    await supabase.from('messages').insert({
      conversation_id: null,
      sender: fromId,
      sender_type: 'customer',
      message_text: `[COMMENT] ${text}`,
      message_type: 'comment',
    });
  } catch (err) {
    console.error(`❌ [WEBHOOK] Critical error in processCommentEvent:`, err);
  }
}

/**
 * Classify a Facebook comment using GPT-4o-mini
 */
async function classifyComment(text: string, workspaceId: string): Promise<{ type: string }> {
  try {
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 20,
      messages: [
        {
          role: 'system',
          content: `Classify this Facebook comment into exactly one category.
Reply with only one word:
- price_inquiry (asking about price, availability, how to order, "কত", "price", "দাম", "কিভাবে", "পাবো")
- appreciation (positive comment, compliment, "সুন্দর", "nice", "love", "great")
- complaint (negative feedback, "খারাপ", "not good", "problem", "issue")
- other (anything else)`
        },
        { role: 'user', content: text }
      ],
    });

    if (response.usage) {
      logApiUsage({
        workspaceId,
        conversationId: undefined,
        model: 'gpt-4o-mini',
        featureName: 'comment_auto_reply',
        usage: {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        }
      });
    }

    const result = response.choices[0]?.message?.content?.trim().toLowerCase() || 'other';
    return { type: result };
  } catch (error) {
    console.error('Error in classifyComment:', error);
    return { type: 'other' };
  }
}



/**
 * Shared helper to send a welcome message and product card for a referral
 */
async function sendReferralProductCard(
  supabase: any,
  pageId: string,
  customerPsid: string,
  workspaceId: string,
  productId: string
) {
  try {
    // Fetch product
    const { data: product } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .eq('workspace_id', workspaceId)
      .single();

    if (!product) {
      console.log(`🔗 [REFERRAL] Product not found for ID: ${productId}`);
      return;
    }

    console.log(`🔗 [REFERRAL] Sending catalog info for: ${product.name}`);

    const { sendMessage, sendProductCard } = await import('@/lib/facebook/messenger');

    // Send welcome text
    await sendMessage(
      pageId,
      customerPsid,
      "আসসালামু আলাইকুম! 😊 আপনি যে product টি দেখছিলেন তার details নিচে দিলাম। অর্ডার করতে বা কিছু জানতে reply করুন! 🛍️"
    );

    // Send product card
    await sendProductCard(pageId, customerPsid, {
      id: product.id,
      name: product.name,
      price: product.price,
      imageUrl: product.image_urls?.[0] || '',
      stock: product.stock_quantity || 0,
      variations: {
        colors: product.colors || [],
        sizes: product.sizes || [],
      }
    });

    // Save to DB
    const { fetchFacebookProfile } = await import('@/lib/facebook/profile');
    const profile = await fetchFacebookProfile(customerPsid, pageId, supabase);

    // Try updating existing or inserting new convo
    const { data: convData } = await supabase
      .from('conversations')
      .select('id')
      .eq('customer_psid', customerPsid)
      .eq('fb_page_id', pageId)
      .single();

    let conversationId = convData?.id;

    if (!conversationId) {
      const { data: newConv } = await supabase
        .from('conversations')
        .insert({
          workspace_id: workspaceId,
          fb_page_id: pageId,
          customer_psid: customerPsid,
          customer_name: profile?.name || 'Customer',
          customer_profile_pic_url: profile?.profile_pic,
          current_state: 'IDLE',
          control_mode: 'bot',
          context: { state: 'IDLE', cart: [], checkout: {}, metadata: { messageCount: 0 } },
          last_message_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (newConv) conversationId = newConv.id;
    }

    if (conversationId) {
      await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender: 'bot',
        sender_type: 'bot',
        message_text: `[Sent referral product card: ${product.name}]`,
        message_type: 'template',
      });
    }
  } catch (error) {
    console.error(`🔗 [REFERRAL] Error in sendReferralProductCard:`, error);
  }
}
