import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';
import {
  verifySignature,
  generateEventId,
  FacebookWebhookPayload,
  MessagingEvent,
  ChangeEvent,
} from '@/lib/facebook/utils';
import { sendMessage, replyToComment } from '@/lib/facebook/messenger';
import { searchProductsByKeywords } from '@/lib/db/products';
import { createProductCard, createProductCarousel } from '@/lib/facebook/templates';

type Product = Database['public']['Tables']['products']['Row'];

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
  // NUCLEAR LOGGING: Log that request was received
  console.log('🔥 [WEBHOOK] POST request received at:', new Date().toISOString());
  
  try {
    // Get environment variables
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    if (!appSecret) {
      console.error('❌ [WEBHOOK] FACEBOOK_APP_SECRET is not configured');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // NUCLEAR LOGGING: Get and log raw body IMMEDIATELY
    const rawBody = await request.text();
    console.log('🔥 [WEBHOOK] RAW BODY LENGTH:', rawBody.length);
    console.log('🔥 [WEBHOOK] RAW BODY (first 500 chars):', rawBody.substring(0, 500));
    
    const signature = request.headers.get('x-hub-signature-256');
    console.log('🔥 [WEBHOOK] Signature header:', signature ? 'Present' : 'Missing');

    // Verify signature
    if (!signature || !verifySignature(rawBody, signature, appSecret)) {
      console.warn('❌ [WEBHOOK] Invalid webhook signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }
    console.log('✅ [WEBHOOK] Signature verified');

    // Parse payload
    const payload: FacebookWebhookPayload = JSON.parse(rawBody);
    console.log('🔥 [WEBHOOK] Parsed payload object type:', payload.object);
    console.log('🔥 [WEBHOOK] Number of entries:', payload.entry?.length || 0);

    // Log the full webhook payload for debugging
    console.log('📦 [WEBHOOK] Full payload:', JSON.stringify(payload, null, 2));

    // Only process page events
    if (payload.object !== 'page') {
      console.log(`⚠️ [WEBHOOK] Ignoring non-page event: ${payload.object}`);
      return NextResponse.json({ status: 'ok' }, { status: 200 });
    }
    console.log('✅ [WEBHOOK] Object type is "page", proceeding...');

    // Create Supabase admin client (bypasses RLS for webhooks)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
    console.log('✅ [WEBHOOK] Supabase admin client created');

    // Process each entry
    console.log('🔄 [WEBHOOK] Starting to process entries...');
    for (let i = 0; i < payload.entry.length; i++) {
      const entry = payload.entry[i];
      console.log(`🔥 [WEBHOOK] Processing entry ${i + 1}/${payload.entry.length}, ID: ${entry.id}`);
      console.log(`🔥 [WEBHOOK] Entry has messaging: ${!!entry.messaging}, has changes: ${!!entry.changes}`);
      
      // Process messaging events (Direct Messages)
      if (entry.messaging) {
        console.log(`📨 [WEBHOOK] Entry ${i + 1} has ${entry.messaging.length} messaging events`);
        for (const event of entry.messaging) {
          console.log('📨 [WEBHOOK] Processing messaging event...');
          await processMessagingEvent(supabaseAdmin, entry.id, event);
        }
      } else {
        console.log(`⚠️ [WEBHOOK] Entry ${i + 1} has NO messaging events`);
      }

      // Process change events (Comments, Posts, etc.)
      if (entry.changes) {
        console.log(`💬 [WEBHOOK] Entry ${i + 1} has ${entry.changes.length} change events`);
        for (let j = 0; j < entry.changes.length; j++) {
          const change = entry.changes[j];
          console.log(`💬 [WEBHOOK] Processing change ${j + 1}/${entry.changes.length}, field: ${change.field}`);
          await processChangeEvent(supabaseAdmin, entry.id, change);
        }
      } else {
        console.log(`⚠️ [WEBHOOK] Entry ${i + 1} has NO change events`);
      }
    }
    console.log('✅ [WEBHOOK] All entries processed successfully');

    return NextResponse.json({ status: 'ok' }, { status: 200 });
  } catch (error) {
    console.error('❌ [WEBHOOK] Error processing webhook:', error);
    // Return 200 to prevent Facebook from retrying
    return NextResponse.json({ status: 'error' }, { status: 200 });
  }
}

/**
 * Sends a template message (e.g., Generic Template for product cards)
 */
async function sendTemplateMessage(
  pageId: string,
  recipientPsid: string,
  template: any
): Promise<void> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const { data: fbPage, error: pageError } = await supabase
      .from('facebook_pages')
      .select('encrypted_access_token, workspace_id')
      .eq('id', parseInt(pageId))
      .single();

    if (pageError || !fbPage) {
      throw new Error(`Failed to fetch Facebook page: ${pageError?.message || 'Page not found'}`);
    }

    const accessToken = fbPage.encrypted_access_token;

    const requestBody = {
      recipient: {
        id: recipientPsid,
      },
      message: template,
    };

    const apiUrl = `https://graph.facebook.com/v19.0/${pageId}/messages?access_token=${accessToken}`;
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Facebook API error: ${JSON.stringify(errorData)}`);
    }

    console.log(`✅ Template message sent to ${recipientPsid}`);
  } catch (error) {
    console.error('Error sending template message:', error);
    throw error;
  }
}

/**
 * Process a single messaging event - REFACTORED WITH STATE MANAGEMENT
 */
async function processMessagingEvent(
  supabase: any,
  entryId: string,
  event: MessagingEvent
) {
  try {
    const { sender, recipient, timestamp } = event;
    const customerPsid = sender.id;
    const pageId = recipient.id;

    // ========================================
    // PRIORITY 1: Handle Postback (Button Clicks)
    // ========================================
    if (event.postback) {
      console.log('🔘 Postback event detected:', event.postback.payload);
      await handlePostback(supabase, pageId, customerPsid, event.postback.payload, timestamp);
      return;
    }

    // ========================================
    // PRIORITY 2 & 3: Handle Messages
    // ========================================
    if (!event.message || !event.message.mid) {
      console.log('Skipping non-message event');
      return;
    }

    const { message } = event;
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

    // Generate event ID for idempotency
    const eventId = generateEventId(entryId, timestamp, messageId);

    // Check if event already processed
    const { data: existingEvent } = await supabase
      .from('webhook_events')
      .select('id')
      .eq('event_id', eventId)
      .single();

    if (existingEvent) {
      console.log(`Duplicate event detected: ${eventId}`);
      return;
    }

    // Log event to webhook_events table
    await supabase.from('webhook_events').insert({
      event_id: eventId,
      event_type: 'messaging',
      payload: event,
    });

    // Find the connected Facebook page
    const { data: fbPage, error: pageError } = await supabase
      .from('facebook_pages')
      .select('id, workspace_id')
      .eq('id', parseInt(pageId))
      .single();

    if (pageError || !fbPage) {
      console.error(`Facebook page not found: ${pageId}`, pageError);
      return;
    }

    // ========================================
    // STEP 1: FETCH CURRENT CONVERSATION STATE
    // ========================================
    let { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('fb_page_id', fbPage.id)
      .eq('customer_psid', customerPsid)
      .single();

    if (convError || !conversation) {
      // Create new conversation
      const { data: newConversation, error: createError } = await supabase
        .from('conversations')
        .insert({
          workspace_id: fbPage.workspace_id,
          fb_page_id: fbPage.id,
          customer_psid: customerPsid,
          current_state: 'IDLE',
          context: { state: 'IDLE' },
          last_message_at: new Date(timestamp).toISOString(),
        })
        .select('*')
        .single();

      if (createError) {
        console.error('Error creating conversation:', createError);
        return;
      }

      conversation = newConversation;
    }

    // Parse current state and context
    const currentState = (conversation.current_state as any) || 'IDLE';
    const currentContext = (conversation.context as any) || { state: 'IDLE' };

    console.log(`📊 Current State: ${currentState}`);
    console.log(`📊 Current Context:`, currentContext);

    // Insert customer message
    const { error: messageError } = await supabase.from('messages').insert({
      conversation_id: conversation.id,
      sender: 'customer',
      message_text: messageText,
      message_type: message.attachments ? 'attachment' : 'text',
      attachments: message.attachments || null,
    });

    if (messageError) {
      console.error('Error inserting message:', messageError);
    }

    // ========================================
    // STEP 2: DETERMINE ROUTING STRATEGY
    // ========================================
    const orderFlowStates = ['CONFIRMING_PRODUCT', 'COLLECTING_NAME', 'COLLECTING_PHONE', 'COLLECTING_ADDRESS', 'CONFIRMING_ORDER'];
    const isInOrderFlow = orderFlowStates.includes(currentState);

    // ========================================
    // STEP 3: PROCESS MESSAGE BASED ON STATE
    // ========================================
    
    // CASE A: Image Message
    if (imageUrl) {
      await handleImageMessage(
        supabase,
        conversation,
        fbPage,
        pageId,
        customerPsid,
        currentState,
        currentContext,
        imageUrl,
        messageText
      );
      return;
    }

    // CASE B: User is in Order Flow
    if (isInOrderFlow && messageText) {
      await handleOrderFlowMessage(
        supabase,
        conversation,
        fbPage,
        pageId,
        customerPsid,
        currentState,
        currentContext,
        messageText
      );
      return;
    }

    // CASE C: User is in IDLE - Use Intent Detection
    if (messageText && messageText.trim()) {
      await handleIdleMessage(
        supabase,
        conversation,
        fbPage,
        pageId,
        customerPsid,
        messageText
      );
      return;
    }

    // Fallback: No text and no image
    await sendMessage(
      pageId,
      customerPsid,
      'আসসালামু আলাইকুম! 👋\n\nSend me a product name or photo to get started! 📸'
    );
  } catch (error) {
    console.error('Error processing messaging event:', error);
  }
}

/**
 * Handle image messages - calls image recognition and state machine
 */
async function handleImageMessage(
  supabase: any,
  conversation: any,
  fbPage: any,
  pageId: string,
  customerPsid: string,
  currentState: string,
  currentContext: any,
  imageUrl: string,
  messageText?: string
) {
  try {
    console.log('🖼️ Processing image message...');

    // Call image recognition API
    const formData = new FormData();
    formData.append('imageUrl', imageUrl);
    formData.append('workspaceId', fbPage.workspace_id);

    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/image-recognition`, {
      method: 'POST',
      body: formData,
    });

    const imageRecognitionResult = await response.json();

    // Call state machine with image recognition result
    const { processMessage } = await import('@/lib/conversation/state-machine');
    
    const result = await processMessage(
      currentState as any,
      currentContext,
      fbPage.workspace_id,
      messageText,
      imageUrl,
      imageRecognitionResult
    );

    // Save new state and context
    await supabase
      .from('conversations')
      .update({
        current_state: result.newState,
        context: result.context,
        customer_name: result.context.customerName || conversation.customer_name,
        last_message_at: new Date().toISOString(),
      })
      .eq('id', conversation.id);

    // Send reply
    await sendMessage(pageId, customerPsid, result.reply);

    // Log bot message
    await supabase.from('messages').insert({
      conversation_id: conversation.id,
      sender: 'bot',
      message_text: result.reply,
      message_type: 'text',
    });

    console.log(`✅ Image processed, new state: ${result.newState}`);
  } catch (error) {
    console.error('❌ Error in handleImageMessage:', error);
    await sendMessage(pageId, customerPsid, 'দুঃখিত! ছবি প্রসেস করতে সমস্যা হয়েছে। 😔');
  }
}

/**
 * Handle messages during order flow - uses state machine
 */
async function handleOrderFlowMessage(
  supabase: any,
  conversation: any,
  fbPage: any,
  pageId: string,
  customerPsid: string,
  currentState: string,
  currentContext: any,
  messageText: string
) {
  try {
    console.log(`🔄 Processing order flow message in state: ${currentState}`);

    // Call state machine
    const { processMessage } = await import('@/lib/conversation/state-machine');
    
    const result = await processMessage(
      currentState as any,
      currentContext,
      fbPage.workspace_id,
      messageText
    );

    // ========================================
    // HANDLE ACTION FLAGS
    // ========================================
    
    // ACTION: LEARN_HASH - Save image hash for learning mode
    if (result.action === 'LEARN_HASH') {
      console.log('🧠 [LEARN_HASH] Saving image hash for learning...');
      
      // Get the most recent image message from this conversation
      const { data: recentMessages } = await supabase
        .from('messages')
        .select('attachments')
        .eq('conversation_id', conversation.id)
        .eq('sender', 'customer')
        .not('attachments', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1);

      if (recentMessages && recentMessages.length > 0) {
        const attachments = recentMessages[0].attachments as any[];
        const imageAttachment = attachments?.find((att: any) => att.type === 'image');
        
        if (imageAttachment && imageAttachment.payload?.url) {
          const imageUrl = imageAttachment.payload.url;
          console.log(`🧠 [LEARN_HASH] Image URL: ${imageUrl}`);
          
          // Call learning endpoint to save hash
          try {
            const learnResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/learn-hash`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                imageUrl,
                productId: result.context.productId,
                workspaceId: fbPage.workspace_id,
              }),
            });

            if (learnResponse.ok) {
              console.log('✅ [LEARN_HASH] Hash saved successfully');
            } else {
              console.error('❌ [LEARN_HASH] Failed to save hash:', await learnResponse.text());
            }
          } catch (error) {
            console.error('❌ [LEARN_HASH] Error calling learn-hash API:', error);
          }
        }
      }
    }
    
    // ACTION: CREATE_ORDER - Create order in database
    if (result.action === 'CREATE_ORDER') {
      console.log('📦 [CREATE_ORDER] Creating order...');
      const orderNumber = await createOrder(supabase, fbPage, conversation, result.context);
      
      // Replace PENDING with actual order number in reply
      result.reply = result.reply.replace('PENDING', orderNumber);
      console.log(`✅ [CREATE_ORDER] Order created: ${orderNumber}`);
    }

    // ========================================
    // SAVE STATE AND SEND REPLY
    // ========================================
    
    // Save new state and context
    await supabase
      .from('conversations')
      .update({
        current_state: result.newState,
        context: result.context,
        customer_name: result.context.customerName || conversation.customer_name,
        last_message_at: new Date().toISOString(),
      })
      .eq('id', conversation.id);

    // Send reply
    await sendMessage(pageId, customerPsid, result.reply);

    // Log bot message
    await supabase.from('messages').insert({
      conversation_id: conversation.id,
      sender: 'bot',
      message_text: result.reply,
      message_type: 'text',
    });

    console.log(`✅ Order flow processed, new state: ${result.newState}`);
  } catch (error) {
    console.error('❌ Error in handleOrderFlowMessage:', error);
    await sendMessage(pageId, customerPsid, 'দুঃখিত! কিছু একটা সমস্যা হয়েছে। 😔 আবার চেষ্টা করুন।');
  }
}

/**
 * Handle messages in IDLE state - uses intent detection
 */
async function handleIdleMessage(
  supabase: any,
  conversation: any,
  fbPage: any,
  pageId: string,
  customerPsid: string,
  messageText: string
) {
  try {
    console.log('💬 Processing IDLE message with intent detection...');

    // Import the hybrid intent detector
    const { detectUserIntent, extractProductQuery } = await import(
      '@/lib/conversation/intent-detector'
    );

    // Detect user intent
    const intentResult = await detectUserIntent(messageText);
    console.log(`🧠 Intent detected: ${intentResult.intent} (source: ${intentResult.source})`);

    // Route based on detected intent
    switch (intentResult.intent) {
      case 'greeting':
        await sendMessage(
          pageId,
          customerPsid,
          '👋 আসসালামু আলাইকুম! Welcome to our store!\n\n' +
          '📸 Send me a photo of any product\n' +
          '💬 Or tell me what you\'re looking for!\n\n' +
          'Example: "Red Saree" or "Polo T-shirt"'
        );
        break;

      case 'price_query':
        await sendMessage(
          pageId,
          customerPsid,
          '💰 I\'d be happy to help with pricing!\n\n' +
          'Please send me:\n' +
          '📸 A photo of the product, OR\n' +
          '💬 The product name\n\n' +
          'Example: "Red Saree" or "Polo T-shirt"'
        );
        break;

      case 'product_search':
        // Extract search query from entities or use original text
        let searchQuery = extractProductQuery(intentResult.entities);
        if (!searchQuery) {
          searchQuery = messageText;
        }

        console.log(`🔍 Searching for: "${searchQuery}"`);

        // Search for products
        const products = await searchProductsByKeywords(searchQuery, fbPage.workspace_id);

        if (products.length === 0) {
          // No match
          await sendMessage(
            pageId,
            customerPsid,
            `Sorry, I couldn't find "${searchQuery}" in our catalog. 😔\n\n` +
            'Try:\n' +
            '📸 Sending me a photo of the product\n' +
            '💬 Using different keywords\n\n' +
            'Example: "Saree", "Shirt", "Dress"'
          );
        } else if (products.length === 1) {
          // Single match - route through state machine for consistency with image search
          console.log(`✅ Found 1 product: ${products[0].name}`);
          console.log('🔄 Routing through state machine for consistent experience...');
          
          // Create a mock image recognition result with the found product
          const mockImageRecognitionResult = {
            success: true,
            match: {
              product: products[0],
            },
          };

          // Call state machine to handle product confirmation
          const { processMessage } = await import('@/lib/conversation/state-machine');
          
          const result = await processMessage(
            'IDLE' as any,
            { state: 'IDLE' },
            fbPage.workspace_id,
            messageText,
            undefined,
            mockImageRecognitionResult
          );

          // Save new state and context
          await supabase
            .from('conversations')
            .update({
              current_state: result.newState,
              context: result.context,
              last_message_at: new Date().toISOString(),
            })
            .eq('id', conversation.id);

          // Send reply (detailed PRODUCT_FOUND message)
          await sendMessage(pageId, customerPsid, result.reply);

          // Log bot message
          await supabase.from('messages').insert({
            conversation_id: conversation.id,
            sender: 'bot',
            message_text: result.reply,
            message_type: 'text',
          });

          console.log(`✅ Product routed through state machine, new state: ${result.newState}`);
        } else {
          // Multiple matches - send carousel (different UX for multiple products)
          console.log(`✅ Found ${products.length} products`);
          await sendMessage(
            pageId,
            customerPsid,
            `Great! I found ${products.length} options for "${searchQuery}" 🎉\n\nTake a look:`
          );
          
          const carousel = createProductCarousel(products, pageId, customerPsid);
          await sendTemplateMessage(pageId, customerPsid, carousel);
          
          await supabase.from('messages').insert({
            conversation_id: conversation.id,
            sender: 'bot',
            message_text: `Product carousel sent: ${products.length} products`,
            message_type: 'template',
          });
        }
        break;

      case 'order_status':
        await sendMessage(
          pageId,
          customerPsid,
          '📦 To check your order status:\n\n' +
          '1️⃣ Please provide your order number\n' +
          '2️⃣ Or contact us at [your contact info]\n\n' +
          '💡 Order tracking feature coming soon!'
        );
        break;

      case 'general_query':
        await sendMessage(
          pageId,
          customerPsid,
          '❓ I\'m here to help!\n\n' +
          'I can help you:\n' +
          '🛍️ Find products (send photo or name)\n' +
          '💰 Check prices\n' +
          '📦 Place orders\n\n' +
          'What would you like to do?'
        );
        break;

      default:
        await sendMessage(
          pageId,
          customerPsid,
          'Sorry, I didn\'t quite understand that. 😔\n\n' +
          'I can help you find products!\n\n' +
          '📸 Send me a photo of the product\n' +
          '💬 Or tell me what you\'re looking for\n\n' +
          'Example: "Red Saree", "Polo T-shirt"'
        );
        break;
    }

    console.log(`✅ IDLE message processed with intent: ${intentResult.intent}`);
  } catch (error) {
    console.error('❌ Error in handleIdleMessage:', error);
    await sendMessage(pageId, customerPsid, 'দুঃখিত! কিছু একটা সমস্যা হয়েছে। 😔 আবার চেষ্টা করুন।');
  }
}

/**
 * Create an order in the database
 */
async function createOrder(
  supabase: any,
  fbPage: any,
  conversation: any,
  context: any
): Promise<string> {
  console.log('📦 [CREATE_ORDER] Starting order creation...');
  console.log('📦 [CREATE_ORDER] Full context received:', JSON.stringify(context, null, 2));
  console.log('📦 [CREATE_ORDER] Customer data:', {
    customerName: context.customerName,
    customerPhone: context.customerPhone,
    customerAddress: context.customerAddress,
  });
  console.log('📦 [CREATE_ORDER] Product data:', {
    productId: context.productId,
    productName: context.productName,
    productPrice: context.productPrice,
  });
  console.log('📦 [CREATE_ORDER] Order data:', {
    deliveryCharge: context.deliveryCharge,
    totalAmount: context.totalAmount,
  });

  const { generateOrderNumber } = await import('@/lib/conversation/replies');
  const orderNumber = generateOrderNumber();

  console.log(`📦 [CREATE_ORDER] Generated order number: ${orderNumber}`);

  const orderData = {
    workspace_id: fbPage.workspace_id,
    fb_page_id: fbPage.id,
    conversation_id: conversation.id,
    product_id: context.productId,
    customer_name: context.customerName,
    customer_phone: context.customerPhone,
    customer_address: context.customerAddress,
    product_price: context.productPrice,
    delivery_charge: context.deliveryCharge,
    total_amount: context.totalAmount,
    order_number: orderNumber,
    status: 'pending',
    payment_status: 'unpaid',
    quantity: 1,
  };

  console.log('📦 [CREATE_ORDER] Order data to insert:', JSON.stringify(orderData, null, 2));

  const { error: orderError } = await supabase
    .from('orders')
    .insert(orderData);

  if (orderError) {
    console.error('❌ [CREATE_ORDER] Error creating order:', orderError);
    throw orderError;
  }

  console.log(`🎉 [CREATE_ORDER] Order created successfully: ${orderNumber}`);
  return orderNumber;
}

/**
 * Handle postback events (button clicks)
 */
async function handlePostback(
  supabase: any,
  pageId: string,
  customerPsid: string,
  payload: string,
  timestamp: number
) {
  try {
    console.log(`🔘 Processing postback: ${payload}`);

    // Find the connected Facebook page
    const { data: fbPage, error: pageError } = await supabase
      .from('facebook_pages')
      .select('id, workspace_id')
      .eq('id', parseInt(pageId))
      .single();

    if (pageError || !fbPage) {
      console.error(`Facebook page not found: ${pageId}`, pageError);
      return;
    }

    // Handle ORDER_NOW button
    if (payload.startsWith('ORDER_NOW_')) {
      const productId = payload.replace('ORDER_NOW_', '');
      console.log(`🛒 Order Now clicked for product: ${productId}`);

      // Fetch product details
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .single();

      if (productError || !product) {
        await sendMessage(pageId, customerPsid, 'দুঃখিত! পণ্যটি খুঁজে পাওয়া যায়নি। 😔');
        return;
      }

      // Update conversation state to COLLECTING_NAME
      const { updateConversation } = await import('@/lib/conversation/state-machine');
      
      await updateConversation(
        fbPage.workspace_id,
        fbPage.id,
        customerPsid,
        null,
        'COLLECTING_NAME',
        {
          state: 'COLLECTING_NAME',
          productId: product.id,
          productName: product.name,
          productPrice: product.price,
        }
      );

      // Send reply
      await sendMessage(pageId, customerPsid, 'Perfect! 🎉 What is your name?');
      
      console.log(`✅ State updated to COLLECTING_NAME for product: ${product.name}`);
      return;
    }

    // Handle VIEW_DETAILS button
    if (payload.startsWith('VIEW_DETAILS_')) {
      const productId = payload.replace('VIEW_DETAILS_', '');
      console.log(`ℹ️ View Details clicked for product: ${productId}`);

      // Fetch product details
      const { data: product, error: productError } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .single();

      if (productError || !product) {
        await sendMessage(pageId, customerPsid, 'দুঃখিত! পণ্যটি খুঁজে পাওয়া যায়নি। 😔');
        return;
      }

      // Send product description
      const description = product.description || 'No description available.';
      const detailsMessage = `📦 *${product.name}*\n\n${description}\n\n💰 Price: ৳${product.price}\n📦 Stock: ${product.stock_quantity || 0} available`;
      
      await sendMessage(pageId, customerPsid, detailsMessage);
      
      console.log(`✅ Product details sent for: ${product.name}`);
      return;
    }

    // Handle BACK_TO_SEARCH button
    if (payload === 'BACK_TO_SEARCH') {
      await sendMessage(
        pageId,
        customerPsid,
        'What are you looking for? Send me a product name or photo! 📸'
      );
      return;
    }

    // Unknown postback
    console.warn(`⚠️ Unknown postback payload: ${payload}`);
    await sendMessage(pageId, customerPsid, 'দুঃখিত! বুঝতে পারিনি। 😔');
  } catch (error) {
    console.error('Error handling postback:', error);
  }
}

/**
 * Process a single change event (feed/comment)
 */
async function processChangeEvent(
  supabase: any,
  entryId: string,
  change: ChangeEvent
) {
  try {
    console.log('💬 [CHANGE] processChangeEvent called');
    console.log('💬 [CHANGE] Change field:', change.field);
    console.log('💬 [CHANGE] Change value:', JSON.stringify(change.value, null, 2));
    
    // Only process feed changes
    if (change.field !== 'feed') {
      console.log(`⚠️ [CHANGE] Skipping non-feed change: ${change.field}`);
      return;
    }
    console.log('✅ [CHANGE] Field is "feed", proceeding...');

    const { value } = change;
    console.log('💬 [CHANGE] Value item:', value.item);
    console.log('💬 [CHANGE] Value verb:', value.verb);

    // Only process new comments
    if (value.item !== 'comment' || value.verb !== 'add') {
      console.log(`⚠️ [CHANGE] Skipping non-comment or non-add event: ${value.item}/${value.verb}`);
      return;
    }
    console.log('✅ [CHANGE] Item is "comment" and verb is "add", proceeding...');

    const commentId = value.comment_id;
    const commentMessage = value.message;
    const commenterId = value.from.id;
    const commenterName = value.from.name;
    const pageId = entryId;

    console.log(`Processing comment from ${commenterName} (${commenterId}): ${commentMessage}`);

    // Generate event ID for idempotency
    const eventId = generateEventId(entryId, value.created_time, commentId);

    // Check if event already processed
    const { data: existingEvent } = await supabase
      .from('webhook_events')
      .select('id')
      .eq('event_id', eventId)
      .single();

    if (existingEvent) {
      console.log(`Duplicate comment event detected: ${eventId}`);
      return;
    }

    // Log event to webhook_events table
    await supabase.from('webhook_events').insert({
      event_id: eventId,
      event_type: 'comment',
      payload: value,
    });

    // Find the connected Facebook page
    const { data: fbPage, error: pageError } = await supabase
      .from('facebook_pages')
      .select('id, encrypted_access_token')
      .eq('id', parseInt(pageId))
      .single();

    if (pageError || !fbPage) {
      console.error(`Facebook page not found: ${pageId}`, pageError);
      return;
    }

    // Filter out comments made by the page itself
    if (commenterId === pageId) {
      console.log('Skipping comment made by the page itself');
      return;
    }

    const accessToken = fbPage.encrypted_access_token;

    // Reply to the comment
    try {
      const replyMessage = 'Thanks for your comment! Please check your inbox.';
      await replyToComment(commentId, replyMessage, accessToken);
      console.log(`Comment reply posted for comment ${commentId}`);
    } catch (replyError) {
      console.error('Error replying to comment:', replyError);
      // Don't throw - event was already logged
    }
  } catch (error) {
    console.error('Error processing change event:', error);
  }
}

