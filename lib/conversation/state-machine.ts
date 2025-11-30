import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';
import { detectIntent, isDhaka, isValidPhone, normalizePhone, extractName } from './nlu';
import { Replies, generateOrderNumber } from './replies';

type Conversation = Database['public']['Tables']['conversations']['Row'];
type Product = Database['public']['Tables']['products']['Row'];

/**
 * Conversation states
 */
export type ConversationState =
  | 'IDLE'
  | 'CONFIRMING_PRODUCT'
  | 'COLLECTING_NAME'
  | 'COLLECTING_PHONE'
  | 'COLLECTING_ADDRESS'
  | 'CONFIRMING_ORDER';

/**
 * Conversation context stored in database
 */
export interface ConversationContext {
  state: ConversationState;
  productId?: string;
  productName?: string;
  productPrice?: number;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  deliveryCharge?: number;
  totalAmount?: number;
}

/**
 * Process message result
 */
export interface ProcessMessageResult {
  reply: string;
  newState: ConversationState;
  context: ConversationContext;
  action?: 'LEARN_HASH' | 'CREATE_ORDER';
  orderId?: string;
}

/**
 * Main state machine function - PURE LOGIC ONLY
 * Processes incoming messages and manages conversation flow
 * 
 * @param currentState - Current conversation state
 * @param currentContext - Current conversation context
 * @param workspaceId - Workspace ID (for context)
 * @param text - Message text (optional)
 * @param imageUrl - Image URL (optional)
 * @param imageRecognitionResult - Pre-fetched image recognition result (optional)
 * @returns Reply message and updated state
 */
export async function processMessage(
  currentState: ConversationState,
  currentContext: ConversationContext,
  workspaceId: string,
  text?: string,
  imageUrl?: string,
  imageRecognitionResult?: any
): Promise<ProcessMessageResult> {
  try {
    // DEBUG LOGGING
    console.log('\n========================================');
    console.log('📊 STATE MACHINE DEBUG');
    console.log('========================================');
    console.log(`Current State: ${currentState}`);
    console.log(`Incoming Text: "${text || '(no text)'}"`);
    console.log(`Image URL: ${imageUrl ? 'Present' : 'None'}`);
    console.log(`Image Recognition Result: ${imageRecognitionResult ? 'Present' : 'None'}`);
    console.log(`Context:`, JSON.stringify(currentContext, null, 2));
    console.log('========================================\n');

    // State machine logic
    switch (currentState) {
      case 'IDLE':
        return await handleIdleState(currentContext, text, imageUrl, imageRecognitionResult);

      case 'CONFIRMING_PRODUCT':
        return await handleConfirmingProductState(currentContext, text);

      case 'COLLECTING_NAME':
        return await handleCollectingNameState(currentContext, text);

      case 'COLLECTING_PHONE':
        return await handleCollectingPhoneState(currentContext, text);

      case 'COLLECTING_ADDRESS':
        return await handleCollectingAddressState(currentContext, text);

      case 'CONFIRMING_ORDER':
        return await handleConfirmingOrderState(currentContext, text);

      default:
        console.error(`❌ Unknown state: ${currentState}`);
        return {
          reply: Replies.ERROR(),
          newState: 'IDLE',
          context: { state: 'IDLE' },
        };
    }
  } catch (error) {
    console.error('❌ Error in processMessage:', error);
    return {
      reply: Replies.ERROR(),
      newState: 'IDLE',
      context: { state: 'IDLE' },
    };
  }
}

/**
 * IDLE State: Waiting for image or text
 */
async function handleIdleState(
  context: ConversationContext,
  text?: string,
  imageUrl?: string,
  imageRecognitionResult?: any
): Promise<ProcessMessageResult> {
  // If image recognition result is provided (image was sent)
  if (imageRecognitionResult) {
    console.log('🖼️ Processing image recognition result...');

    if (imageRecognitionResult.success && imageRecognitionResult.match) {
      const product = imageRecognitionResult.match.product;

      console.log(`✅ Product found: ${product.name}`);

      // Return product card template (unified response for both image and text search)
      return {
        reply: Replies.PRODUCT_FOUND({
          productName: product.name,
          price: product.price,
        }),
        newState: 'CONFIRMING_PRODUCT',
        context: {
          state: 'CONFIRMING_PRODUCT',
          productId: product.id,
          productName: product.name,
          productPrice: product.price,
        },
      };
    } else {
      console.log('❌ Product not found');
      return {
        reply: Replies.PRODUCT_NOT_FOUND(),
        newState: 'IDLE',
        context: { state: 'IDLE' },
      };
    }
  }

  // If text is provided, show help
  if (text) {
    const lowerText = text.toLowerCase();
    if (lowerText.includes('help') || lowerText.includes('সাহায্য')) {
      return {
        reply: Replies.HELP(),
        newState: 'IDLE',
        context: { state: 'IDLE' },
      };
    }

    return {
      reply: Replies.WELCOME(),
      newState: 'IDLE',
      context: { state: 'IDLE' },
    };
  }

  return {
    reply: Replies.WELCOME(),
    newState: 'IDLE',
    context: { state: 'IDLE' },
  };
}

/**
 * CONFIRMING_PRODUCT State: User confirming if they want to order
 */
async function handleConfirmingProductState(
  context: ConversationContext,
  text?: string
): Promise<ProcessMessageResult> {
  if (!text) {
    return {
      reply: 'আপনি কি এটি অর্ডার করতে চান? 🛍️\nYES লিখুন অর্ডার করতে।',
      newState: 'CONFIRMING_PRODUCT',
      context,
    };
  }

  const intent = detectIntent(text);

  if (intent === 'POSITIVE') {
    console.log('✅ User wants to order');
    return {
      reply: Replies.ASK_NAME(),
      newState: 'COLLECTING_NAME',
      context: {
        ...context,
        state: 'COLLECTING_NAME',
      },
      action: 'LEARN_HASH', // Signal to webhook router to save hash
    };
  } else if (intent === 'NEGATIVE') {
    console.log('❌ User declined order');
    return {
      reply: 'ঠিক আছে! 😊 অন্য কিছু দেখতে চাইলে জানাবেন।',
      newState: 'IDLE',
      context: { state: 'IDLE' },
    };
  } else {
    return {
      reply: 'অর্ডার করতে YES লিখুন। ✅',
      newState: 'CONFIRMING_PRODUCT',
      context,
    };
  }
}

/**
 * COLLECTING_NAME State: Collecting customer name
 */
async function handleCollectingNameState(
  context: ConversationContext,
  text?: string
): Promise<ProcessMessageResult> {
  console.log('👤 [COLLECTING_NAME] Current context:', JSON.stringify(context, null, 2));
  
  if (!text || text.trim().length < 2) {
    return {
      reply: 'আপনার নাম কী? 😊',
      newState: 'COLLECTING_NAME',
      context,
    };
  }

  // Check if this looks like a name or an interruption
  const lowerText = text.toLowerCase();
  const questionKeywords = ['how', 'what', 'when', 'where', 'why', 'কত', 'কি', 'কেন', 'কোথায়', 'delivery', 'price', 'cost', 'charge'];
  const hasQuestionKeyword = questionKeywords.some(word => lowerText.includes(word));
  
  if (hasQuestionKeyword || text.length > 50) {
    console.log('🔄 Possible interruption detected in COLLECTING_NAME');
    const interruption = await handleInterruption(text, 'COLLECTING_NAME');
    
    if (interruption) {
      return {
        reply: interruption + '\n\nNow, what is your name? 😊',
        newState: 'COLLECTING_NAME',
        context,
      };
    }
  }

  const customerName = extractName(text);
  console.log(`👤 [COLLECTING_NAME] Name collected: ${customerName}`);
  console.log(`👤 [COLLECTING_NAME] Raw input: "${text}"`);

  const newContext: ConversationContext = {
    ...context,
    state: 'COLLECTING_PHONE',
    customerName,
  };

  console.log('👤 [COLLECTING_NAME] New context:', JSON.stringify(newContext, null, 2));

  return {
    reply: Replies.ASK_PHONE({ name: customerName }),
    newState: 'COLLECTING_PHONE',
    context: newContext,
  };
}

/**
 * COLLECTING_PHONE State: Collecting and validating phone number
 */
async function handleCollectingPhoneState(
  context: ConversationContext,
  text?: string
): Promise<ProcessMessageResult> {
  if (!text) {
    return {
      reply: 'আপনার ফোন নম্বর দিন। 📱',
      newState: 'COLLECTING_PHONE',
      context,
    };
  }

  // ========================================
  // SMART INTERRUPTION CHECK
  // ========================================
  if (!isValidPhone(text)) {
    console.log('⚠️ Invalid phone number - checking for interruption...');
    
    // Check if this is an interruption (question) rather than a bad phone number
    const interruption = await handleInterruption(text, 'COLLECTING_PHONE');
    
    if (interruption) {
      // User asked a question - answer it and re-prompt
      return {
        reply: interruption + '\n\nNow, could I get your phone number please? 📱',
        newState: 'COLLECTING_PHONE',
        context,
      };
    }
    
    // Not an interruption, just invalid phone number
    return {
      reply: Replies.INVALID_PHONE(),
      newState: 'COLLECTING_PHONE',
      context,
    };
  }

  const customerPhone = normalizePhone(text);
  console.log(`📱 Phone collected: ${customerPhone}`);

  return {
    reply: Replies.ASK_ADDRESS(),
    newState: 'COLLECTING_ADDRESS',
    context: {
      ...context,
      state: 'COLLECTING_ADDRESS',
      customerPhone,
    },
  };
}

/**
 * COLLECTING_ADDRESS State: Collecting address and calculating delivery
 */
async function handleCollectingAddressState(
  context: ConversationContext,
  text?: string
): Promise<ProcessMessageResult> {
  if (!text || text.trim().length < 10) {
    // Check if short text is an interruption
    if (text && text.trim().length > 0) {
      const interruption = await handleInterruption(text, 'COLLECTING_ADDRESS');
      if (interruption) {
        return {
          reply: interruption + '\n\nNow, please provide your full address. 📍\nExample: বাড়ি নং, রোড, এলাকা, জেলা',
          newState: 'COLLECTING_ADDRESS',
          context,
        };
      }
    }
    
    return {
      reply: 'সম্পূর্ণ ঠিকানা দিন। 📍\nExample: বাড়ি নং, রোড, এলাকা, জেলা',
      newState: 'COLLECTING_ADDRESS',
      context,
    };
  }

  const customerAddress = text.trim();
  const deliveryCharge = isDhaka(customerAddress) ? 60 : 120;
  const totalAmount = (context.productPrice || 0) + deliveryCharge;

  console.log(`📍 Address collected: ${customerAddress}`);
  console.log(`🚚 Delivery charge: ${deliveryCharge}`);

  return {
    reply: Replies.ORDER_SUMMARY({
      name: context.customerName,
      productName: context.productName,
      price: context.productPrice,
      deliveryCharge,
      totalAmount,
      address: customerAddress,
    }),
    newState: 'CONFIRMING_ORDER',
    context: {
      ...context,
      state: 'CONFIRMING_ORDER',
      customerAddress,
      deliveryCharge,
      totalAmount,
    },
  };
}

/**
 * CONFIRMING_ORDER State: Final confirmation
 * Note: Order creation happens in the webhook router
 */
async function handleConfirmingOrderState(
  context: ConversationContext,
  text?: string
): Promise<ProcessMessageResult> {
  console.log('📦 [CONFIRMING_ORDER] Current context:', JSON.stringify(context, null, 2));
  
  if (!text) {
    return {
      reply: 'Confirm করতে YES লিখুন। ✅',
      newState: 'CONFIRMING_ORDER',
      context,
    };
  }

  const intent = detectIntent(text);
  console.log(`📦 [CONFIRMING_ORDER] User intent: ${intent}`);

  if (intent === 'POSITIVE') {
    console.log('✅ User confirmed order');
    console.log('📦 [CONFIRMING_ORDER] CONTEXT BEFORE CREATING ORDER:', {
      customerName: context.customerName,
      customerPhone: context.customerPhone,
      customerAddress: context.customerAddress,
      productId: context.productId,
      productName: context.productName,
      productPrice: context.productPrice,
      deliveryCharge: context.deliveryCharge,
      totalAmount: context.totalAmount,
    });

    // CRITICAL: Pass the full context with customer data to webhook router
    // The webhook router will use this context to create the order
    return {
      reply: Replies.ORDER_CONFIRMED({
        orderId: 'PENDING', // Will be replaced by webhook router
        name: context.customerName,
        deliveryCharge: context.deliveryCharge,
      }),
      newState: 'IDLE',
      context: {
        ...context, // Preserve all customer data for order creation
        state: 'IDLE', // Update state to IDLE
      },
      action: 'CREATE_ORDER', // Signal to webhook router to create order
    };
  } else if (intent === 'NEGATIVE') {
    console.log('❌ User cancelled order');
    return {
      reply: Replies.ORDER_CANCELLED(),
      newState: 'IDLE',
      context: { state: 'IDLE' },
    };
  } else {
    return {
      reply: 'Order confirm করতে YES লিখুন। ✅',
      newState: 'CONFIRMING_ORDER',
      context,
    };
  }
}

/**
 * Handles interruptions during the order flow
 * Detects if user is asking a question instead of providing expected data
 * 
 * SMART DETECTION: Uses keyword pre-checking before AI fallback
 * 
 * @param text - User's message
 * @param currentState - Current conversation state
 * @returns Response to the interruption, or null if not an interruption
 */
async function handleInterruption(
  text: string,
  currentState: ConversationState
): Promise<string | null> {
  try {
    console.log(`🔍 [INTERRUPTION] Checking for interruption in state: ${currentState}`);
    console.log(`🔍 [INTERRUPTION] Input text: "${text}"`);
    
    const lowerText = text.toLowerCase().trim();
    
    // ========================================
    // SMART PRE-CHECK: Common question keywords
    // This catches questions like "delivery charge?" without needing AI
    // ========================================
    
    // Check for delivery-related questions
    const deliveryKeywords = ['delivery', 'ডেলিভারি', 'পৌঁছাবে', 'charge', 'চার্জ', 'shipping', 'কত দিন'];
    const hasDeliveryKeyword = deliveryKeywords.some(keyword => lowerText.includes(keyword));
    
    if (hasDeliveryKeyword) {
      console.log('🔍 [INTERRUPTION] Delivery question detected via keywords');
      return '🚚 Delivery Information:\n' +
             '• Inside Dhaka: ৳60\n' +
             '• Outside Dhaka: ৳120\n' +
             '• Delivery time: 3-5 business days';
    }
    
    // Check for price-related questions
    const priceKeywords = ['price', 'cost', 'কত', 'দাম', 'টাকা', 'how much', 'কত টাকা'];
    const hasPriceKeyword = priceKeywords.some(keyword => lowerText.includes(keyword));
    
    if (hasPriceKeyword) {
      console.log('🔍 [INTERRUPTION] Price question detected via keywords');
      return '💰 Our prices vary by product. You can see the price in the product card I sent earlier!';
    }
    
    // Check for payment-related questions
    const paymentKeywords = ['payment', 'পেমেন্ট', 'pay', 'কিভাবে', 'how to pay'];
    const hasPaymentKeyword = paymentKeywords.some(keyword => lowerText.includes(keyword));
    
    if (hasPaymentKeyword) {
      console.log('🔍 [INTERRUPTION] Payment question detected via keywords');
      return '💳 Payment Methods:\n' +
             '• Cash on Delivery (COD)\n' +
             '• bKash/Nagad\n' +
             '• Bank Transfer\n\n' +
             'You can choose your preferred method after placing the order.';
    }
    
    // Check for return/exchange questions
    const returnKeywords = ['return', 'exchange', 'ফেরত', 'বদল'];
    const hasReturnKeyword = returnKeywords.some(keyword => lowerText.includes(keyword));
    
    if (hasReturnKeyword) {
      console.log('🔍 [INTERRUPTION] Return policy question detected via keywords');
      return '🔄 Return Policy:\n' +
             '• 7-day return policy\n' +
             '• Product must be unused\n' +
             '• Original packaging required\n\n' +
             'Contact us within 7 days of delivery for returns.';
    }
    
    // Check for size questions
    const sizeKeywords = ['size', 'সাইজ', 'মাপ'];
    const hasSizeKeyword = sizeKeywords.some(keyword => lowerText.includes(keyword));
    
    if (hasSizeKeyword) {
      console.log('🔍 [INTERRUPTION] Size question detected via keywords');
      return '📏 Size Information:\n' +
             'We have various sizes available. Please check the product description for specific size details.\n' +
             'If you need help with sizing, contact us after placing your order!';
    }
    
    // ========================================
    // FALLBACK: Use AI intent detection
    // Only called if keyword check didn't match
    // ========================================
    console.log('🔍 [INTERRUPTION] No keyword match, using AI intent detection...');
    
    // Import the hybrid intent detector
    const { detectUserIntent } = await import('@/lib/conversation/intent-detector');
    
    // Detect intent
    const intentResult = await detectUserIntent(text);
    console.log(`🧠 [INTERRUPTION] AI detected intent: ${intentResult.intent}`);
    
    // Handle different types of interruptions
    switch (intentResult.intent) {
      case 'price_query':
        return '💰 Our prices vary by product. You can see the price in the product card I sent earlier!';
      
      case 'general_query':
        // Generic general query response
        return '❓ I\'d be happy to help with that!\n\n' +
               'Common questions:\n' +
               '🚚 Delivery: 60tk (Dhaka), 120tk (Outside)\n' +
               '💳 Payment: COD, bKash, Nagad\n' +
               '🔄 Returns: 7-day policy\n\n' +
               'Let\'s complete your order first, then I can answer any other questions!';
      
      case 'order_status':
        return '📦 You haven\'t placed an order yet! Let\'s complete this order first, then you can track it. 😊';
      
      case 'greeting':
        return '👋 Hello! Let\'s continue with your order.';
      
      case 'product_search':
        return '🛍️ I see you\'re interested in other products! Let\'s complete this order first, then I can help you find more items. 😊';
      
      // If intent is unknown or POSITIVE/NEGATIVE, it's not an interruption
      case 'unknown':
      case 'UNKNOWN':
      case 'POSITIVE':
      case 'NEGATIVE':
        return null;
      
      default:
        return null;
    }
  } catch (error) {
    console.error('❌ Error handling interruption:', error);
    return null;
  }
}

/**
 * Updates conversation in database with new state and context
 * NOTE: This function is kept for backward compatibility but should be called from webhook router
 */
export async function updateConversation(
  workspaceId: string,
  fbPageId: number,
  customerPsid: string,
  customerName: string | null,
  newState: ConversationState,
  context: ConversationContext
): Promise<void> {
  // CRITICAL: Use Service Role Key to bypass RLS
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

  try {
    console.log('\n💾 UPDATING CONVERSATION STATE');
    console.log('========================================');
    console.log(`Workspace ID: ${workspaceId}`);
    console.log(`FB Page ID: ${fbPageId}`);
    console.log(`Customer PSID: ${customerPsid}`);
    console.log(`New State: ${newState}`);
    console.log(`Customer Name: ${customerName || '(none)'}`);
    console.log(`Context:`, JSON.stringify(context, null, 2));
    console.log('========================================');

    const { data, error } = await supabase
      .from('conversations')
      .upsert({
        workspace_id: workspaceId,
        fb_page_id: fbPageId,
        customer_psid: customerPsid,
        customer_name: customerName,
        current_state: newState,
        context: context as any,
        last_message_at: new Date().toISOString(),
      }, {
        onConflict: 'fb_page_id,customer_psid',
        ignoreDuplicates: false,
      })
      .select();

    if (error) {
      console.error('❌ DB UPDATE FAILED:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      throw error;
    }

    console.log('✅ Conversation state updated successfully');
    console.log('Updated data:', JSON.stringify(data, null, 2));
    console.log('========================================\n');
  } catch (error) {
    console.error('❌ CRITICAL: Error updating conversation:', error);
    // Don't throw - we don't want to break the message flow
    // But log it prominently so we can debug
  }
}
