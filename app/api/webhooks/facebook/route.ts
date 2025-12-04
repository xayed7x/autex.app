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
 * SIMPLIFIED VERSION - Delegates to Orchestrator
 */
async function processMessagingEvent(
  supabase: any,
  entryId: string,
  event: MessagingEvent
) {
  try {
    const { sender, recipient, timestamp, message } = event;
    const customerPsid = sender.id;
    const pageId = recipient.id;

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
          // Load workspace settings to check order collection style
          const { data: fbPage } = await supabase
            .from('facebook_pages')
            .select('workspace_id')
            .eq('id', pageId)
            .single();
          
          if (!fbPage) return;
          
          const { getCachedSettings } = await import('@/lib/workspace/settings-cache');
          const settings = await getCachedSettings(fbPage.workspace_id);
          
          // Determine state and message based on order collection style
          const isQuickForm = settings.order_collection_style === 'quick_form';
          const targetState = isQuickForm ? 'AWAITING_CUSTOMER_DETAILS' : 'COLLECTING_NAME';
         
          console.log(`🔍 [ORDER_PRODUCT] Order collection style: ${settings.order_collection_style}`);
          console.log(`🔍 [ORDER_PRODUCT] Target state: ${targetState}`);
          
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
                  cart: [{
                    productId: product.id,
                    productName: product.name,
                    productPrice: product.price,
                    productImageUrl: product.image_urls?.[0],
                    quantity: 1,
                  }],
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
                cart: [{
                  productId: product.id,
                  productName: product.name,
                  productPrice: product.price,
                  productImageUrl: product.image_urls?.[0],
                  quantity: 1,
                }],
              },
            };

            // Backfill profile if missing
            if (!conversation.customer_profile_pic_url) {
               const { fetchFacebookProfile } = await import('@/lib/facebook/profile');
               const profile = await fetchFacebookProfile(customerPsid, pageId, supabase);
               if (profile) {
                 updates.customer_name = profile.name;
                 updates.customer_profile_pic_url = profile.profile_pic;
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
            // Send quick form prompt
            const message = settings.quick_form_prompt || 
              'দারুণ! অর্ডারটি সম্পন্ন করতে, অনুগ্রহ করে নিচের ফর্ম্যাট অনুযায়ী আপনার তথ্য দিন:\n\nনাম:\nফোন:\nসম্পূর্ণ ঠিকানা:';
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
            } else if (!conversation.customer_profile_pic_url) {
               // Backfill profile
               const { fetchFacebookProfile } = await import('@/lib/facebook/profile');
               const profile = await fetchFacebookProfile(customerPsid, pageId, supabase);
               if (profile) {
                 await supabase.from('conversations').update({
                   customer_name: profile.name,
                   customer_profile_pic_url: profile.profile_pic
                 }).eq('id', conversation.id);
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
    // FIND FACEBOOK PAGE
    // ========================================
    
    const { data: fbPage, error: pageError } = await supabase
      .from('facebook_pages')
      .select('id, workspace_id')
      .eq('id', pageId)
      .single();

    if (pageError || !fbPage) {
      console.error(`Facebook page not found: ${pageId}`, pageError);
      return;
    }

    // ========================================
    // FIND OR CREATE CONVERSATION
    // ========================================
    
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
          customer_name: profile?.name || 'Unknown Customer',
          customer_profile_pic_url: profile?.profile_pic,
          current_state: 'IDLE',
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
    } else if (!conversation.customer_profile_pic_url) {
       // Backfill profile for existing conversation
       const { fetchFacebookProfile } = await import('@/lib/facebook/profile');
       const profile = await fetchFacebookProfile(customerPsid, pageId, supabase);
       if (profile) {
         await supabase.from('conversations').update({
           customer_name: profile.name,
           customer_profile_pic_url: profile.profile_pic
         }).eq('id', conversation.id);
       }
    }

    // ========================================
    // LOG CUSTOMER MESSAGE
    // ========================================
    
    await supabase.from('messages').insert({
      conversation_id: conversation.id,
      sender: 'customer',
      message_text: messageText,
      message_type: message.attachments ? 'attachment' : 'text',
      attachments: message.attachments || null,
    });

    // ========================================
    // CALL ORCHESTRATOR
    // ========================================
    
    console.log('🎭 Calling Orchestrator...');
    
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
  } catch (error) {
    console.error('❌ Error processing messaging event:', error);
  }
}
