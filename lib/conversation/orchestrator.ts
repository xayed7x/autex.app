/**
 * Orchestrator - Phase 3: Main Message Processing Controller
 * 
 * The Orchestrator is the central controller that coordinates all message processing.
 * It ties together the Fast Lane, AI Director, and execution logic into a cohesive system.
 * 
 * Flow:
 * 1. Load conversation context and history
 * 2. Handle image attachments (special case)
 * 3. Try Fast Lane (pattern matching)
 * 4. Fall back to AI Director (AI decision)
 * 5. Execute the decision
 * 6. Save state and send response
 */

import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';
import { ConversationContext, ConversationState, migrateLegacyContext } from '@/types/conversation';
import { tryFastLane } from './fast-lane';
import aiDirector, { AIDirectorDecision } from './ai-director';
import { sendMessage } from '@/lib/facebook/messenger';
import { generateOrderNumber } from './replies';
import { getCachedSettings, WorkspaceSettings, getDeliveryCharge } from '@/lib/workspace/settings-cache';

// ============================================
// TYPES
// ============================================

export interface ProcessMessageInput {
  /** Facebook Page ID */
  pageId: string;
  
  /** Customer PSID (Page-Scoped ID) */
  customerPsid: string;
  
  /** Message text (optional) */
  messageText?: string;
  
  /** Image URL (optional) */
  imageUrl?: string;
  
  /** Workspace ID */
  workspaceId: string;
  
  /** Facebook Page database ID */
  fbPageId: number;
  
  /** Conversation ID */
  conversationId: string;
}

export interface ProcessMessageResult {
  /** Response sent to user */
  response: string;
  
  /** New conversation state */
  newState: ConversationState;
  
  /** Updated context */
  updatedContext: ConversationContext;
  
  /** Whether an order was created */
  orderCreated?: boolean;
  
  /** Order number (if created) */
  orderNumber?: string;
}

// ============================================
// MAIN ORCHESTRATOR FUNCTION
// ============================================

/**
 * Main message processing orchestrator
 * 
 * This is the single entry point for all message processing.
 * The webhook should call this function for every incoming message.
 */
export async function processMessage(input: ProcessMessageInput): Promise<ProcessMessageResult> {
  const startTime = Date.now();
  
  console.log('\n🎭 ORCHESTRATOR STARTED');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Customer: ${input.customerPsid}`);
  console.log(`Message: "${input.messageText || '(image)'}"`);
  console.log(`Has Image: ${!!input.imageUrl}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  try {
    // ========================================
    // STEP 1: LOAD CONVERSATION DATA
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
    
    // Load workspace settings (with caching)
    const settings = await getCachedSettings(input.workspaceId);
    console.log(`⚙️ Loaded settings for: ${settings.businessName}`);
    
    // Load conversation
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', input.conversationId)
      .single();
    
    if (convError || !conversation) {
      throw new Error(`Failed to load conversation: ${convError?.message}`);
    }
    
    // Parse and migrate context
    let currentContext: ConversationContext = conversation.context as any || { state: 'IDLE', cart: [], checkout: {}, metadata: {} };
    
    // Migrate legacy context if needed
    if (!currentContext.cart || !currentContext.checkout || !currentContext.metadata) {
      console.log('🔄 Migrating legacy context...');
      currentContext = migrateLegacyContext(currentContext);
    }
    
    const currentState = conversation.current_state as ConversationState || 'IDLE';
    
    console.log(`📊 Current State: ${currentState}`);
    console.log(`📊 Cart Items: ${currentContext.cart.length}`);
    
    // Load recent conversation history (last 10 messages)
    const { data: recentMessages } = await supabase
      .from('messages')
      .select('sender, message_text, created_at')
      .eq('conversation_id', input.conversationId)
      .order('created_at', { ascending: false })
      .limit(10);
    
    const conversationHistory = (recentMessages || [])
      .reverse()
      .map((msg: any) => ({
        sender: msg.sender as 'customer' | 'bot',
        message: msg.message_text || '',
        timestamp: msg.created_at || '',
      }));
    
    // ========================================
    // STEP 2: HANDLE IMAGE ATTACHMENTS (SPECIAL CASE)
    // ========================================
    
    if (input.imageUrl) {
      console.log('🖼️ Image detected - calling image recognition...');
      
      const imageDecision = await handleImageMessage(
        input.imageUrl,
        currentState,
        currentContext,
        input.workspaceId,
        input.messageText
      );
      
      return await executeDecision(
        imageDecision,
        input,
        conversation,
        supabase,
        settings
      );
    }
    
    // ========================================
    // STEP 3: TRY FAST LANE (PATTERN MATCHING)
    // ========================================
    
    if (input.messageText) {
      console.log('⚡ Trying Fast Lane...');
      
      const fastLaneResult = tryFastLane(
        input.messageText,
        currentState,
        currentContext,
        settings
      );
      
      if (fastLaneResult.matched) {
        console.log(`✅ Fast Lane matched! Action: ${fastLaneResult.action}`);
        
        // Convert FastLaneResult to AIDirectorDecision format
        const decision: AIDirectorDecision = {
          action: fastLaneResult.action === 'CONFIRM' ? 'TRANSITION_STATE' :
                  fastLaneResult.action === 'DECLINE' ? 'RESET_CONVERSATION' :
                  fastLaneResult.action === 'COLLECT_NAME' ? 'UPDATE_CHECKOUT' :
                  fastLaneResult.action === 'COLLECT_PHONE' ? 'UPDATE_CHECKOUT' :
                  fastLaneResult.action === 'COLLECT_ADDRESS' ? 'UPDATE_CHECKOUT' :
                  fastLaneResult.action === 'GREETING' ? 'SEND_RESPONSE' :
                  'SEND_RESPONSE',
          response: fastLaneResult.response || '',
          newState: fastLaneResult.newState,
          updatedContext: fastLaneResult.updatedContext,
          confidence: 100,
          reasoning: 'Fast Lane pattern match',
        };
        
        // Special handling for order confirmation
        if (currentState === 'CONFIRMING_ORDER' && fastLaneResult.action === 'CONFIRM') {
          decision.action = 'CREATE_ORDER';
        }
        
        return await executeDecision(
          decision,
          input,
          conversation,
          supabase,
          settings
        );
      }
      
      console.log('⚠️ Fast Lane did not match - routing to AI Director...');
    }
    
    // ========================================
    // STEP 4: FALLBACK TO AI DIRECTOR (AI DECISION)
    // ========================================
    
    if (input.messageText) {
      console.log('🧠 Calling AI Director...');
      
      try {
        const decision = await aiDirector({
          userMessage: input.messageText,
          currentState,
          currentContext,
          workspaceId: input.workspaceId,
          settings,
          conversationHistory,
        });
        
        return await executeDecision(
          decision,
          input,
          conversation,
          supabase,
          settings
        );
      } catch (error) {
        console.error('❌ AI Director failed:', error);
        
        // Send user-friendly fallback message
        const fallbackMessage = "দুঃখিত, আমাদের একটা technical সমস্যা হয়েছে। একটু পরে আবার try করুন। 🙏";
        
        await sendMessage(
          input.pageId,
          input.customerPsid,
          fallbackMessage
        );
        
        // Log bot's fallback message
        await supabase.from('messages').insert({
          conversation_id: conversation.id,
          sender: 'bot',
          message_text: fallbackMessage,
          message_type: 'text',
          created_at: new Date().toISOString(),
        });
        
        console.log('✅ Sent fallback message to user');
        return {
          response: fallbackMessage,
          newState: currentState,
          updatedContext: currentContext
        };
      }
    }
    
    // ========================================
    // FALLBACK: NO TEXT AND NO IMAGE
    // ========================================
    
    console.log('⚠️ No text or image - sending help message');
    
    const fallbackDecision: AIDirectorDecision = {
      action: 'SHOW_HELP',
      response: '👋 Hi! Send me a product image or tell me what you\'re looking for!',
      confidence: 100,
    };
    
    return await executeDecision(
      fallbackDecision,
      input,
      conversation,
      supabase,
      settings
    );
    
  } catch (error) {
    console.error('❌ Orchestrator error:', error);
    
    // Send error message to user
    await sendMessage(
      input.pageId,
      input.customerPsid,
      'দুঃখিত! কিছু একটা সমস্যা হয়েছে। 😔 আবার চেষ্টা করুন।'
    );
    
    throw error;
  } finally {
    const duration = Date.now() - startTime;
    console.log(`\n⏱️ Orchestrator completed in ${duration}ms\n`);
  }
}

// ============================================
// DECISION EXECUTION
// ============================================

/**
 * Executes an AI Director decision
 * 
 * This function handles all 9 action types and performs the necessary
 * database operations and API calls.
 */
async function executeDecision(
  decision: AIDirectorDecision,
  input: ProcessMessageInput,
  conversation: any,
  supabase: any,
  settings: WorkspaceSettings
): Promise<ProcessMessageResult> {
  console.log(`\n🎬 EXECUTING DECISION: ${decision.action}`);
  console.log(`Confidence: ${decision.confidence}%`);
  if (decision.reasoning) {
    console.log(`Reasoning: ${decision.reasoning}`);
  }
  
  let response = decision.response;
  let newState = decision.newState || conversation.current_state;
  let updatedContext = { ...conversation.context, ...decision.updatedContext };
  let orderCreated = false;
  let orderNumber: string | undefined;
  
  // Execute action
  switch (decision.action) {
    case 'SEND_RESPONSE':
      // Just send the response (no state change)
      console.log('📤 Sending response...');
      break;
    
    case 'TRANSITION_STATE':
      // Change state
      console.log(`🔄 Transitioning state: ${conversation.current_state} → ${newState}`);
      break;
    
    case 'ADD_TO_CART':
      // Add product to cart
      console.log('🛒 Adding to cart...');
      if (decision.actionData?.productId) {
        const { addToCart } = await import('@/types/conversation');
        updatedContext.cart = addToCart(updatedContext.cart || [], {
          productId: decision.actionData.productId,
          productName: decision.actionData.productName || 'Product',
          productPrice: decision.actionData.productPrice || 0,
          quantity: decision.actionData.quantity || 1,
        });
      }
      break;
    
    case 'REMOVE_FROM_CART':
      // Remove product from cart
      console.log('🗑️ Removing from cart...');
      if (decision.actionData?.productId) {
        const { removeFromCart } = await import('@/types/conversation');
        updatedContext.cart = removeFromCart(
          updatedContext.cart || [],
          decision.actionData.productId
        );
      }
      break;
    
    case 'UPDATE_CHECKOUT':
      // Update checkout information
      console.log('📝 Updating checkout info...');
      if (decision.actionData) {
        // Calculate delivery charge based on address and settings
        let deliveryCharge = decision.actionData.deliveryCharge;
        if (decision.actionData.customerAddress) {
          deliveryCharge = getDeliveryCharge(decision.actionData.customerAddress, settings);
          console.log(`📦 Calculated delivery charge: ৳${deliveryCharge}`);
        }
        
        updatedContext.checkout = {
          ...updatedContext.checkout,
          customerName: decision.actionData.customerName || updatedContext.checkout?.customerName,
          customerPhone: decision.actionData.customerPhone || updatedContext.checkout?.customerPhone,
          customerAddress: decision.actionData.customerAddress || updatedContext.checkout?.customerAddress,
          deliveryCharge: deliveryCharge || updatedContext.checkout?.deliveryCharge,
          totalAmount: decision.actionData.totalAmount || updatedContext.checkout?.totalAmount,
        };
      }
      break;
    
    case 'CREATE_ORDER':
      // Create order in database
      console.log('📦 Creating order...');
      orderNumber = await createOrderInDb(
        supabase,
        input.workspaceId,
        input.fbPageId,
        input.conversationId,
        updatedContext
      );
      orderCreated = true;
      
      // Replace PENDING with actual order number in response
      response = response.replace('PENDING', orderNumber);
      
      // Add payment instructions if configured
      if (settings.paymentMessage) {
        response += '\n\n' + settings.paymentMessage;
      }
      
      // Reset cart and checkout after order
      updatedContext.cart = [];
      updatedContext.checkout = {};
      newState = 'IDLE';
      break;
    
    case 'SEARCH_PRODUCTS':
      // Search for products
      console.log('🔍 Searching products...');
      if (decision.actionData?.searchQuery) {
        const products = await searchProducts(
          decision.actionData.searchQuery,
          input.workspaceId,
          supabase
        );
        
        if (products.length === 0) {
          response = `Sorry, I couldn't find "${decision.actionData.searchQuery}" in our catalog. 😔\n\nTry sending me a photo or using different keywords!`;
        } else if (products.length === 1) {
          // Single product - add to context and transition to CONFIRMING_PRODUCT
          updatedContext.cart = [{
            productId: products[0].id,
            productName: products[0].name,
            productPrice: products[0].price,
            quantity: 1,
          }];
          newState = 'CONFIRMING_PRODUCT';
          response = `✅ Found: ${products[0].name}\n💰 Price: ৳${products[0].price}\n\nWould you like to order this? (YES/NO)`;
        } else {
          // Multiple products - send list
          response = `Found ${products.length} products:\n\n`;
          products.slice(0, 5).forEach((p, i) => {
            response += `${i + 1}. ${p.name} - ৳${p.price}\n`;
          });
          response += `\nSend me a photo or be more specific to narrow down the search!`;
        }
      }
      break;
    
    case 'SHOW_HELP':
      // Show help message
      console.log('❓ Showing help...');
      // Use custom greeting if available
      response = decision.response || settings.greeting || '👋 Hi! I can help you:\n\n🛍️ Find products (send photo or name)\n💰 Check prices\n📦 Place orders\n\nWhat would you like to do?';
      break;
    
    case 'RESET_CONVERSATION':
      // Reset to IDLE
      console.log('🔄 Resetting conversation...');
      newState = 'IDLE';
      updatedContext.cart = [];
      updatedContext.checkout = {};
      break;
    
    default:
      console.warn(`⚠️ Unknown action: ${decision.action}`);
  }
  
  // ========================================
  // SAVE STATE AND SEND RESPONSE
  // ========================================
  
  // Update conversation in database
  await updateContextInDb(
    supabase,
    input.conversationId,
    newState,
    updatedContext,
    updatedContext.checkout?.customerName || conversation.customer_name
  );
  
  // Send response to user
  await sendMessage(input.pageId, input.customerPsid, response);
  
  // Log bot message
  await supabase.from('messages').insert({
    conversation_id: input.conversationId,
    sender: 'bot',
    message_text: response,
    message_type: 'text',
  });
  
  console.log(`✅ Decision executed successfully`);
  
  return {
    response,
    newState,
    updatedContext,
    orderCreated,
    orderNumber,
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Handles image messages by calling image recognition
 */
async function handleImageMessage(
  imageUrl: string,
  currentState: ConversationState,
  currentContext: ConversationContext,
  workspaceId: string,
  messageText?: string
): Promise<AIDirectorDecision> {
  try {
    console.log('🖼️ Calling image recognition API...');
    
    // Call image recognition API
    const formData = new FormData();
    formData.append('imageUrl', imageUrl);
    formData.append('workspaceId', workspaceId);
    
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/image-recognition`, {
      method: 'POST',
      body: formData,
    });
    
    const imageRecognitionResult = await response.json();
    
    if (imageRecognitionResult.success && imageRecognitionResult.match) {
      const product = imageRecognitionResult.match.product;
      
      console.log(`✅ Product found: ${product.name}`);
      
      // Create decision to add product to cart and confirm
      return {
        action: 'ADD_TO_CART',
        response: `✅ Found: ${product.name}\n💰 Price: ৳${product.price}\n\nWould you like to order this? (YES/NO)`,
        newState: 'CONFIRMING_PRODUCT',
        updatedContext: {
          state: 'CONFIRMING_PRODUCT',
          cart: [{
            productId: product.id,
            productName: product.name,
            productPrice: product.price,
            quantity: 1,
          }],
          metadata: {
            ...currentContext.metadata,
            lastImageUrl: imageUrl,
            lastProductId: product.id,
          },
        },
        actionData: {
          productId: product.id,
          productName: product.name,
          productPrice: product.price,
          quantity: 1,
        },
        confidence: imageRecognitionResult.match.confidence,
        reasoning: `Image recognition (tier: ${imageRecognitionResult.match.tier})`,
      };
    } else {
      console.log('❌ Product not found in image');
      
      return {
        action: 'SEND_RESPONSE',
        response: 'Sorry, I couldn\'t recognize this product. 😔\n\nTry:\n📸 Taking a clearer photo\n💬 Telling me the product name\n\nExample: "Red Saree" or "Polo T-shirt"',
        confidence: 100,
        reasoning: 'Image recognition failed',
      };
    }
  } catch (error) {
    console.error('❌ Error in handleImageMessage:', error);
    
    return {
      action: 'SEND_RESPONSE',
      response: 'দুঃখিত! ছবি প্রসেস করতে সমস্যা হয়েছে। 😔 আবার চেষ্টা করুন।',
      confidence: 100,
      reasoning: 'Image processing error',
    };
  }
}

/**
 * Creates an order in the database
 */
async function createOrderInDb(
  supabase: any,
  workspaceId: string,
  fbPageId: number,
  conversationId: string,
  context: ConversationContext
): Promise<string> {
  console.log('📦 Creating order in database...');
  
  const orderNumber = generateOrderNumber();
  
  // Get product from cart (first item)
  const cartItem = context.cart[0];
  if (!cartItem) {
    throw new Error('No product in cart');
  }
  
  const orderData = {
    workspace_id: workspaceId,
    fb_page_id: fbPageId,
    conversation_id: conversationId,
    product_id: cartItem.productId,
    customer_name: context.checkout.customerName || context.customerName,
    customer_phone: context.checkout.customerPhone || context.customerPhone,
    customer_address: context.checkout.customerAddress || context.customerAddress,
    product_price: cartItem.productPrice,
    delivery_charge: context.checkout.deliveryCharge || context.deliveryCharge,
    total_amount: context.checkout.totalAmount || context.totalAmount,
    order_number: orderNumber,
    status: 'pending',
    payment_status: 'unpaid',
    quantity: cartItem.quantity,
  };
  
  const { error } = await supabase.from('orders').insert(orderData);
  
  if (error) {
    console.error('❌ Error creating order:', error);
    throw error;
  }
  
  console.log(`✅ Order created: ${orderNumber}`);
  return orderNumber;
}

/**
 * Updates conversation context in database
 */
async function updateContextInDb(
  supabase: any,
  conversationId: string,
  newState: ConversationState,
  updatedContext: ConversationContext,
  customerName?: string
): Promise<void> {
  console.log('💾 Updating conversation context...');
  
  const { error } = await supabase
    .from('conversations')
    .update({
      current_state: newState,
      context: updatedContext,
      customer_name: customerName,
      last_message_at: new Date().toISOString(),
    })
    .eq('id', conversationId);
  
  if (error) {
    console.error('❌ Error updating context:', error);
    throw error;
  }
  
  console.log('✅ Context updated');
}

/**
 * Searches for products by keywords
 */
async function searchProducts(
  query: string,
  workspaceId: string,
  supabase: any
): Promise<any[]> {
  console.log(`🔍 Searching for: "${query}"`);
  
  const { searchProductsByKeywords } = await import('@/lib/db/products');
  const products = await searchProductsByKeywords(query, workspaceId);
  
  console.log(`✅ Found ${products.length} products`);
  return products;
}
