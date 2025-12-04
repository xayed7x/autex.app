/**
 * AI Director - Phase 1: Fast Lane Router
 * 
 * The Fast Lane is a pattern-matching system that handles common,
 * predictable user inputs WITHOUT calling the AI. This dramatically
 * reduces latency and API costs for routine interactions.
 * 
 * Patterns handled:
 * - Confirmation (Yes/No)
 * - Phone numbers
 * - Simple names
 * - Addresses
 * - Greetings
 */

import { ConversationContext, ConversationState, CartItem } from '@/types/conversation';
import { WorkspaceSettings } from '@/lib/workspace/settings';
import { Replies } from './replies';
import { getInterruptionType, isDetailsRequest, isOrderIntent } from './keywords';

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Formats product details from context for display
 * Used when customer asks about product (price, size, color, stock, etc.)
 */
function getProductDetailsResponse(context: ConversationContext, emoji: boolean = true): string | null {
  // Check if there's a product in cart
  const product = context.cart && context.cart.length > 0 ? context.cart[0] : null;
  
  if (!product) {
    return null;
  }
  
  const productAny = product as any; // Cast to any to access additional properties
  const parts: string[] = [];
  
  // Product name and price
  parts.push(`${emoji ? '📦' : ''} **${product.productName}**`);
  parts.push(`${emoji ? '💰' : ''} Price: ৳${product.productPrice}`);
  
  // Description if available
  if (productAny.description) {
    parts.push(`\n${productAny.description}`);
  }
  
  // Stock info if available
  if (productAny.stock !== undefined) {
    const stockText = productAny.stock > 0 
      ? `${emoji ? '✅' : ''} In Stock (${productAny.stock} available)`
      : `${emoji ? '❌' : ''} Out of Stock`;
    parts.push(`\n${stockText}`);
  }
  
  // Sizes if available
  if (productAny.sizes && productAny.sizes.length > 0) {
    parts.push(`\n${emoji ? '📏' : ''} Sizes: ${productAny.sizes.join(', ')}`);
  }
  
  // Colors if available
  if (productAny.colors && productAny.colors.length > 0) {
    parts.push(`\n${emoji ? '🎨' : ''} Colors: ${productAny.colors.join(', ')}`);
  }
  
  return parts.join('\n');
}

// ============================================
// TYPES
// ============================================

export interface FastLaneResult {
  /** Whether the fast lane matched this input */
  matched: boolean;
  
  /** Action to take (if matched) */
  action?: 'CONFIRM' | 'DECLINE' | 'COLLECT_NAME' | 'COLLECT_PHONE' | 'COLLECT_ADDRESS' | 'GREETING' | 'CREATE_ORDER';
  
  /** Response message (if matched) */
  response?: string;
  
  /** Updated context (if matched) */
  updatedContext?: Partial<ConversationContext>;
  
  /** New state (if matched) */
  newState?: ConversationState;
  
  /** Extracted data (if any) */
  extractedData?: {
    name?: string;
    phone?: string;
    address?: string;
  };
}

// ============================================
// REGEX PATTERNS
// ============================================

// Phone number patterns (Bangladesh)
const PHONE_PATTERNS = [
  /^01[3-9]\d{8}$/,           // 01XXXXXXXXX
  /^\+8801[3-9]\d{8}$/,       // +8801XXXXXXXXX
  /^8801[3-9]\d{8}$/,         // 8801XXXXXXXXX
  /^01[3-9]\s?\d{4}\s?\d{4}$/, // 01X XXXX XXXX
];

// Confirmation patterns - COMPREHENSIVE Bangla/Banglish support
const YES_PATTERNS = [
  // English confirmations
  /^(yes|yep|yeah|yup|sure|ok|okay|y)$/i,
  
  // Bangla phonetic (Banglish) - Single words
  /^(ji|jii|hae|haan|ha|hum|humm)$/i,
  
  // Bangla Unicode - Single words
  /^(হ্যাঁ|জি|ঠিক আছে|আছে|হুম|হবে)$/i,
  
  // ORDER-RELATED Banglish phrases (most common)
  /^(order korbo|order koro|order dibo|order dao|order chai)$/i,
  /^(nibo|nebo|kinbo|keno|kinte chai)$/i,
  /^(chai|chae|lagbe|hobe)$/i,
  /^(confirm|confirmed|confirm koro|confirm korbo)$/i,
  
  // ORDER-RELATED Bangla Unicode
  /^(অর্ডার করব|অর্ডার করবো|অর্ডার দিব|অর্ডার দাও|অর্ডার চাই)$/i,
  /^(নিব|নেব|নিবো|কিনব|কিনবো|কিনতে চাই)$/i,
  /^(চাই|লাগবে|হবে)$/i,
  
  // Partial matches for common phrases (contains)
  /order\s*korbo/i,
  /order\s*chai/i,
  /nite\s*chai/i,
  /kinte\s*chai/i,
];

const NO_PATTERNS = [
  /^(no|nope|nah|n)$/i,
  /^(na|nai|nahi)$/i,
  /^(না|নাই|নাহ|ভুল|বাতিল)$/i,
];

// Name patterns (simple heuristic)
const NAME_PATTERN = /^[a-zA-Z\u0980-\u09FF\s]{2,50}$/; // 2-50 chars, letters and spaces only

// Greeting patterns
const GREETING_PATTERNS = [
  /^(hi|hello|hey|greetings)$/i,
  /^(assalamualaikum|salam|salaam)$/i,
  /^(হাই|হ্যালো|আসসালামু আলাইকুম)$/i,
];

// ============================================
// MAIN FAST LANE FUNCTION
// ============================================

/**
 * Tries to handle the user input using fast pattern matching.
 * Returns a result indicating whether it matched and what action to take.
 * 
 * This is a PURE function - no side effects, no API calls, no database access.
 * 
 * @param input - User's text input
 * @param currentState - Current conversation state
 * @param currentContext - Current conversation context
 * @returns FastLaneResult indicating match status and action
 */
export function tryFastLane(
  input: string,
  currentState: ConversationState,
  currentContext: ConversationContext,
  settings?: WorkspaceSettings
): FastLaneResult {
  const trimmedInput = input.trim();
  
  // Empty input - no match
  if (!trimmedInput) {
    return { matched: false };
  }
  
  // ============================================
  // PATTERN 1: GREETINGS (any state)
  // ============================================
  if (GREETING_PATTERNS.some(pattern => pattern.test(trimmedInput))) {
    const emoji = settings?.useEmojis ? '👋 ' : '';
    const greeting = settings?.greeting || `${emoji}স্বাগতম! আমাদের দোকানে আপনাকে স্বাগতম!\n\nশুরু করতে product এর ছবি পাঠান, অথবা "help" লিখুন।`;
    
    return {
      matched: true,
      action: 'GREETING',
      response: greeting,
      newState: 'IDLE',
      updatedContext: {
        state: 'IDLE',
      },
    };
  }
  
  // ============================================
  // STATE-SPECIFIC PATTERNS
  // ============================================
  
  switch (currentState) {
    case 'CONFIRMING_PRODUCT':
      return handleConfirmingProduct(trimmedInput, currentContext, settings);
    
    case 'COLLECTING_NAME':
      return handleCollectingName(trimmedInput, currentContext, settings);
    
    case 'COLLECTING_PHONE':
      return handleCollectingPhone(trimmedInput, currentContext, settings);
    
    case 'COLLECTING_ADDRESS':
      return handleCollectingAddress(trimmedInput, currentContext, settings);
    
    case 'CONFIRMING_ORDER':
      return handleConfirmingOrder(trimmedInput, currentContext, settings);

    case 'COLLECTING_PAYMENT_DIGITS':
      return handleCollectingPaymentDigits(trimmedInput, currentContext, settings);
    
    case 'AWAITING_CUSTOMER_DETAILS':  // NEW: Quick form state
      return handleAwaitingCustomerDetails(trimmedInput, currentContext, settings);
    
    default:
      return { matched: false };
  }
}

// ============================================
// STATE HANDLERS
// ============================================

/**
 * Handles CONFIRMING_PRODUCT state (Yes/No for product confirmation)
 */
function handleConfirmingProduct(
  input: string,
  context: ConversationContext,
  settings?: WorkspaceSettings
): FastLaneResult {
  const emoji = settings?.useEmojis ?? true;
  
  // Check for interruptions/product questions FIRST (before YES/NO)
  const interruptionType = getInterruptionType(input);
  
  if (interruptionType) {
    let interruptionResponse = '';
    
    switch (interruptionType) {
      case 'delivery':
        interruptionResponse = settings?.fastLaneMessages?.deliveryInfo ||
          `🚚 Delivery Information:\n• ঢাকার মধ্যে: ৳${settings?.deliveryCharges?.insideDhaka || 60}\n• ঢাকার বাইরে: ৳${settings?.deliveryCharges?.outsideDhaka || 120}`;
        break;
      case 'payment':
        interruptionResponse = settings?.fastLaneMessages?.paymentInfo ||
          `💳 Payment Methods: bKash, Nagad, COD`;
        break;
      case 'return':
        interruptionResponse = settings?.fastLaneMessages?.returnPolicy ||
          `🔄 ২ দিনের মধ্যে ফেরত।`;
        break;
      case 'urgency':
        interruptionResponse = settings?.fastLaneMessages?.urgencyResponse ||
          `🚀 চিন্তার কারণ নেই! আমরা দ্রুত ডেলিভারি নিশ্চিত করি।\nঢাকার মধ্যে ২-৩ দিন এবং বাইরে ৩-৫ দিনের মধ্যে পেয়ে যাবেন।`;
        break;
      case 'objection':
        interruptionResponse = settings?.fastLaneMessages?.objectionResponse ||
          `✨ আমাদের প্রতিটি পণ্য ১০০% অথেনটিক এবং হাই কোয়ালিটি।\nআপনি নিশ্চিন্তে অর্ডার করতে পারেন, পছন্দ না হলে রিটার্ন করার সুযোগ তো থাকছেই!`;
        break;
      case 'seller':
        interruptionResponse = settings?.fastLaneMessages?.sellerInfo ||
          `🏢 আমাদের অফিস মিরপুর, ঢাকা।\n📞 প্রয়োজনে কল করুন: 01915969330\n⏰ আমরা প্রতিদিন সকাল ১০টা থেকে রাত ১০টা পর্যন্ত খোলা আছি।`;
        break;
      case 'price':
      case 'size':
        const productDetails = getProductDetailsResponse(context, emoji);
        interruptionResponse = productDetails || `Product details: Check the card above`;
        break;
    }
    
    const rePrompt = `\n\nএই product চান? (YES/NO)`;
    const finalResponse = interruptionResponse + rePrompt;
    
    return {
      matched: true,
      action: 'CONFIRM',
      response: emoji ? finalResponse : finalResponse.replace(/[🎉😊📱📍✅🚚💳🔄📦💰📏🎨❌]/g, ''),
      newState: 'CONFIRMING_PRODUCT',
      updatedContext: {
        ...context,
        state: 'CONFIRMING_PRODUCT',
      },
    };
  }
  
  // Check for product details request (details, colors, etc.)
  if (isDetailsRequest(input)) {
    const productDetails = getProductDetailsResponse(context, emoji);
    if (productDetails) {
      const rePrompt = `\n\nএই product চান? (YES/NO)`;
      return {
        matched: true,
        action: 'CONFIRM',
        response: emoji ? (productDetails + rePrompt) : (productDetails + rePrompt).replace(/[🎉😊📱📍✅🚚💳🔄📦💰📏🎨❌]/g, ''),
        newState: 'CONFIRMING_PRODUCT',
        updatedContext: {
          ...context,
          state: 'CONFIRMING_PRODUCT',
        },
      };
    }
  }
  
  // Check for YES
  if (YES_PATTERNS.some(pattern => pattern.test(input))) {
    // Debug: Log the order collection style being used
    console.log(`🔍 [ORDER_COLLECTION] Style: ${settings?.order_collection_style || 'undefined'}`);
    console.log(`🔍 [ORDER_COLLECTION] Settings object:`, settings ? 'exists' : 'null');
    
    // Fork based on order collection style
    if (settings?.order_collection_style === 'quick_form') {
      console.log('✅ [QUICK_FORM] Activating quick form mode!');
      // Quick Form: Ask for all details in one message
      const message = settings.quick_form_prompt || 
        'দারুণ! অর্ডারটি সম্পন্ন করতে, অনুগ্রহ করে নিচের ফর্ম্যাট অনুযায়ী আপনার তথ্য দিন:\n\nনাম:\nফোন:\nসম্পূর্ণ ঠিকানা:';
      
      return {
        matched: true,
        action: 'CONFIRM',
        response: emoji ? message : message.replace(/[🎉😊📱📍✅]/g, ''),
        newState: 'AWAITING_CUSTOMER_DETAILS',
        updatedContext: {
          ...context,
          state: 'AWAITING_CUSTOMER_DETAILS',
        },
      };
    } else {
      console.log('ℹ️ [CONVERSATIONAL] Using conversational flow (default)');
      // Conversational: Sequential collection
      const message = settings?.fastLaneMessages?.productConfirm || 
        `${emoji ? 'দারুণ! 🎉' : 'দারুণ!'}\n\nআপনার সম্পূর্ণ নামটি বলবেন?\n(Example: Zayed Bin Hamid)`;
      
      return {
        matched: true,
        action: 'CONFIRM',
        response: emoji ? message : message.replace(/[🎉😊📱📍✅]/g, ''),
        newState: 'COLLECTING_NAME',
        updatedContext: {
          ...context,
          state: 'COLLECTING_NAME',
        },
      };
    }
  }
  
  // Check for NO
  if (NO_PATTERNS.some(pattern => pattern.test(input))) {
    const message = settings?.fastLaneMessages?.productDecline ||
      `কোনো সমস্যা নেই! ${emoji ? '😊' : ''}\n\nঅন্য product এর ছবি পাঠান অথবা "help" লিখুন।`;
    
    return {
      matched: true,
      action: 'DECLINE',
      response: emoji ? message : message.replace(/[🎉😊📱📍✅]/g, ''),
      newState: 'IDLE',
      updatedContext: {
        state: 'IDLE',
        cart: [],
        checkout: {},
      },
    };
  }
  
  return { matched: false };
}

/**
 * Handles COLLECTING_NAME state (simple name validation)
 */
function handleCollectingName(
  input: string,
  context: ConversationContext,
  settings?: WorkspaceSettings
): FastLaneResult {
  const emoji = settings?.useEmojis ?? true;
  
  // Check for interruptions first
  const interruptionType = getInterruptionType(input);
  
  if (interruptionType) {
    let interruptionResponse = '';
    
    switch (interruptionType) {
      case 'delivery':
        interruptionResponse = settings?.fastLaneMessages?.deliveryInfo ||
          `🚚 Delivery Information:\n• ঢাকার মধ্যে: ৳${settings?.deliveryCharges?.insideDhaka || 60}\n• ঢাকার বাইরে: ৳${settings?.deliveryCharges?.outsideDhaka || 120}`;
        break;
      case 'payment':
        interruptionResponse = settings?.fastLaneMessages?.paymentInfo ||
          `💳 Payment Methods:\nআমরা payment methods গ্রহণ করি: bKash, Nagad, COD`;
        break;
      case 'return':
        interruptionResponse = settings?.fastLaneMessages?.returnPolicy ||
          `🔄 Return Policy:\nপণ্য হাতে পাওয়ার পর ২ দিনের মধ্যে ফেরত দিতে পারবেন।`;
        break;
      case 'urgency':
        interruptionResponse = settings?.fastLaneMessages?.urgencyResponse ||
          `🚀 চিন্তার কারণ নেই! আমরা দ্রুত ডেলিভারি নিশ্চিত করি।\nঢাকার মধ্যে ২-৩ দিন এবং বাইরে ৩-৫ দিনের মধ্যে পেয়ে যাবেন।`;
        break;
      case 'objection':
        interruptionResponse = settings?.fastLaneMessages?.objectionResponse ||
          `✨ আমাদের প্রতিটি পণ্য ১০০% অথেনটিক এবং হাই কোয়ালিটি।\nআপনি নিশ্চিন্তে অর্ডার করতে পারেন, পছন্দ না হলে রিটার্ন করার সুযোগ তো থাকছেই!`;
        break;
      case 'seller':
        interruptionResponse = settings?.fastLaneMessages?.sellerInfo ||
          `🏢 আমাদের অফিস মিরপুর, ঢাকা।\n📞 প্রয়োজনে কল করুন: 01915969330\n⏰ আমরা প্রতিদিন সকাল ১০টা থেকে রাত ১০টা পর্যন্ত খোলা আছি।`;
        break;
      case 'price':
      case 'size':
        const productDetails = getProductDetailsResponse(context, emoji);
        interruptionResponse = productDetails || `আপনি product এর details product card এ দেখতে পাবেন।`;
        break;
    }
    
    const rePrompt = `আপনার সম্পূর্ণ নামটি বলবেন? (Example: Zayed Bin Hamid)`;
    const finalResponse = interruptionResponse + '\n\n' + rePrompt;
    
    return {
      matched: true,
      action: 'CONFIRM',
      response: emoji ? finalResponse : finalResponse.replace(/[🎉😊📱📍✅🚚💳🔄📦💰📏🎨❌]/g, ''),
      newState: 'COLLECTING_NAME',
      updatedContext: { state: 'COLLECTING_NAME' },
    };
  }
  
  // Check for product details request
  if (isDetailsRequest(input)) {
    const productDetails = getProductDetailsResponse(context, emoji);
    if (productDetails) {
      const rePrompt = `আপনার সম্পূর্ণ নামটি বলবেন?`;
      return {
        matched: true,
        action: 'CONFIRM',
        response: emoji ? (productDetails + '\n\n' + rePrompt) : (productDetails + '\n\n' + rePrompt).replace(/[🎉😊📱📍✅🚚💳🔄📦💰📏🎨❌]/g, ''),
        newState: 'COLLECTING_NAME',
        updatedContext: { state: 'COLLECTING_NAME' },
      };
    }
  }
  
  // Check for order intent
  if (isOrderIntent(input)) {
    const message = `আপনি ইতিমধ্যে অর্ডার করছেন! আপনার সম্পূর্ণ নামটি বলবেন?`;
    return {
      matched: true,
      action: 'CONFIRM',
      response: message,
      newState: 'COLLECTING_NAME',
      updatedContext: { state: 'COLLECTING_NAME' },
    };
  }
  
  // Check if input looks like a name
  if (NAME_PATTERN.test(input)) {
    const name = capitalizeWords(input);
    const message = settings?.fastLaneMessages?.nameCollected ||
      `আপনার সাথে পরিচিত হয়ে ভালো লাগলো, {name}! ${emoji ? '😊' : ''}\n\nএখন আপনার ফোন নম্বর দিন। ${emoji ? '📱' : ''}\n(Example: 01712345678)`;
    
    // Replace {name} placeholder
    const finalMessage = message.replace(/{name}/g, name);
    
    return {
      matched: true,
      action: 'COLLECT_NAME',
      response: emoji ? finalMessage : finalMessage.replace(/[🎉😊📱📍✅]/g, ''),
      newState: 'COLLECTING_PHONE',
      updatedContext: {
        state: 'COLLECTING_PHONE',
        checkout: {
          ...context.checkout,
          customerName: name,
        },
        // Legacy field for backward compatibility
        customerName: name,
      },
      extractedData: {
        name,
      },
    };
  }
  
  return { matched: false };
}

/**
 * Handles COLLECTING_PHONE state (phone number validation + interruption handling)
 */
function handleCollectingPhone(
  input: string,
  context: ConversationContext,
  settings?: WorkspaceSettings
): FastLaneResult {
  const emoji = settings?.useEmojis ?? true;
  
  // Remove spaces and check against patterns
  const cleanedInput = input.replace(/\s/g, '');
  
  // Check if input is a valid phone number
  for (const pattern of PHONE_PATTERNS) {
    if (pattern.test(cleanedInput)) {
      // Normalize to 01XXXXXXXXX format
      const normalizedPhone = normalizePhone(cleanedInput);
      const message = settings?.fastLaneMessages?.phoneCollected ||
        `পেয়েছি! ${emoji ? '📱' : ''}\n\nএখন আপনার ডেলিভারি ঠিকানাটি দিন। ${emoji ? '📍' : ''}\n(Example: House 123, Road 4, Dhanmondi, Dhaka)`;
      
      return {
        matched: true,
        action: 'COLLECT_PHONE',
        response: emoji ? message : message.replace(/[🎉😊📱📍✅]/g, ''),
        newState: 'COLLECTING_ADDRESS', // FIXED: Was COLLECTING_PHONE
        updatedContext: {
          state: 'COLLECTING_ADDRESS',
          checkout: {
            ...context.checkout,
            customerPhone: normalizedPhone,
          },
          // Legacy field for backward compatibility
          customerPhone: normalizedPhone,
        },
        extractedData: {
          phone: normalizedPhone,
        },
      };
    }
  }
  
  // NOT a valid phone - check if it's an interruption (question)
  const interruptionType = getInterruptionType(input);
  
  if (interruptionType) {
    // Customer asked a question - answer it with dynamic message from settings
    let interruptionResponse = '';
    
    switch (interruptionType) {
      case 'delivery':
        interruptionResponse = settings?.fastLaneMessages?.deliveryInfo ||
          `🚚 Delivery Information:\n• ঢাকার মধ্যে: ৳${settings?.deliveryCharges?.insideDhaka || 60}\n• ঢাকার বাইরে: ৳${settings?.deliveryCharges?.outsideDhaka || 120}\n• Delivery সময়: ${settings?.deliveryTime || '3-5 business days'}`;
        break;
      
      case 'payment':
        interruptionResponse = settings?.fastLaneMessages?.paymentInfo ||
          `💳 Payment Methods:\nআমরা নিম্নলিখিত payment methods গ্রহণ করি:\n\n• bKash\n• Nagad\n• Cash on Delivery`;
        break;
      
      case 'return':
        interruptionResponse = settings?.fastLaneMessages?.returnPolicy ||
          `🔄 Return Policy:\nপণ্য হাতে পাওয়ার পর যদি মনে হয় এটা সঠিক নয়, তাহলে ২ দিনের মধ্যে ফেরত দিতে পারবেন।`;
        break;
      
      case 'urgency':
        interruptionResponse = settings?.fastLaneMessages?.urgencyResponse ||
          `🚀 চিন্তার কারণ নেই! আমরা দ্রুত ডেলিভারি নিশ্চিত করি।\nঢাকার মধ্যে ২-৩ দিন এবং বাইরে ৩-৫ দিনের মধ্যে পেয়ে যাবেন।`;
        break;
      case 'objection':
        interruptionResponse = settings?.fastLaneMessages?.objectionResponse ||
          `✨ আমাদের প্রতিটি পণ্য ১০০% অথেনটিক এবং হাই কোয়ালিটি।\nআপনি নিশ্চিন্তে অর্ডার করতে পারেন, পছন্দ না হলে রিটার্ন করার সুযোগ তো থাকছেই!`;
        break;
      case 'seller':
        interruptionResponse = settings?.fastLaneMessages?.sellerInfo ||
          `🏢 আমাদের অফিস মিরপুর, ঢাকা।\n📞 প্রয়োজনে কল করুন: 01915969330\n⏰ আমরা প্রতিদিন সকাল ১০টা থেকে রাত ১০টা পর্যন্ত খোলা আছি।`;
        break;

      case 'price':
      case 'size':
        // Product-specific questions - show product details from context
        const productDetails = getProductDetailsResponse(context, emoji);
        interruptionResponse = productDetails || 
          `আপনি product এর details product card এ দেখতে পাবেন। 😊`;
        break;
      
      default:
        interruptionResponse = '';
    }
    
    // Answer the question and re-prompt for phone number
    const rePrompt = settings?.fastLaneMessages?.phoneCollected?.split('\n')[0] ||
      `এখন আপনার ফোন নম্বর দিন। ${emoji ? '📱' : ''}`;
    
    const finalResponse = interruptionResponse + '\n\n' + rePrompt;
    
    return {
      matched: true,
      action: 'CONFIRM', // Stay in same state, just send response
      response: emoji ? finalResponse : finalResponse.replace(/[🎉😊📱📍✅🚚💳🔄]/g, ''),
      newState: 'COLLECTING_PHONE',
      updatedContext: {
        state: 'COLLECTING_PHONE',
      },
    };
  }
  
  // Check if it's a general product details request (not covered by interruption type)
  if (isDetailsRequest(input)) {
    const productDetails = getProductDetailsResponse(context, emoji);
    if (productDetails) {
      const rePrompt = settings?.fastLaneMessages?.phoneCollected?.split('\n')[0] ||
        `এখন আপনার ফোন নম্বর দিন। ${emoji ? '📱' : ''}`;
      
      const finalResponse = productDetails + '\n\n' + rePrompt;
      
      return {
        matched: true,
        action: 'CONFIRM',
        response: emoji ? finalResponse : finalResponse.replace(/[🎉😊📱📍✅🚚💳🔄📦💰📏🎨❌]/g, ''),
        newState: 'COLLECTING_PHONE',
        updatedContext: {
          state: 'COLLECTING_PHONE',
        },
      };
    }
  }
  
  // Check if it's order intent ("order", "buy", "কিনব")
  if (isOrderIntent(input)) {
    // Customer wants to order - move to next state (collect name)
    const message = settings?.fastLaneMessages?.productConfirm ||
      `দারুণ! ${emoji ? '🎉' : ''}\n\nআপনার সম্পূর্ণ নামটি বলবেন?\n(Example: Zayed Bin Hamid)`;
    
    return {
      matched: true,
      action: 'CONFIRM',
      response: emoji ? message : message.replace(/[🎉😊📱📍✅]/g, ''),
      newState: 'COLLECTING_NAME',
      updatedContext: {
        state: 'COLLECTING_NAME',
      },
    };
  }
  
  // Not a valid phone and not an interruption - show error
  const invalidMessage = `⚠️ দুঃখিত! সঠিক phone number দিন।\n\nExample: 01712345678`;
  
  return {
    matched: true,
    action: 'CONFIRM',
    response: emoji ? invalidMessage : invalidMessage.replace(/[⚠️]/g, ''),
    newState: 'COLLECTING_PHONE',
    updatedContext: {
      state: 'COLLECTING_PHONE',
    },
  };
}

/**
 * Handles COLLECTING_ADDRESS state (address validation)
 */
function handleCollectingAddress(
  input: string,
  context: ConversationContext,
  settings?: WorkspaceSettings
): FastLaneResult {
  const emoji = settings?.useEmojis ?? true;
  
  // FIRST: Check if it's a valid address (length >= 10)
  // This must come BEFORE interruption checks to avoid misdetecting addresses
  if (input.length >= 10) {
    const address = input.trim();
    
    // Use settings for delivery charge calculation
    const deliveryCharge = settings 
      ? (address.toLowerCase().includes('dhaka') || address.toLowerCase().includes('ঢাকা')
          ? settings.deliveryCharges.insideDhaka
          : settings.deliveryCharges.outsideDhaka)
      : calculateDeliveryCharge(address);
    
    const cartTotal = calculateCartTotal(context.cart);
    const totalAmount = cartTotal + deliveryCharge;
    
    const orderSummary = generateOrderSummary(
      context.checkout.customerName || 'Customer',
      context.cart,
      address,
      deliveryCharge,
      totalAmount,
      context.checkout.customerPhone || context.customerPhone
    );
    
    return {
      matched: true,
      action: 'COLLECT_ADDRESS',
      response: orderSummary,
      newState: 'CONFIRMING_ORDER',
      updatedContext: {
        state: 'CONFIRMING_ORDER',
        checkout: {
          ...context.checkout,
          customerAddress: address,
          deliveryCharge,
          totalAmount,
        },
        // Legacy fields for backward compatibility
        customerAddress: address,
        deliveryCharge,
        totalAmount,
      },
      extractedData: {
        address,
      },
    };
  }
  
  // ONLY if NOT a valid address: Check for interruptions
  const interruptionType = getInterruptionType(input);
  
  if (interruptionType) {
    let interruptionResponse = '';
    
    switch (interruptionType) {
      case 'delivery':
        interruptionResponse = settings?.fastLaneMessages?.deliveryInfo ||
          `🚚 Delivery Information:\n• ঢাকার মধ্যে: ৳${settings?.deliveryCharges?.insideDhaka || 60}\n• ঢাকার বাইরে: ৳${settings?.deliveryCharges?.outsideDhaka || 120}`;
        break;
      case 'payment':
        interruptionResponse = settings?.fastLaneMessages?.paymentInfo || `💳 bKash, Nagad, COD`;
        break;
      case 'return':
        interruptionResponse = settings?.fastLaneMessages?.returnPolicy || `🔄 ২ দিনের মধ্যে ফেরত।`;
        break;
      case 'urgency':
        interruptionResponse = settings?.fastLaneMessages?.urgencyResponse ||
          `🚀 চিন্তার কারণ নেই! আমরা দ্রুত ডেলিভারি নিশ্চিত করি।\nঢাকার মধ্যে ২-৩ দিন এবং বাইরে ৩-৫ দিনের মধ্যে পেয়ে যাবেন।`;
        break;
      case 'objection':
        interruptionResponse = settings?.fastLaneMessages?.objectionResponse ||
          `✨ আমাদের প্রতিটি পণ্য ১০০% অথেনটিক এবং হাই কোয়ালিটি।\nআপনি নিশ্চিন্তে অর্ডার করতে পারেন, পছন্দ না হলে রিটার্ন করার সুযোগ তো থাকছেই!`;
        break;
      case 'seller':
        interruptionResponse = settings?.fastLaneMessages?.sellerInfo ||
          `🏢 আমাদের অফিস মিরপুর, ঢাকা।\n📞 প্রয়োজনে কল করুন: 01915969330\n⏰ আমরা প্রতিদিন সকাল ১০টা থেকে রাত ১০টা পর্যন্ত খোলা আছি।`;
        break;
      case 'price':
      case 'size':
        const productDetails = getProductDetailsResponse(context, emoji);
        interruptionResponse = productDetails || `details card এ দেখতে পাবেন।`;
        break;
    }
    
    const rePrompt = `আপনার ডেলিভারি ঠিকানাটি দিন।`;
    const finalResponse = interruptionResponse + '\n\n' + rePrompt;
    
    return {
      matched: true,
      action: 'CONFIRM',
      response: emoji ? finalResponse : finalResponse.replace(/[🎉😊📱📍✅🚚💳🔄📦💰📏🎨❌]/g, ''),
      newState: 'COLLECTING_ADDRESS',
      updatedContext: { state: 'COLLECTING_ADDRESS' },
    };
  }
  
  // Check for product details request
  if (isDetailsRequest(input)) {
    const productDetails = getProductDetailsResponse(context, emoji);
    if (productDetails) {
      const rePrompt = `আপনার ডেলিভারি ঠিকানাটি দিন।`;
      return {
        matched: true,
        action: 'CONFIRM',
        response: emoji ? (productDetails + '\n\n' + rePrompt) : (productDetails + '\n\n' + rePrompt).replace(/[🎉😊📱📍✅🚚💳🔄📦💰📏🎨❌]/g, ''),
        newState: 'COLLECTING_ADDRESS',
        updatedContext: { state: 'COLLECTING_ADDRESS' },
      };
    }
  }
  
  // If nothing matched, let it fall back to AI
  return { matched: false };
}

/**
 * Handles CONFIRMING_ORDER state (final Yes/No confirmation)
 */
function handleConfirmingOrder(
  input: string,
  context: ConversationContext,
  settings?: WorkspaceSettings
): FastLaneResult {
  const emoji = settings?.useEmojis ?? true;
  
  // Check for YES
  if (YES_PATTERNS.some(pattern => pattern.test(input))) {
    const message = settings?.fastLaneMessages?.orderConfirmed ||
      `${emoji ? '✅ ' : ''}অর্ডারটি কনফার্ম করা হয়েছে!\n\nআপনার অর্ডার সফলভাবে সম্পন্ন হয়েছে। শীঘ্রই আমরা আপনার সাথে যোগাযোগ করবো।\n\nআমাদের সাথে কেনাকাটার জন্য ধন্যবাদ! ${emoji ? '🎉' : ''}`;
    
    return {
      matched: true,
      action: 'CONFIRM', // This will be mapped to TRANSITION_STATE in orchestrator
      response: settings?.fastLaneMessages?.paymentInstructions 
        ? settings.fastLaneMessages.paymentInstructions
            .replace('{totalAmount}', context.checkout.totalAmount?.toString() || '0')
            .replace('{paymentNumber}', '{{PAYMENT_DETAILS}}') // Placeholder for orchestrator to fill
        : Replies.PAYMENT_INSTRUCTIONS({
            totalAmount: context.checkout.totalAmount,
            paymentNumber: '{{PAYMENT_DETAILS}}',
          }),
      newState: 'COLLECTING_PAYMENT_DIGITS',
      updatedContext: {
        state: 'COLLECTING_PAYMENT_DIGITS',
        // Keep cart and checkout for order creation
      },
    };
  }
  
  // Check for NO
  if (NO_PATTERNS.some(pattern => pattern.test(input))) {
    const message = settings?.fastLaneMessages?.orderCancelled ||
      `অর্ডার cancel করা হয়েছে। ${emoji ? '😊' : ''}\n\nকোনো সমস্যা নেই! নতুন অর্ডার করতে product এর ছবি পাঠান।`;
    
    return {
      matched: true,
      action: 'DECLINE',
      response: emoji ? message : message.replace(/[🎉😊📱📍✅]/g, ''),
      newState: 'IDLE',
      updatedContext: {
        state: 'IDLE',
        cart: [],
        checkout: {},
      },
    };
  }
  
  return { matched: false };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Normalizes phone number to 01XXXXXXXXX format
 */
function normalizePhone(phone: string): string {
  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');
  
  // Extract last 11 digits (01XXXXXXXXX)
  if (digits.length >= 11) {
    return digits.slice(-11);
  }
  
  return digits;
}

/**
 * Capitalizes each word in a string
 */
function capitalizeWords(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Calculates delivery charge based on address
 * Inside Dhaka: ৳60
 * Outside Dhaka: ৳120
 */
function calculateDeliveryCharge(address: string): number {
  const lowerAddress = address.toLowerCase();
  
  // Dhaka keywords
  const dhakaKeywords = [
    'dhaka', 'ঢাকা',
    'dhanmondi', 'ধানমন্ডি',
    'gulshan', 'গুলশান',
    'banani', 'বনানী',
    'mirpur', 'মিরপুর',
    'uttara', 'উত্তরা',
    'mohammadpur', 'মোহাম্মদপুর',
    'badda', 'বাড্ডা',
    'rampura', 'রামপুরা',
    'khilgaon', 'খিলগাঁও',
    'motijheel', 'মতিঝিল',
    'tejgaon', 'তেজগাঁও',
  ];
  
  const isDhaka = dhakaKeywords.some(keyword => lowerAddress.includes(keyword));
  
  return isDhaka ? 60 : 120;
}

/**
 * Calculates total price for all items in cart
 */
function calculateCartTotal(cart: CartItem[]): number {
  return cart.reduce((total, item) => {
    return total + (item.productPrice * item.quantity);
  }, 0);
}

/**
 * Generates order summary with all details
 */
function generateOrderSummary(
  customerName: string,
  cart: CartItem[],
  address: string,
  deliveryCharge: number,
  totalAmount: number,
  phone?: string
): string {
  const cartTotal = calculateCartTotal(cart);
  
  const itemsList = cart
    .map((item, idx) => {
      const itemTotal = item.productPrice * item.quantity;
      return `${idx + 1}. ${item.productName} \n   ৳${item.productPrice} × ${item.quantity} = ৳${itemTotal}`;
    })
    .join('\n\n');
  
  return `📦 Order Summary
━━━━━━━━━━━━━━━━━━━━

👤 Name: ${customerName}
${phone ? `📱 Phone: ${phone}\n` : ''}📍 Address: ${address}

🛍️ Items:
${itemsList}

💰 Pricing:
• Subtotal: ৳${cartTotal}
• Delivery: ৳${deliveryCharge}
• Total: ৳${totalAmount}

━━━━━━━━━━━━━━━━━━━━
Confirm this order? (YES/NO) ✅`;
}

/**
 * Handles COLLECTING_PAYMENT_DIGITS state
 */
function handleCollectingPaymentDigits(
  input: string,
  context: ConversationContext,
  settings?: WorkspaceSettings
): FastLaneResult {
  // Validate: Must be exactly 2 digits
  const digitsPattern = /^\d{2}$/;
  
  if (digitsPattern.test(input)) {
    return {
      matched: true,
      action: 'CREATE_ORDER',
      response: settings?.fastLaneMessages?.paymentReview
        ? settings.fastLaneMessages.paymentReview
            .replace('{name}', context.checkout.customerName || 'Customer')
            .replace('{digits}', input)
        : Replies.PAYMENT_REVIEW({
            name: context.checkout.customerName,
            paymentLastTwoDigits: input,
          }),
      newState: 'IDLE',
      updatedContext: {
        state: 'IDLE',
        checkout: {
          ...context.checkout,
          paymentLastTwoDigits: input,
        }
      },
    };
  }
  
  // Invalid input - show error
  return {
    matched: true,
    action: 'CONFIRM', // Just send response, no state change
    response: settings?.fastLaneMessages?.invalidPaymentDigits || Replies.INVALID_PAYMENT_DIGITS(),
    newState: 'COLLECTING_PAYMENT_DIGITS',
    updatedContext: {
      state: 'COLLECTING_PAYMENT_DIGITS',
    },
  };
}

/**
 * Handles AWAITING_CUSTOMER_DETAILS state (Quick Form mode)
 * Parses name, phone, and address from a single customer message
 * Uses multi-strategy parsing for flexibility
 */
function handleAwaitingCustomerDetails(
  input: string,
  context: ConversationContext,
  settings?: WorkspaceSettings
): FastLaneResult {
  const emoji = settings?.useEmojis ?? true;
  const text = input.trim();
  
  let name: string | null = null;
  let phone: string | null = null;
  let address: string | null = null;
  
  // STRATEGY 1: Try labeled format (নাম:, Name:, etc.)
  const nameMatch = text.match(/(?:নাম|Name)\s*[:\-]\s*([^\n]+)/i);
  const phoneMatch = text.match(/(?:ফোন|Phone|Mobile|মোবাইল)\s*[:\-]\s*([^\n]+)/i);
  const addressMatch = text.match(/(?:ঠিকানা|Address)\s*[:\-]\s*([\s\S]+?)(?=(?:নাম|Name|ফোন|Phone|$))/i);
  
  if (nameMatch) name = nameMatch[1].trim();
  if (phoneMatch) phone = phoneMatch[1].trim();
  if (addressMatch) address = addressMatch[1].trim();
  
  // STRATEGY 2: If labeled parsing failed, try positional parsing
  if (!name || !phone || !address) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    if (lines.length >= 3) {
      // Identify phone by pattern (most reliable)
      const phoneIndex = lines.findIndex(line => 
        /01[3-9]\d{8}|^\+?880/.test(line.replace(/\D/g, ''))
      );
      
      if (phoneIndex !== -1) {
        phone = lines[phoneIndex];
        if (phoneIndex > 0 && !name) {
          name = lines[0];
        }
        if (phoneIndex < lines.length - 1 && !address) {
          address = lines.slice(phoneIndex + 1).join('\n');
        }
      } else {
        if (!name) name = lines[0];
        if (!phone) phone = lines[1];
        if (!address) address = lines.slice(2).join('\n');
      }
    } else if (lines.length === 2) {
      const phoneIndex = lines.findIndex(line => 
        /01[3-9]\d{8}|^\+?880/.test(line.replace(/\D/g, ''))
      );
      if (phoneIndex !== -1) {
        phone = lines[phoneIndex];
        name = lines[1 - phoneIndex];
      }
    }
  }
  
  // Normalize and validate phone
  if (phone) {
    phone = normalizePhone(phone);
  }
  const isPhoneValid = phone ? PHONE_PATTERNS.some(p => p.test(phone)) : false;
  
  // SUCCESS: All fields extracted and phone is valid
  if (name && isPhoneValid && address) {
    const deliveryCharge = address.toLowerCase().includes('dhaka') || address.toLowerCase().includes('ঢাকা')
      ? (settings?.deliveryCharges?.insideDhaka || 60)
      : (settings?.deliveryCharges?.outsideDhaka || 120);
    
    const cartTotal = calculateCartTotal(context.cart);
    const totalAmount = cartTotal + deliveryCharge;
    
    const orderSummary = generateOrderSummary(
      name,
      context.cart,
      address,
      deliveryCharge,
      totalAmount,
      phone || undefined
    );
    
    return {
      matched: true,
      action: 'COLLECT_ADDRESS',
      response: orderSummary,
      newState: 'CONFIRMING_ORDER',
      updatedContext: {
        ...context,
        state: 'CONFIRMING_ORDER',
        checkout: {
          ...context.checkout,
          customerName: name,
          customerPhone: phone,
          customerAddress: address,
          deliveryCharge,
          totalAmount,
        },
        customerName: name,
        customerPhone: phone,
        customerAddress: address,
        deliveryCharge,
        totalAmount,
      },
    };
  }
  
  // FAILURE: Log and re-prompt
  console.log(`[QUICK_FORM_PARSE_FAILURE] Conversation: ${context.metadata?.startedAt || 'unknown'}`);
  console.log(`Input: "${text}"`);
  console.log(`Parsed - Name: ${name || 'null'}, Phone: ${phone || 'null'} (valid: ${isPhoneValid}), Address: ${address || 'null'}`);
  
  const errorMsg = settings?.quick_form_error || 
    `দুঃখিত, আমি আপনার তথ্যটি সঠিকভাবে বুঝতে পারিনি। ${emoji ? '😔' : ''}\n\nঅনুগ্রহ করে নিচের ফর্ম্যাটে আবার দিন:\n\nনাম: আপনার নাম\nফোন: 017XXXXXXXX\nঠিকানা: আপনার সম্পূর্ণ ঠিকানা\n\nঅথবা একটি লাইন করে দিতে পারেন:\nআপনার নাম\n017XXXXXXXX\nআপনার সম্পূর্ণ ঠিকানা`;
  
  return {
    matched: true,
    action: 'CONFIRM',
    response: emoji ? errorMsg : errorMsg.replace(/😔/g, ''),
    newState: 'AWAITING_CUSTOMER_DETAILS',
    updatedContext: {
      ...context,
      state: 'AWAITING_CUSTOMER_DETAILS',
    },
  };
}
