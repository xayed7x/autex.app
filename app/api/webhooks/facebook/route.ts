import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';
import {
  verifySignature,
  generateEventId,
  FacebookWebhookPayload,
  MessagingEvent,
} from '@/lib/facebook/utils';
import { processMessage } from '@/lib/conversation/orchestrator';
import { processingLock } from '@/lib/conversation/processing-lock';

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
 * 
 * SIMPLIFIED VERSION - All logic delegated to Orchestrator
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
    console.log('📦 [WEBHOOK] Payload:', JSON.stringify(payload, null, 2));

    if (payload.object !== 'page') {
      console.log(`⚠️ [WEBHOOK] Ignoring non-page event: ${payload.object}`);
      return NextResponse.json({ status: 'ok' }, { status: 200 });
    }

    // ========================================
    // STEP 3: CREATE SUPABASE CLIENT
    // ========================================
    
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // ========================================
    // STEP 4: PROCESS EACH ENTRY
    // ========================================
    
    for (const entry of payload.entry) {
      console.log(`🔄 [WEBHOOK] Processing entry: ${entry.id}`);
      
      // Process messaging events (Direct Messages)
      if (entry.messaging) {
        for (const event of entry.messaging) {
          await processMessagingEvent(supabase, entry.id, event);
        }
      }
    }

    return NextResponse.json({ status: 'ok' }, { status: 200 });
  } catch (error) {
    console.error('❌ [WEBHOOK] Error processing webhook:', error);
    // Return 200 to prevent Facebook from retrying
    return NextResponse.json({ status: 'error' }, { status: 200 });
  }
}

/**
 * Process a single messaging event
 * 
 * ENHANCED VERSION - Detects owner vs customer messages and handles hybrid control mode
 */
async function processMessagingEvent(
  supabase: any,
  entryId: string,
  event: MessagingEvent
) {
  try {
    const { sender, recipient, timestamp, message } = event;
    const senderId = sender.id;
    const recipientId = recipient.id;
    
    // ========================================
    // DETECT MESSAGE SOURCE (Owner vs Customer)
    // ========================================
    
    // In Facebook webhooks:
    // - Customer to Page: sender.id = customer PSID, recipient.id = page ID
    // - Page to Customer: sender.id = page ID, recipient.id = customer PSID
    // 
    // When owner replies from Messenger app (not via API), Facebook sends us a webhook
    // where sender.id === page_id (the owner's message appears as coming from the page)
    
    console.log(`🔍 [SOURCE DETECTION] sender.id: ${senderId}, recipient.id: ${recipientId}`);
    
    // Fetch the page to check if sender is the page itself (owner message)
    const { data: fbPageCheck } = await supabase
      .from('facebook_pages')
      .select('id, workspace_id, bot_enabled')
      .or(`id.eq.${senderId},id.eq.${recipientId}`)
      .limit(1)
      .single();
    
    if (!fbPageCheck) {
      console.error(`❌ [SOURCE DETECTION] No Facebook page found for sender: ${senderId} or recipient: ${recipientId}`);
      return;
    }
    
    const actualPageId = String(fbPageCheck.id);
    const isOwnerMessage = senderId === actualPageId;
    const customerPsid = isOwnerMessage ? recipientId : senderId;
    const pageId = actualPageId;
    
    console.log(`🔍 [SOURCE DETECTION] Page ID: ${actualPageId}`);
    console.log(`🔍 [SOURCE DETECTION] Is Owner Message: ${isOwnerMessage}`);
    console.log(`🔍 [SOURCE DETECTION] Customer PSID: ${customerPsid}`);

    // ========================================
    // HANDLE POSTBACK (Button Clicks)
    // ========================================
    
    if (event.postback) {
      const payload = event.postback.payload;
      console.log('🔘 Postback event detected:', payload);
      
      // Handle "Order Now" button click
      if (payload.startsWith('ORDER_PRODUCT_')) {
        const productId = payload.replace('ORDER_PRODUCT_', '');
        console.log(`🛒 Order Now clicked for product: ${productId}`);
        
        // Fetch product details
        const { data: product } = await supabase
          .from('products')
          .select('*')
          .eq('id', productId)
          .single();
        
        if (product) {
          // Load workspace settings first
          const { data: fbPage } = await supabase
            .from('facebook_pages')
            .select('workspace_id')
            .eq('id', pageId)
            .single();
          
          if (!fbPage) return;
          
          const { getCachedSettings } = await import('@/lib/workspace/settings-cache');
          const settings = await getCachedSettings(fbPage.workspace_id);
          
          // CHECK STOCK FIRST - If out of stock, don't proceed to order flow
          const totalStock = product.stock_quantity || 0;
          
          if (totalStock === 0) {
            console.log(`❌ [ORDER_PRODUCT] Product out of stock: ${product.name}`);
            const { sendMessage } = await import('@/lib/facebook/messenger');
            const defaultMessage = `দুঃখিত! 😔 "{productName}" এখন স্টকে নেই।\n\nআপনি চাইলে অন্য পণ্যের নাম লিখুন বা স্ক্রিনশট পাঠান। আমরা সাহায্য করতে পারবো! 🛍️`;
            const outOfStockMessage = (settings.out_of_stock_message || defaultMessage)
              .replace('{productName}', product.name);
            await sendMessage(pageId, customerPsid, outOfStockMessage);
            return;
          }
          
          // Determine state and message based on order collection style
          const isQuickForm = settings.order_collection_style === 'quick_form';
          const targetState = isQuickForm ? 'AWAITING_CUSTOMER_DETAILS' : 'COLLECTING_NAME';
         
          console.log(`🔍 [ORDER_PRODUCT] Order collection style: ${settings.order_collection_style}`);
          console.log(`🔍 [ORDER_PRODUCT] Target state: ${targetState}`);
          console.log(`🔍 [ORDER_PRODUCT] Product sizes: ${product.sizes?.join(', ') || 'none'}`);
          console.log(`🔍 [ORDER_PRODUCT] Product colors: ${product.colors?.join(', ') || 'none'}`);
          
          // Build cart item with sizes/colors and stock info for Quick Form validation
          const cartItem = {
            productId: product.id,
            productName: product.name,
            productPrice: product.price,
            productImageUrl: product.image_urls?.[0],
            quantity: 1,
            // Include sizes/colors for Quick Form prompt building
            sizes: product.sizes || [],
            colors: product.colors || [],
            // Include stock info for validation
            size_stock: product.size_stock || [],
            variant_stock: product.variant_stock || [],
            stock_quantity: product.stock_quantity || 0,
            // Pricing Policy for Negotiation
            pricing_policy: product.pricing_policy || { isNegotiable: false },
          };
          
          // Find or create conversation
          let { data: conversation } = await supabase
            .from('conversations')
            .select('*')
            .eq('fb_page_id', pageId)
            .eq('customer_psid', customerPsid)
            .single();
          
          if (!conversation) {
            // Fetch profile for new conversation
            const { fetchFacebookProfile } = await import('@/lib/facebook/profile');
            const profile = await fetchFacebookProfile(customerPsid, pageId, supabase);

            // Create conversation
            const { data: newConv } = await supabase
              .from('conversations')
              .insert({
                workspace_id: fbPage.workspace_id,
                fb_page_id: pageId as unknown as number,
                customer_psid: customerPsid,
                customer_name: profile?.name || 'Unknown Customer',
                customer_profile_pic_url: profile?.profile_pic,
                current_state: targetState,
                context: {
                  state: targetState,
                  cart: [cartItem],
                  checkout: {},
                },
              })
              .select()
              .single();
            conversation = newConv;
          } else {
            // Update existing conversation
            const updates: any = {
              current_state: targetState,
              context: {
                ...conversation.context,
                state: targetState,
                cart: [cartItem],
              },
            };

            // Backfill profile if missing
            const needsProfileBackfill = !conversation.customer_profile_pic_url || 
              !conversation.customer_name || 
              conversation.customer_name === 'Unknown Customer' ||
              conversation.customer_name === 'Facebook User';
            
            if (needsProfileBackfill) {
               const { fetchFacebookProfile } = await import('@/lib/facebook/profile');
               const profile = await fetchFacebookProfile(customerPsid, pageId, supabase);
               if (profile) {
                 if (profile.name && profile.name !== 'Facebook User') {
                   updates.customer_name = profile.name;
                 }
                 if (profile.profile_pic) {
                   updates.customer_profile_pic_url = profile.profile_pic;
                 }
               }
            }

            await supabase
              .from('conversations')
              .update(updates)
              .eq('id', conversation.id);
          }
          
          // Send appropriate message based on collection style
          const { sendMessage } = await import('@/lib/facebook/messenger');
          
          if (isQuickForm) {
            // Build dynamic quick form prompt with sizes/colors if available
            let message = settings.quick_form_prompt || 
              'দারুণ! অর্ডারটি সম্পন্ন করতে, অনুগ্রহ করে নিচের ফর্ম্যাট অনুযায়ী আপনার তথ্য দিন:\n\nনাম:\nফোন:\nসম্পূর্ণ ঠিকানা:';
            
            // Filter sizes to only show in-stock ones
            const allSizes = product.sizes || [];
            const sizeStock = product.size_stock || [];
            const inStockSizes = allSizes.filter((sz: string) => {
              if (sizeStock.length === 0) return true; // No stock tracking, show all
              const stockEntry = sizeStock.find((ss: any) => ss.size?.toUpperCase() === sz.toUpperCase());
              return !stockEntry || stockEntry.quantity > 0;
            });
            
            const hasSizes = inStockSizes.length > 0;
            const hasColors = product.colors && product.colors.length > 1;
            
            if (hasSizes) {
              message += `\nসাইজ: (${inStockSizes.join('/')})`;
            }
            
            if (hasColors) {
              message += `\nকালার: (${product.colors.join('/')})`;
            }
            
            // Add optional quantity field
            message += '\nপরিমাণ: (1 হলে লিখতে হবে না)';
            
            await sendMessage(pageId, customerPsid, message);
          } else {
            // Send conversational ask name message
            const { Replies } = await import('@/lib/conversation/replies');
            await sendMessage(pageId, customerPsid, Replies.ASK_NAME());
          }
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
    
    if (!message || !message.mid) {
      console.log('Skipping non-message event');
      return;
    }

    const messageText = message.text || '';
    const messageId = message.mid;

    // Extract image URL if present
    let imageUrl: string | undefined;
    if (message.attachments && message.attachments.length > 0) {
      const imageAttachment = message.attachments.find(
        (att) => att.type === 'image'
      );
      if (imageAttachment && imageAttachment.payload?.url) {
        imageUrl = imageAttachment.payload.url;
        console.log('📸 Image attachment detected:', imageUrl);
      }
    }

    // ========================================
    // CHECK IDEMPOTENCY
    // ========================================
    
    const eventId = generateEventId(entryId, timestamp, messageId);

    const { data: existingEvent } = await supabase
      .from('webhook_events')
      .select('id')
      .eq('event_id', eventId)
      .single();

    if (existingEvent) {
      console.log(`Duplicate event detected: ${eventId}`);
      return;
    }

    // Log event
    await supabase.from('webhook_events').insert({
      event_id: eventId,
      event_type: 'messaging',
      payload: event,
    });

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
        message_text: messageText,
        message_type: message.attachments ? 'attachment' : 'text',
        attachments: message.attachments || null,
      });
      
      // Update conversation to hybrid mode and track manual reply
      const currentMode = conversation.control_mode || 'bot';
      const newMode = currentMode === 'manual' ? 'manual' : 'hybrid';
      
      await supabase
        .from('conversations')
        .update({
          control_mode: newMode,
          last_manual_reply_at: new Date().toISOString(),
          last_manual_reply_by: 'owner', // Could be user ID if we track it
          last_message_at: new Date(timestamp).toISOString(),
        })
        .eq('id', conversation.id);
      
      console.log(`✅ [OWNER MESSAGE] Saved message, control_mode set to: ${newMode}`);
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
        sender: 'customer',
        sender_type: 'customer',
        message_text: messageText,
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
    // CHECK GLOBAL BOT TOGGLE
    // ========================================
    
    // Check if bot is globally disabled for this page
    if (fbPage.bot_enabled === false) {
      console.log(`🛑 Bot disabled for page ${pageId} - skipping processing`);
      
      // Still save the customer message to database
      await supabase.from('messages').insert({
        conversation_id: conversation.id,
        sender: 'customer',
        sender_type: 'customer',
        message_text: messageText,
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
      sender: 'customer',
      sender_type: 'customer', // New field
      message_text: messageText,
      message_type: message.attachments ? 'attachment' : 'text',
      attachments: message.attachments || null,
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

      await processMessage({
        pageId,
        customerPsid,
        messageText: messageText || undefined,
        imageUrl,
        workspaceId: fbPage.workspace_id,
        fbPageId: fbPage.id,
        conversationId: conversation.id,
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
