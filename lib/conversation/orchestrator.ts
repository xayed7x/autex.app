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
  workspaceId: string;
  fbPageId: number;
  conversationId: string;
  isTestMode?: boolean;
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

    if (currentContext.metadata?.awaitingPaymentDigits && PAYMENT_DIGIT_REGEX.test(messageText)) {
      console.log(`💳 [FAST PATH] Payment digits received: ${messageText}`);
      
      // Save payment digits to the order in the database
      const orderId = currentContext.metadata.awaitingPaymentOrderId;
      if (orderId) {
        await supabase.from('orders').update({
          payment_last_two_digits: messageText,
        } as any).eq('id', orderId);
        console.log(`💳 [FAST PATH] Saved payment_digits to order ${orderId}`);
      }

      // Render the paymentReview template
      const customerName = currentContext.checkout?.customerName || 'ভাইয়া';
      const paymentReviewTemplate = settings.fastLaneMessages?.paymentReview
        || 'ধন্যবাদ {name}! 🙏\n\n📱 আপনার payment digits ({digits}) পেয়েছি। ✅\n\nআমরা এখন payment verify করবো। সফল হলে ৩ দিনের মধ্যে আপনার order deliver করা হবে। 📦\n\nআমাদের সাথে কেনাকাটার জন্য ধন্যবাদ! 🎉';
      
      const reviewMessage = paymentReviewTemplate
        .replace(/\{name\}/g, customerName)
        .replace(/\{digits\}/g, messageText);

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

    // Load ALL messages for this conversation to feed the memory manager
    const { data: allMessages, error: msgError } = await supabase
      .from('messages')
      .select('sender, message_text, created_at')
      .eq('conversation_id', input.conversationId)
      .order('created_at', { ascending: true }); // Chronological order

    if (msgError) throw msgError;

    const chatHistory = (allMessages || []).map((msg: any) => ({
      role: msg.sender === 'bot' ? 'assistant' : 'user',
      content: msg.message_text || '',
    })) as ChatCompletionMessageParam[];

    // ========================================
    // STEP 2: HANDLE IMAGES (UNTOUCHED RECOGNITION API)
    // ========================================
    let imageContext: PendingImage | null = null;
    if (input.imageUrl) {
      console.log('🖼️ Running Image Recognition...');
      const formData = new FormData();
      formData.append('imageUrl', input.imageUrl);
      formData.append('workspaceId', input.workspaceId);
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/image-recognition`, {
        method: 'POST',
        body: formData,
      });
      
      const result = await response.json();
      
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
        },
      };

      // Add to context array like before
      if (!currentContext.pendingImages) currentContext.pendingImages = [];
      currentContext.pendingImages.push(imageContext);

      // Add to identifiedProducts for Generic Template rendering
      if (result.success && result.match?.product) {
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
    // STEP 4: CALL NEW SINGLE AGENT
    // ========================================
    const agentInput: AgentInput = {
      workspaceId: input.workspaceId,
      fbPageId: input.fbPageId.toString(), // Passing as string for tool executor compatibility
      conversationId: input.conversationId,
      messageText: input.messageText || '',
      imageRecognitionResult: imageContext,
      conversationHistory: recentMessages,
      memorySummary,
      context: currentContext, // Agent tools will directly mutate properties of this object
      settings,
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
      
      // Mute the AI's output because LLMs invariably hallucinate their own confirmations
      // We only want the exact, strict transactional templates from the business owner.
      finalResponse = messages.orderConfirmed + 
                      (messages.paymentInstructions ? '\n\n' + messages.paymentInstructions : '');

      // Set the flag so the NEXT customer message (2 digits) is fast-pathed
      currentContext.metadata.awaitingPaymentDigits = true;
      currentContext.metadata.awaitingPaymentOrderId = currentContext.metadata.latestOrderId;
                      
      // Clear the volatile order metadata now that we've used it
      currentContext.metadata.latestOrderId = undefined;
      currentContext.metadata.latestOrderNumber = undefined;
      currentContext.metadata.latestOrderData = undefined;
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
    let productCard: ProductCard | undefined;
    if (pendingProducts && pendingProducts.length > 0) {
      console.log(`📦 Formatting ${pendingProducts.length} identified products as Facebook Generic Templates...`);
      
      const mappedProducts = pendingProducts.map((p: any) => {
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
          imageUrl: p.image_urls?.[0] || undefined,
          stock: p.stock_quantity ?? p.manual_stock,
          variations: {
            colors: availableColors,
            sizes: p.sizes || []
          }
        };
      });

      if (!input.isTestMode) {
        if (mappedProducts.length === 1) {
           await sendProductCard(input.pageId, input.customerPsid, mappedProducts[0]);
           productCard = mappedProducts[0];
        } else {
           await sendProductCarousel(input.pageId, input.customerPsid, mappedProducts);
        }
      }

      // Log the product card as a system message
      await supabase.from('messages').insert({
        conversation_id: input.conversationId,
        sender: 'bot',
        sender_type: 'bot',
        message_text: `[Sent Generic Template: ${mappedProducts.length} products]`,
        message_type: 'template',
      });

      // Clear the identified products so we don't resend them on next turn
      currentContext.metadata.identifiedProducts = undefined;
      await updateContextInDb(supabase, input.conversationId, finalStateToSave, currentContext);
    }

    if (agentResult.shouldFlag) {
      await flagForManualResponse(supabase, input.conversationId, "Agent self-flagged or encountered hallucination risk.");
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
      needs_manual_response: true,
      manual_flag_reason: reason,
      manual_flagged_at: new Date().toISOString(),
      state: 'MANUAL_REVIEW' // Used by UI
    })
    .eq('id', conversationId);
  console.log(`🚩 Conversation flagged for manual review: ${reason}`);
}
