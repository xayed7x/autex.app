/**
 * Orchestrator - Main Message Processing Controller (AGENTIC REFACTOR)
 * 
 * The single entry point for all message processing.
 * Wires the webhook to the new Single Agent architecture and memory summarizer.
 */

import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';
import { getCachedSettings } from '@/lib/workspace/settings-cache';
import { ConversationContext, PendingImage, ConversationState } from '@/types/conversation';
import { sendMessage, sendProductCard, sendProductCarousel } from '@/lib/facebook/messenger';
import { ChatCompletionMessageParam } from 'openai/resources/index.mjs';
import { runAgent, AgentInput } from '@/lib/ai/single-agent';
import { manageMemory } from '@/lib/ai/memory-manager';
import { renderOrderConfirmationMessages } from '@/lib/ai/tools/transactional-messages';

// ============================================
// TYPES
// ============================================

export interface ProcessMessageInput {
  pageId: string;
  customerPsid: string;
  messageText?: string;
  imageUrl?: string;
  mid?: string | null;
  replyToMid?: string | null;
  workspaceId: string;
  fbPageId: number;
  conversationId: string;
  isTestMode?: boolean;
  botEnabled?: boolean;
}

export interface ProductCard {
  id: string;
  name: string;
  price: number;
  imageUrl: string;
  stock: number;
  category?: string;
  description?: string;
  variations?: {
    colors?: string[];
    sizes?: string[];
  };
  media_images?: string[];
  media_videos?: string[];
}

export interface ProcessMessageResult {
  response: string;
  newState: ConversationState;
  updatedContext: ConversationContext;
  orderCreated?: boolean;
  orderNumber?: string;
  productCard?: ProductCard;
}

// ============================================
// MAIN ORCHESTRATOR FUNCTION
// ============================================

export async function processMessage(input: ProcessMessageInput): Promise<ProcessMessageResult> {
  const startTime = Date.now();
  
  console.log('\n🎭 ORCHESTRATOR STARTED (AGENTIC)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Customer: ${input.customerPsid}`);
  console.log(`Message: "${input.messageText || '(image)'}"`);
  console.log(`Has Image: ${!!input.imageUrl}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  try {
    // ========================================
    // STEP 1: LOAD DB & SETTINGS
    // ========================================
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    
    const settings = await getCachedSettings(input.workspaceId);
    
    // Load conversation
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', input.conversationId)
      .single();
    
    if (convError || !conversation) {
      throw new Error(`Failed to load conversation: ${convError?.message}`);
    }
    
    const convData = conversation as any;
    let currentContext: ConversationContext = convData.context || {
      state: convData.current_state || 'IDLE',
      cart: [],
      checkout: {},
      metadata: { messageCount: 0 },
    };

    // If conversation is marked as manual, halt agent and return silently
    if (convData.control_mode === 'manual') {
      console.log('🛑 [MANUAL MODE] Conversation is in manual mode. Agent paused. Returning silently.');
      return {
        response: '',
        newState: convData.current_state,
        updatedContext: currentContext,
      };
    }

    // ========================================
    // FAST PATH: Payment Digit Collection (Bug 3 fix)
    // ========================================
    // If we're awaiting payment digits and customer sent exactly 2 numeric digits,
    // handle it directly without calling the full agent.
    const messageText = input.messageText?.trim() || '';
    const PAYMENT_DIGIT_REGEX = /^\d{2}$/;

    // Also add digit extraction for natural 
    // language messages when flag is active:
    let extractedDigits: string | null = null;
    if (currentContext.metadata?.awaitingPaymentDigits) {
      const digitMatch = messageText.match(/\b(\d{2})\b/);
      if (digitMatch) {
        extractedDigits = digitMatch[1];
      }
    }

    const isExactDigits = PAYMENT_DIGIT_REGEX.test(messageText);
    const digitsToProcess = isExactDigits ? messageText : extractedDigits;

    // Handle incoming payment digits (either exact 2-digit message or extracted from natural text)
    if (currentContext.metadata?.awaitingPaymentDigits && digitsToProcess) {
      console.log(`💳 [FAST PATH] Payment digits received: ${digitsToProcess}`);
      
      // Save payment digits to the order in the database
      const orderId = currentContext.metadata.awaitingPaymentOrderId;
      if (orderId) {
        await supabase.from('orders').update({
          payment_last_two_digits: digitsToProcess,
        } as any).eq('id', orderId);
        console.log(`💳 [FAST PATH] Saved payment_digits to order ${orderId}`);
      }

      // Render the paymentReview template
      const customerName = currentContext.checkout?.customerName || 'Sir';
      const paymentReviewTemplate = settings.fastLaneMessages?.paymentReview
        || 'ধন্যবাদ {name}! 🙏\n\n📱 আপনার payment digits ({digits}) পেয়েছি। ✅\n\nআমরা এখন payment verify করবো। সফল হলে ৩ দিনের মধ্যে আপনার order deliver করা হবে। 📦\n\nআমাদের সাথে কেনাকাটার জন্য ধন্যবাদ! 🎉';
      
      const reviewMessage = paymentReviewTemplate
        .replace(/\{name\}/g, customerName)
        .replace(/\{digits\}/g, digitsToProcess);

      // Clear the flag
      currentContext.metadata.awaitingPaymentDigits = false;
      currentContext.metadata.awaitingPaymentOrderId = undefined;

      // Persist updated context
      await updateContextInDb(supabase, input.conversationId, 'IDLE', currentContext);

      // Log customer message
      await supabase.from('messages').insert({
        conversation_id: input.conversationId,
        sender: input.customerPsid,
        sender_type: 'customer',
        message_text: messageText,
        message_type: 'text',
        image_url: input.imageUrl || null,
        mid: input.mid || null,
      });

      // Send response
      if (!input.isTestMode) {
        await sendMessage(input.pageId, input.customerPsid, reviewMessage);
      }

      // Log bot message
      await supabase.from('messages').insert({
        conversation_id: input.conversationId,
        sender: 'bot',
        sender_type: 'bot',
        message_text: reviewMessage,
        message_type: 'text',
      });

      const duration = Date.now() - startTime;
      console.log(`✅ [FAST PATH] Payment review sent in ${duration}ms\n`);

      return {
        response: reviewMessage,
        newState: 'IDLE',
        updatedContext: currentContext,
      };
    }

    // Handle invalid digits if we were expecting them
    if (currentContext.metadata?.awaitingPaymentDigits && messageText && !isExactDigits && !extractedDigits && !messageText.startsWith('[SYSTEM:')) {
      const invalidMsg = settings.fastLaneMessages?.invalidPaymentDigits || '⚠️ দুঃখিত! শুধু ২টা digit দিতে হবে।\n\nExample: 78 বা 45\n\nআবার চেষ্টা করুন। 🔢';
      
      if (!input.isTestMode) {
        await sendMessage(input.pageId, input.customerPsid, invalidMsg);
      }

      // Log bot message
      await supabase.from('messages').insert({
        conversation_id: input.conversationId,
        sender: 'bot',
        sender_type: 'bot',
        message_text: invalidMsg,
        message_type: 'text',
      });

      return {
        response: invalidMsg,
        newState: 'IDLE',
        updatedContext: currentContext,
      };
    }

    // Load ALL messages for this conversation to feed the memory manager
    const { data: allMessages, error: msgError } = await supabase
      .from('messages')
      .select('sender, message_text, created_at, mid, image_url, attachments')
      .eq('conversation_id', input.conversationId)
      .order('created_at', { ascending: true }); // Chronological order

    if (msgError) throw msgError;

    const chatHistory = (allMessages || []).map((msg: any) => {
      let content = msg.message_text || '';
      if (msg.image_url) {
        content += content ? ` [Customer sent an image]` : '[Customer sent an image]';
      }
      return {
        role: msg.sender === 'bot' ? 'assistant' : 'user',
        content,
      };
    }) as ChatCompletionMessageParam[];

    // ========================================
    // REPLY CONTEXT & AUTOMATIC SELECTION
    // ========================================
    let replyContext: string | undefined;
    if (input.replyToMid && allMessages) {
      const repliedMsg = allMessages.find((m: any) => m.mid === input.replyToMid);
      if (repliedMsg) {
        // [AUTO-SELECTION] If replied message is a product card, select it automatically
        const attachments = repliedMsg.attachments as any;
        if (attachments?.type === 'product_card' && attachments?.productIds?.length > 0) {
          const productId = attachments.productIds[0];
          console.log(`🎯 [REPLY-TO-CARD] Automatically selecting product: ${productId}`);
          
          if (!currentContext.metadata) currentContext.metadata = { messageCount: 0 };
          currentContext.metadata.activeProductId = productId;
          
          // Inject system instruction so AI knows the choice is already made
          input.messageText = `[SYSTEM: USER REPLIED TO PRODUCT CARD FOR: ${productId}]\n${input.messageText || ''}`;
        }

        if (repliedMsg.sender === 'bot') {
          replyContext = `[Customer is replying to bot's message: '${repliedMsg.message_text}']`;
        } else if (repliedMsg.image_url) {
          replyContext = `[Customer is replying to their own image message]`;
        }
      }
    }

    // ========================================
    // STEP 2: HANDLE IMAGES (UNTOUCHED RECOGNITION API)
    // ========================================
    let imageContext: PendingImage | null = null;
    if (input.imageUrl && (input.botEnabled !== false || input.isTestMode)) {
      console.log('🖼️ Running Image Recognition...');
      const formData = new FormData();
      formData.append('imageUrl', input.imageUrl);
      formData.append('workspaceId', input.workspaceId);
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/image-recognition`, {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();
      
      // === FOOD BUSINESS: INSPIRATION DETECTION ===
      const isFood = settings.businessCategory === 'food';
      const confidence = result.match?.confidence || 0;
      const isInspiration = isFood && (!result.success || confidence < 85);
      
      if (isInspiration) {
        console.log('✨ [INSPIRATION DETECTED] Low confidence or no match found for food item.');
        if (!currentContext.metadata) currentContext.metadata = { messageCount: 0 };
        currentContext.metadata.lastInspirationUrl = input.imageUrl;
      }

      imageContext = {
        url: input.imageUrl,
        timestamp: Date.now(),
        recognitionResult: {
          success: result.success && !!result.match,
          productId: result.match?.product?.id,
          productName: result.match?.product?.name,
          productPrice: result.match?.product?.price,
          imageUrl: result.match?.product?.image_urls?.[0],
          confidence: result.match?.confidence,
          tier: result.match?.tier,
          sizes: result.match?.product?.sizes,
          colors: result.match?.product?.colors,
          variantStock: result.match?.product?.variant_stock,
          media_images: result.match?.product?.media_images,
          media_videos: result.match?.product?.media_videos,
          description: result.match?.product?.description,
          product_attributes: result.match?.product?.product_attributes,
          aiAnalysis: result.aiAnalysis,
          isInspiration, // Pass flag to AI
        },
      };

      // Add to context array like before
      if (!currentContext.pendingImages) currentContext.pendingImages = [];
      currentContext.pendingImages.push(imageContext);

      // Add to identifiedProducts for Generic Template rendering
      // ONLY if it's NOT an inspiration (to avoid random cards)
      if (result.success && result.match?.product && !isInspiration) {
        if (!currentContext.metadata) currentContext.metadata = { messageCount: 0 };
        if (!currentContext.metadata.identifiedProducts) currentContext.metadata.identifiedProducts = [];
        
        currentContext.metadata.identifiedProducts.push(result.match.product);
      }
    }
    
    // ========================================
    // STEP 3: MEMORY SUMMARIZATION
    // ========================================
    // Runs synchronously to compress older messages and return the recent ones
    const { memorySummary, recentMessages } = await manageMemory(
      input.workspaceId,
      input.conversationId,
      convData.memory_summary || null,
      chatHistory
    );

    // ========================================
    // STEP 4: FETCH LAST ORDER DATA (For Lifecycle awareness)
    // ========================================
    const { data: lastOrders } = await supabase
      .from('orders')
      .select('created_at')
      .eq('workspace_id', input.workspaceId)
      .eq('fb_page_id', input.fbPageId)
      .ilike('customer_phone', `%${currentContext.checkout?.customerPhone || ''}%`)
      .order('created_at', { ascending: false })
      .limit(1);
    
    const lastOrderDate = lastOrders && lastOrders.length > 0 ? lastOrders[0].created_at : null;

    // ========================================
    // STEP 5: CALL NEW SINGLE AGENT
    // ========================================
    const agentInput: AgentInput = {
      workspaceId: input.workspaceId,
      fbPageId: input.fbPageId.toString(),
      conversationId: input.conversationId,
      messageText: input.messageText || '',
      isTest: !!convData.is_test,
      replyContext,
      imageRecognitionResult: imageContext,
      conversationHistory: recentMessages,
      memorySummary,
      context: currentContext, 
      settings,
      customerPsid: input.customerPsid,
      currentTime: new Date().toISOString(),
      lastOrderDate,
    };

    console.log(`🤖 Calling Agent... [Memory Summary: ${!!memorySummary}] [Messages Passed: ${recentMessages.length}]`);
    const agentResult = await runAgent(agentInput);

    // The agent's tools mutated `currentContext` in place.
    // Check if an order was created during this run (Step 4 tool side-effect)
    const orderCreated = !!(currentContext.metadata?.latestOrderId);
    let finalResponse = agentResult.response;

    // ========================================
    // STEP 5: TRANSACTIONAL MESSAGES (STRICT FRONT-END REQUIREMENT)
    // ========================================
    if (orderCreated && currentContext.metadata?.latestOrderData) {
      console.log('🛒 Order was created by tool loop. Generating exact transactional templates...');
      
      // Read order data from metadata (cart and checkout are already cleared by save_order sideEffects)
      const od = currentContext.metadata.latestOrderData;

      const orderData = {
        subtotal: od.subtotal,
        deliveryCharge: od.deliveryCharge,
        totalAmount: od.totalAmount,
        orderNumber: currentContext.metadata?.latestOrderNumber || 'NEW',
        customerName: od.customerName,
        itemCount: od.itemCount,
      };

      const messages = renderOrderConfirmationMessages(settings, orderData);
      
      // STRICT OVERRIDE: Mute the AI's output because LLMs invariably hallucinate their own confirmations.
      // We only want the exact, strict transactional templates from the business owner.
      finalResponse = messages.orderConfirmed;

      const isFood = settings.businessCategory === 'food';

      // ON for clothing business, OFF for food business as requested by owner
      // In the future, this will be controlled by a toggle in the AI Setup dashboard.
      if (!isFood && messages.paymentInstructions) {
        // Append payment instructions for non-food businesses (e.g. clothing)
        finalResponse += '\n\n' + messages.paymentInstructions;

        // Set the flag so the NEXT customer message (2 digits) is fast-pathed
        currentContext.metadata.awaitingPaymentDigits = true;
        currentContext.metadata.awaitingPaymentOrderId = currentContext.metadata.latestOrderId;
      }
                      
      // Clear the volatile order metadata now that we've used it
      currentContext.metadata.latestOrderId = undefined;
      currentContext.metadata.latestOrderNumber = undefined;
      currentContext.metadata.latestOrderData = undefined;
    }

    // STEP 5.5: UNIVERSAL DISCOVERY PROTOCOL INTERCEPTION
    // interception rules:
    // 1. Only intercept if products were identified this turn (via search_products/check_stock)
    // 2. AND no flow-locking order tools were called (add_to_cart, save_order, calculate_delivery)
    // 3. AND an order was not just created
    const flowLockingTools = ['add_to_cart', 'save_order', 'calculate_delivery', 'update_customer_info'];
    const flowLocked = agentResult.toolsCalled?.some(toolName => {
      // Handle toolName being either a string or a more complex object if that ever happens
      const name = typeof toolName === 'string' ? toolName.split('(')[0] : '';
      return flowLockingTools.includes(name);
    }) || false;
    
    const hasProducts = currentContext.metadata?.identifiedProducts && currentContext.metadata.identifiedProducts.length > 0;
    
    if (hasProducts && !orderCreated && !flowLocked) {
      const productCount = currentContext.metadata.identifiedProducts.length;
      if (settings.businessCategory === 'food') {
        finalResponse = productCount === 1
          ? `নিচের 'এটা "order" করব' বাটনটিতে ক্লিক করে সরাসরি অর্ডার করতে পারবেন Sir! 👇`
          : `নিচের যে ডিজাইনটি আপনার পছন্দ হয় সেটার 'এটা "order" করব' বাটনটিতে ক্লিক করুন Sir! 👇`;
      } else {
        finalResponse = `অর্ডার করতে চাইলে নিচের কার্ডের 'Order Now 🛒' বাটনে ক্লিক করুন 😊`;
      }
    }

    // ========================================
    // STEP 6: SAVE TO DATABASE & SEND TO FB
    // ========================================
    
    const finalState = agentResult.shouldFlag ? 'MANUAL_REVIEW' : 'IDLE';
    const finalStateToSave = finalState as ConversationState;

    // Update conversation record with modified context
    await updateContextInDb(
      supabase,
      input.conversationId,
      finalStateToSave,
      currentContext
    );
    
    // Capture flags for card suppression BEFORE metadata is potentially modified
    const isShowingSummary = finalResponse?.includes('📋 অর্ডার সামারি');
    const isCollectingInfo = finalResponse?.includes('নাম:') || 
                             finalResponse?.includes('ফোন:') || 
                             finalResponse?.includes('ঠিকানা:');
    const isConfirmationMsg = finalResponse?.includes('অর্ডারটি কনফার্ম করা হয়েছে') || 
                              finalResponse?.includes('অর্ডার কনফার্ম হয়েছে');

    // Send response via Facebook API
    if (finalResponse) {
      if (!input.isTestMode) {
        await sendMessage(input.pageId, input.customerPsid, finalResponse);
      } else {
        console.log('🧪 Test mode: Skipping Facebook API call');
      }
      
      // Log bot message to history
      await supabase.from('messages').insert({
        conversation_id: input.conversationId,
        sender: 'bot',
        sender_type: 'bot',
        message_text: finalResponse,
        message_type: 'text',
      });
    }

    // ========================================
    // STEP 6.5: SEND PRODUCT CARDS (Generic Templates)
    // ========================================
    const pendingProducts = currentContext.metadata?.identifiedProducts;
    
    // Check if we arrived here via Discovery Interception (high confidence match)
    const isDiscoveryTurn = hasProducts && !orderCreated && !flowLocked;

    let productCard: ProductCard | undefined;
    if (pendingProducts && pendingProducts.length > 0) {
      // Filter out products that are already in the cart to avoid redundancy
      // EXCEPT on a Discovery Turn where the customer explicitly sent an image and we acknowledged it with "Click button below"
      const cartProductIds = (currentContext.cart || []).map(item => item.productId);
      const uniquePendingProducts = isDiscoveryTurn 
        ? pendingProducts 
        : pendingProducts.filter((p: any) => !cartProductIds.includes(p.id));

      // SAFETY VALVE: Suppress cards during checkout, summary display, or after order creation
      if (!isDiscoveryTurn && (isShowingSummary || isCollectingInfo || isConfirmationMsg || orderCreated || uniquePendingProducts.length === 0)) {
        currentContext.metadata.identifiedProducts = undefined;
        await updateContextInDb(supabase, input.conversationId, finalStateToSave, currentContext);
      } else {
        const mappedProducts = uniquePendingProducts.map((p: any) => {
          let availableColors = Array.isArray(p.colors) ? [...p.colors] : [];
          if (p.variant_stock && Array.isArray(p.variant_stock) && p.variant_stock.length > 0) {
            availableColors = availableColors.filter(color => 
              p.variant_stock.some((v: any) => v.color?.toLowerCase() === color.toLowerCase() && (v.quantity || 0) > 0)
            );
          } else if (p.variant_stock && typeof p.variant_stock === 'object' && Object.keys(p.variant_stock).length > 0) {
            availableColors = availableColors.filter(color => {
              const keys = Object.keys(p.variant_stock).filter(k => k.toLowerCase().includes(color.toLowerCase()));
              return keys.some(k => Number((p.variant_stock as any)[k]) > 0);
            });
          }

          return {
            id: p.id,
            name: p.name,
            price: p.price,
            imageUrl: p.imageUrl || p.image_urls?.[0] || undefined,
            stock: p.stock_quantity,
            variations: {
              colors: availableColors,
              sizes: p.sizes || []
            },
            product_attributes: p.product_attributes || null,
            description: p.description || null,
            variantStock: p.variantStock || null,
            sizeStock: p.sizeStock || null,
            media_images: p.media_images || [],
            media_videos: p.media_videos || [],
            // Include food-specific fields
            cake_category: p.cake_category,
            price_per_pound: p.price_per_pound,
            min_pounds: p.min_pounds,
            max_pounds: p.max_pounds
          };
        });

        if (!input.isTestMode) {
          if (mappedProducts.length === 1) {
             const result = await sendProductCard(input.pageId, input.customerPsid, mappedProducts[0] as any, settings.businessCategory);
             productCard = mappedProducts[0];
             
             // Log the product card mapping to the database
             await supabase.from('messages').insert({
               conversation_id: input.conversationId,
               sender: 'bot',
               sender_type: 'bot',
               message_text: `[Sent Card: ${mappedProducts[0].name}]`,
               message_type: 'template',
               mid: result.message_id,
               attachments: { type: 'product_card', productIds: [mappedProducts[0].id] }
             });
          } else {
             if (settings.businessCategory === 'food') {
                // FIX 2: Vertical delivery for cakes
                const { sendProductsVertical } = await import('@/lib/facebook/messenger');
                const results = await sendProductsVertical(input.pageId, input.customerPsid, mappedProducts as any, settings.businessCategory);
                
                // Log each vertical card mapping individually
                for (let i = 0; i < results.length; i++) {
                  if (results[i]?.message_id) {
                    await supabase.from('messages').insert({
                      conversation_id: input.conversationId,
                      sender: 'bot',
                      sender_type: 'bot',
                      message_text: `[Sent Vertical Card (${i+1}): ${mappedProducts[i].name}]`,
                      message_type: 'template',
                      mid: results[i].message_id,
                      attachments: { type: 'product_card', productIds: [mappedProducts[i].id] }
                    });
                  }
                }
             } else {
                // Keep horizontal carousel for clothing
                const result = await sendProductCarousel(input.pageId, input.customerPsid, mappedProducts as any, settings.businessCategory);
                
                // Log carousel mapping
                await supabase.from('messages').insert({
                   conversation_id: input.conversationId,
                   sender: 'bot',
                   sender_type: 'bot',
                   message_text: `[Sent Carousel: ${mappedProducts.length} products]`,
                   message_type: 'template',
                   mid: result.message_id,
                   attachments: { type: 'product_card', productIds: mappedProducts.map(p => p.id) }
                });
             }
          }
        }

        // Track which product(s) were shown so subsequent tools can resolve identity
        // without relying on identifiedProducts (which we are about to clear).
        if (mappedProducts.length === 1) {
          // Single card — product context is unambiguous
          currentContext.metadata.activeProductId = mappedProducts[0].id;
          currentContext.metadata.activeProductName = mappedProducts[0].name;
          currentContext.metadata.activeProductPrice = mappedProducts[0].price;
          currentContext.metadata.activeProductDescription = mappedProducts[0].description;
          currentContext.metadata.activeProductVariantStock = mappedProducts[0].variantStock;
          currentContext.metadata.activeProductSizeStock = mappedProducts[0].sizeStock;
          currentContext.metadata.activeProductAttributes = {
            fabric: mappedProducts[0].product_attributes?.fabric || null,
            fitType: mappedProducts[0].product_attributes?.fitType || null,
            occasion: mappedProducts[0].product_attributes?.occasion || null,
            brand: mappedProducts[0].product_attributes?.brand || null,
            sizeChart: mappedProducts[0].product_attributes?.sizeChart || null,
          };
          currentContext.metadata.activeProductMediaImages = mappedProducts[0].media_images;
          currentContext.metadata.activeProductMediaVideos = mappedProducts[0].media_videos;
          currentContext.metadata.recentlyShownProducts = undefined;
        } else {
          // Carousel — customer must click a button to disambiguate
          currentContext.metadata.activeProductId = undefined;
          currentContext.metadata.activeProductName = undefined;
          currentContext.metadata.activeProductPrice = undefined;
          currentContext.metadata.activeProductDescription = undefined;
          currentContext.metadata.activeProductVariantStock = undefined;
          currentContext.metadata.activeProductSizeStock = undefined;
          currentContext.metadata.activeProductAttributes = undefined;
          
          currentContext.metadata.recentlyShownProducts = mappedProducts.map((p: any) => ({
            id: p.id,
            name: p.name,
          }));
        }

        // Clear the identified products so we don't resend them on next turn
        currentContext.metadata.identifiedProducts = undefined;
        await updateContextInDb(supabase, input.conversationId, finalStateToSave, currentContext);
      }
    }

    if (agentResult.shouldFlag) {
      await flagForManualResponse(supabase, input.conversationId, agentResult.flagReason || 'Agent self-flagged or encountered hallucination risk.');
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Orchestrator finished in ${duration}ms (Tool Loops: ${agentResult.toolCallsMade})\n`);

    return {
      response: finalResponse,
      newState: finalStateToSave,
      updatedContext: currentContext,
      orderCreated,
      productCard,
    };
    
  } catch (error) {
    console.error('❌ ORCHESTRATOR ERROR:', error);
    
    // Send generic fallback message to customer
    const failMessage = 'দুঃখিত, একটু technical সমস্যা হচ্ছে। আমি ব্যাপারটা দেখছি। 🙏';
    if (!input.isTestMode) {
      await sendMessage(input.pageId, input.customerPsid, failMessage).catch(console.error);
    }
    
    return {
      response: failMessage,
      newState: 'IDLE',
      updatedContext: { cart: [], checkout: {}, state: 'IDLE', metadata: { messageCount: 0 } }
    };
  }
}

// ============================================
// INTERNAL DB HELPERS (PRESERVED FROM OLD ORCHESTRATOR)
// ============================================

export async function createOrderInDb(
  supabase: any,
  workspaceId: string,
  fbPageId: number,
  conversationId: string,
  context: ConversationContext
): Promise<string> {
  const { data: order, error } = await supabase
    .from('orders')
    .insert({
      workspace_id: workspaceId,
      fb_page_id: fbPageId.toString(),
      conversation_id: conversationId,
      customer_name: context.checkout?.customerName || 'Unknown Customer',
      customer_phone: context.checkout?.customerPhone || 'Unknown Phone',
      customer_address: context.checkout?.customerAddress || 'No Address Provided',
      total_price: 0, // Tools calculate this
      status: 'pending',
      product_name: 'Multiple Items'
    })
    .select('id')
    .single();

  if (error || !order) throw new Error(`Failed to create order: ${error?.message}`);
  return order.id;
}

export async function updateContextInDb(
  supabase: any,
  conversationId: string,
  newState: ConversationState,
  updatedContext: ConversationContext
): Promise<void> {
  await supabase
    .from('conversations')
    .update({
      current_state: newState,
      context: updatedContext,
      last_message_at: new Date().toISOString()
    })
    .eq('id', conversationId);
}

export async function flagForManualResponse(
  supabase: any,
  conversationId: string,
  reason: string
): Promise<void> {
  await supabase
    .from('conversations')
    .update({
      control_mode: 'manual',
      needs_manual_response: true,
      manual_flag_reason: reason,
      manual_flagged_at: new Date().toISOString(),
      state: 'MANUAL_REVIEW' // Used by UI
    })
    .eq('id', conversationId);
  console.log(`🚩 Conversation flagged for manual review: ${reason}`);
}
