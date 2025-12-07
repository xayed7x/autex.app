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

import { ConversationContext, ConversationState, CartItem, PendingImage } from '@/types/conversation';
import { WorkspaceSettings } from '@/lib/workspace/settings';
import { Replies } from './replies';
import { getInterruptionType, isDetailsRequest, isOrderIntent, detectAllIntent, detectItemNumbers } from './keywords';

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
  /^(no|nope|nah|n|cancel)$/i,  // English + "cancel" we tell users to type
  /^(na|nai|nahi)$/i,            // Banglish
  /^(না|নাই|নাহ|ভুল|বাতিল)$/i,  // Bangla
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
    
    case 'SELECTING_CART_ITEMS':
      return handleSelectingCartItems(trimmedInput, currentContext, settings);
    
    case 'COLLECTING_MULTI_VARIATIONS':
      return handleCollectingMultiVariations(trimmedInput, currentContext, settings);
    
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
    
    // Get product from cart to check for sizes/colors/stock
    const product = context.cart && context.cart.length > 0 ? context.cart[0] : null;
    const productAny = product as any;
    
    // CHECK STOCK FIRST - If out of stock, don't proceed to order flow
    const totalStock = productAny?.stock_quantity || 0;
    if (totalStock === 0) {
      console.log(`❌ [FAST_LANE] Product out of stock: ${productAny?.productName || 'Unknown'}`);
      const productName = productAny?.productName || 'এই প্রোডাক্ট';
      const defaultMessage = `দুঃখিত! 😔 "{productName}" এখন স্টকে নেই।\n\nআপনি চাইলে অন্য পণ্যের নাম লিখুন বা স্ক্রিনশট পাঠান। আমরা সাহায্য করতে পারবো! 🛍️`;
      const outOfStockMessage = (settings?.out_of_stock_message || defaultMessage)
        .replace('{productName}', productName);
      return {
        matched: true,
        action: 'CONFIRM',
        response: emoji ? outOfStockMessage : outOfStockMessage.replace(/[😔🛍️]/g, ''),
        newState: 'IDLE',
        updatedContext: {
          state: 'IDLE',
          cart: [],
          checkout: {},
        },
      };
    }
    
    // Fork based on order collection style
    if (settings?.order_collection_style === 'quick_form') {
      console.log('✅ [QUICK_FORM] Activating quick form mode!');
      
      // Check if multi-product order (sizes already collected in COLLECTING_MULTI_VARIATIONS)
      const isMultiProduct = context.cart && context.cart.length > 1;
      
      if (isMultiProduct) {
        console.log(`🛒 [QUICK_FORM] Multi-product order with ${context.cart.length} items - skipping size/color`);
        
        // Multi-product: Simple prompt without size/color
        let multiProductPrompt = 'দারুণ! অর্ডারটি সম্পন্ন করতে আপনার তথ্য দিন:\n\nনাম:\nফোন:\nসম্পূর্ণ ঠিকানা:';
        
        return {
          matched: true,
          action: 'CONFIRM',
          response: emoji ? multiProductPrompt : multiProductPrompt,
          newState: 'AWAITING_CUSTOMER_DETAILS',
          updatedContext: {
            ...context,
            state: 'AWAITING_CUSTOMER_DETAILS',
          },
        };
      }
      
      // Single product: Check for size/color requirements
      const availableSizes = productAny?.sizes || productAny?.availableSizes || [];
      const availableColors = productAny?.colors || productAny?.availableColors || [];
      const hasSize = availableSizes.length > 0;
      const hasColor = availableColors.length > 1; // Only ask if multiple colors
      
      console.log(`🔍 [QUICK_FORM] Product sizes: ${availableSizes.join(', ') || 'none'}`);
      console.log(`🔍 [QUICK_FORM] Product colors: ${availableColors.join(', ') || 'none'}`);
      
      // Build dynamic prompt based on product variations
      let dynamicPrompt = settings.quick_form_prompt || 
        'দারুণ! অর্ডারটি সম্পন্ন করতে, অনুগ্রহ করে নিচের ফর্ম্যাট অনুযায়ী আপনার তথ্য দিন:\n\nনাম:\nফোন:\nসম্পূর্ণ ঠিকানা:';
      
      // Append size field if product has sizes
      if (hasSize) {
        dynamicPrompt += `\nসাইজ: (${availableSizes.join('/')})`;
      }
      
      // Append color field if product has multiple colors
      if (hasColor) {
        dynamicPrompt += `\nকালার: (${availableColors.join('/')})`;
      }
      
      // Add optional quantity field
      dynamicPrompt += '\nপরিমাণ: (1 হলে লিখতে হবে না)';
      
      return {
        matched: true,
        action: 'CONFIRM',
        response: emoji ? dynamicPrompt : dynamicPrompt.replace(/[🎉😊📱📍✅]/g, ''),
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
        pendingImages: [], // Clear pending images to prevent re-adding
        lastImageReceivedAt: undefined, // Reset batch window
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
        pendingImages: [], // Clear pending images to prevent re-adding
        lastImageReceivedAt: undefined, // Reset batch window
      },
    };
  }
  
  return { matched: false };
}

/**
 * Handles SELECTING_CART_ITEMS state (multi-product selection from pending images)
 * User can say "সবগুলো" (all), "1 ar 3" (specific items), or "শুধু 2" (only item 2)
 */
function handleSelectingCartItems(
  input: string,
  context: ConversationContext,
  settings?: WorkspaceSettings
): FastLaneResult {
  const emoji = settings?.useEmojis ?? true;
  const pendingImages = context.pendingImages || [];
  const recognizedProducts = pendingImages.filter(img => img.recognitionResult.success);
  
  // If no pending images, this is an error state
  if (recognizedProducts.length === 0) {
    return {
      matched: true,
      action: 'DECLINE',
      response: `দুঃখিত, কোনো product পাওয়া যায়নি। ${emoji ? '😔' : ''}\n\nনতুন product এর ছবি পাঠান।`,
      newState: 'IDLE',
      updatedContext: {
        state: 'IDLE',
        pendingImages: [],
        cart: [],
        lastImageReceivedAt: undefined,
      },
    };
  }
  
  // Check for "select all" intent
  if (detectAllIntent(input)) {
    console.log('🛒 [CART_SELECT] User selected ALL items');
    
    // Convert all pending images to cart items
    const cartItems: CartItem[] = recognizedProducts.map(img => ({
      productId: img.recognitionResult.productId!,
      productName: img.recognitionResult.productName!,
      productPrice: img.recognitionResult.productPrice!,
      imageUrl: img.recognitionResult.imageUrl,
      quantity: 1,
      sizes: img.recognitionResult.sizes,
      colors: img.recognitionResult.colors,
    }));
    
    // Calculate total
    const total = cartItems.reduce((sum, item) => sum + item.productPrice, 0);
    
    // Generate selection summary
    let summaryMessage = `✅ ${cartItems.length}টা product নির্বাচিত হয়েছে:\n\n`;
    cartItems.forEach((item, idx) => {
      summaryMessage += `${idx + 1}. ${item.productName} - ৳${item.productPrice}\n`;
    });
    summaryMessage += `\n💰 মোট: ৳${total}\n\n`;
    
    // Check if any product needs size/color selection
    const needsVariations = cartItems.some((item: any) => 
      (item.sizes?.length > 0) || (item.colors?.length > 1)
    );
    
    if (needsVariations) {
      // Find first product that needs variation
      const firstNeedingVariation = cartItems.findIndex((item: any) => 
        (item.sizes?.length > 0) || (item.colors?.length > 1)
      );
      const firstProduct = cartItems[firstNeedingVariation] as any;
      const needsSize = (firstProduct.sizes?.length ?? 0) > 0;
      
      summaryMessage += needsSize
        ? `📏 "${firstProduct.productName}" এর সাইজ বলুন:\nAvailable: ${firstProduct.sizes.join(', ')}`
        : `🎨 "${firstProduct.productName}" এর কালার বলুন:\nAvailable: ${firstProduct.colors.join(', ')}`;
      
      return {
        matched: true,
        action: 'CONFIRM',
        response: summaryMessage,
        newState: 'COLLECTING_MULTI_VARIATIONS',
        updatedContext: {
          state: 'COLLECTING_MULTI_VARIATIONS',
          cart: cartItems,
          pendingImages: [],
          lastImageReceivedAt: undefined,
          currentVariationIndex: firstNeedingVariation,
          collectingSize: needsSize,
        },
      };
    } else {
      // No variations needed, proceed to name collection
      summaryMessage += `আপনার সম্পূর্ণ নামটি বলবেন?\n(Example: Zayed Bin Hamid)`;
      
      return {
        matched: true,
        action: 'CONFIRM',
        response: summaryMessage,
        newState: 'COLLECTING_NAME',
        updatedContext: {
          state: 'COLLECTING_NAME',
          cart: cartItems,
          pendingImages: [],
          lastImageReceivedAt: undefined,
        },
      };
    }
  }
  
  // Check for numbered selection
  const selectedNumbers = detectItemNumbers(input);
  
  if (selectedNumbers.length > 0) {
    console.log(`🛒 [CART_SELECT] User selected items: ${selectedNumbers.join(', ')}`);
    
    // Validate numbers are within range
    const maxItem = recognizedProducts.length;
    const invalidNumbers = selectedNumbers.filter(n => n > maxItem);
    
    if (invalidNumbers.length > 0) {
      // Some numbers are out of range
      const errorMessage = `⚠️ ভুল নম্বর! শুধু ${maxItem}টা product আছে।\n\n` +
        `সঠিক নম্বর দিন (1-${maxItem}) অথবা "সবগুলো" লিখুন।`;
      
      return {
        matched: true,
        action: 'CONFIRM',
        response: errorMessage,
        newState: 'SELECTING_CART_ITEMS',
        updatedContext: {
          state: 'SELECTING_CART_ITEMS',
        },
      };
    }
    
    // Filter products by selected numbers (1-indexed)
    const selectedProducts = selectedNumbers.map(n => recognizedProducts[n - 1]).filter(Boolean);
    
    // Convert selected products to cart items
    const cartItems: CartItem[] = selectedProducts.map(img => ({
      productId: img.recognitionResult.productId!,
      productName: img.recognitionResult.productName!,
      productPrice: img.recognitionResult.productPrice!,
      imageUrl: img.recognitionResult.imageUrl,
      quantity: 1,
      sizes: img.recognitionResult.sizes,
      colors: img.recognitionResult.colors,
    }));
    
    // Calculate total
    const total = cartItems.reduce((sum, item) => sum + item.productPrice, 0);
    
    // Generate selection summary
    let summaryMessage = `✅ ${cartItems.length}টা product নির্বাচিত হয়েছে:\n\n`;
    cartItems.forEach((item, idx) => {
      summaryMessage += `${idx + 1}. ${item.productName} - ৳${item.productPrice}\n`;
    });
    summaryMessage += `\n💰 মোট: ৳${total}\n\n`;
    
    // Check if any product needs size/color selection
    const needsVariations = cartItems.some((item: any) => 
      (item.sizes?.length > 0) || (item.colors?.length > 1)
    );
    
    if (needsVariations) {
      // Find first product that needs variation
      const firstNeedingVariation = cartItems.findIndex((item: any) => 
        (item.sizes?.length > 0) || (item.colors?.length > 1)
      );
      const firstProduct = cartItems[firstNeedingVariation] as any;
      const needsSize = (firstProduct.sizes?.length ?? 0) > 0;
      
      summaryMessage += needsSize
        ? `📏 "${firstProduct.productName}" এর সাইজ বলুন:\nAvailable: ${firstProduct.sizes.join(', ')}`
        : `🎨 "${firstProduct.productName}" এর কালার বলুন:\nAvailable: ${firstProduct.colors.join(', ')}`;
      
      return {
        matched: true,
        action: 'CONFIRM',
        response: summaryMessage,
        newState: 'COLLECTING_MULTI_VARIATIONS',
        updatedContext: {
          state: 'COLLECTING_MULTI_VARIATIONS',
          cart: cartItems,
          pendingImages: [],
          lastImageReceivedAt: undefined,
          currentVariationIndex: firstNeedingVariation,
          collectingSize: needsSize,
        },
      };
    } else {
      // No variations needed, proceed to name collection
      summaryMessage += `আপনার সম্পূর্ণ নামটি বলবেন?\n(Example: Zayed Bin Hamid)`;
      
      return {
        matched: true,
        action: 'CONFIRM',
        response: summaryMessage,
        newState: 'COLLECTING_NAME',
        updatedContext: {
          state: 'COLLECTING_NAME',
          cart: cartItems,
          pendingImages: [],
          lastImageReceivedAt: undefined,
        },
      };
    }
  }
  
  // Check for decline/cancel
  const NO_PATTERNS = [/^(no|nope|na|nai|না|নাই|cancel|বাতিল)$/i];
  if (NO_PATTERNS.some(pattern => pattern.test(input.trim()))) {
    return {
      matched: true,
      action: 'DECLINE',
      response: `কোনো সমস্যা নেই! ${emoji ? '😊' : ''}\n\nঅন্য product এর ছবি পাঠান।`,
      newState: 'IDLE',
      updatedContext: {
        state: 'IDLE',
        pendingImages: [],
        cart: [],
        lastImageReceivedAt: undefined,
      },
    };
  }
  
  // Invalid input - show product list again and re-prompt
  let productListMessage = `⚠️ সঠিক নম্বর দিন!\n\nআপনার list:\n`;
  recognizedProducts.forEach((img, idx) => {
    productListMessage += `${idx + 1}️⃣ ${img.recognitionResult.productName} - ৳${img.recognitionResult.productPrice}\n`;
  });
  productListMessage += `\nকোনগুলো অর্ডার করবেন?\n• "সবগুলো" - সব product\n• "1 ar 3" - নির্দিষ্ট item\n• "না" - বাতিল করতে`;
  
  return {
    matched: true,
    action: 'CONFIRM',
    response: productListMessage,
    newState: 'SELECTING_CART_ITEMS',
    updatedContext: {
      state: 'SELECTING_CART_ITEMS',
    },
  };
}

/**
 * Handles COLLECTING_MULTI_VARIATIONS state (size/color for each cart item)
 * Loops through cart items, collecting size (and optionally color) for each
 */
function handleCollectingMultiVariations(
  input: string,
  context: ConversationContext,
  settings?: WorkspaceSettings
): FastLaneResult {
  const emoji = settings?.useEmojis ?? true;
  const cart = context.cart || [];
  const currentIndex = context.currentVariationIndex ?? 0;
  const collectingSize = context.collectingSize ?? true;
  
  // If cart is empty, error state
  if (cart.length === 0) {
    return {
      matched: true,
      action: 'DECLINE',
      response: `দুঃখিত, cart এ কোনো product নেই। ${emoji ? '😔' : ''}`,
      newState: 'IDLE',
      updatedContext: {
        state: 'IDLE',
        cart: [],
        pendingImages: [],
        lastImageReceivedAt: undefined,
        currentVariationIndex: undefined,
        collectingSize: undefined,
      },
    };
  }
  
  // Check for cancel
  const cancelPatterns = [/^(cancel|বাতিল|na|না|nai|নাই)$/i];
  if (cancelPatterns.some(pattern => pattern.test(input.trim()))) {
    return {
      matched: true,
      action: 'DECLINE',
      response: `অর্ডার বাতিল হয়েছে। ${emoji ? '😊' : ''}\n\nনতুন product এর ছবি পাঠান।`,
      newState: 'IDLE',
      updatedContext: {
        state: 'IDLE',
        cart: [],
        pendingImages: [],
        lastImageReceivedAt: undefined,
        currentVariationIndex: undefined,
        collectingSize: undefined,
      },
    };
  }
  
  // Get current product
  const currentProduct = cart[currentIndex];
  if (!currentProduct) {
    // All products done, move to name collection
    return moveToNameCollection(context, settings);
  }
  
  const productAny = currentProduct as any;
  const availableSizes = productAny.sizes || [];
  const availableColors = productAny.colors || [];
  
  // Normalize input
  const normalizedInput = input.trim().toUpperCase();
  
  if (collectingSize && availableSizes.length > 0) {
    // We're collecting SIZE for current product
    
    // Check if input matches an available size
    const matchedSize = availableSizes.find((s: string) => 
      s.toUpperCase() === normalizedInput || 
      s.toLowerCase() === input.trim().toLowerCase()
    );
    
    if (matchedSize) {
      // Valid size - update cart item
      const updatedCart = [...cart];
      updatedCart[currentIndex] = {
        ...updatedCart[currentIndex],
        selectedSize: matchedSize,
      };
      
      // Check if this product also needs color
      if (availableColors.length > 1) {
        // Move to color collection for same product
        const colorPrompt = `✅ সাইজ: ${matchedSize}\n\n` +
          `এখন "${currentProduct.productName}" এর কালার বলুন:\n` +
          `Available: ${availableColors.join(', ')}`;
        
        return {
          matched: true,
          action: 'CONFIRM',
          response: colorPrompt,
          newState: 'COLLECTING_MULTI_VARIATIONS',
          updatedContext: {
            state: 'COLLECTING_MULTI_VARIATIONS',
            cart: updatedCart,
            collectingSize: false, // Now collecting color
          },
        };
      } else {
        // No color needed, move to next product
        return moveToNextProduct(updatedCart, currentIndex + 1, settings);
      }
    } else {
      // Invalid size
      const errorMessage = `⚠️ "${input}" সাইজ নেই!\n\n` +
        `"${currentProduct.productName}" এ available সাইজ:\n${availableSizes.join(', ')}\n\n` +
        `উপরের থেকে একটা সাইজ লিখুন:`;
      
      return {
        matched: true,
        action: 'CONFIRM',
        response: errorMessage,
        newState: 'COLLECTING_MULTI_VARIATIONS',
        updatedContext: {
          state: 'COLLECTING_MULTI_VARIATIONS',
        },
      };
    }
  } else if (!collectingSize && availableColors.length > 1) {
    // We're collecting COLOR for current product
    
    // Check if input matches an available color
    const matchedColor = availableColors.find((c: string) => 
      c.toUpperCase() === normalizedInput || 
      c.toLowerCase() === input.trim().toLowerCase()
    );
    
    if (matchedColor) {
      // Valid color - update cart item
      const updatedCart = [...cart];
      updatedCart[currentIndex] = {
        ...updatedCart[currentIndex],
        selectedColor: matchedColor,
      };
      
      // Move to next product
      return moveToNextProduct(updatedCart, currentIndex + 1, settings);
    } else {
      // Invalid color
      const errorMessage = `⚠️ "${input}" কালার নেই!\n\n` +
        `"${currentProduct.productName}" এ available কালার:\n${availableColors.join(', ')}\n\n` +
        `উপরের থেকে একটা কালার লিখুন:`;
      
      return {
        matched: true,
        action: 'CONFIRM',
        response: errorMessage,
        newState: 'COLLECTING_MULTI_VARIATIONS',
        updatedContext: {
          state: 'COLLECTING_MULTI_VARIATIONS',
        },
      };
    }
  } else {
    // Product doesn't need size/color, move to next
    return moveToNextProduct(cart, currentIndex + 1, settings);
  }
}

/**
 * Helper: Move to next product in variation collection loop
 */
function moveToNextProduct(
  cart: CartItem[],
  nextIndex: number,
  settings?: WorkspaceSettings
): FastLaneResult {
  const emoji = settings?.useEmojis ?? true;
  
  // Find next product that needs size/color
  for (let i = nextIndex; i < cart.length; i++) {
    const product = cart[i] as any;
    const needsSize = (product.sizes?.length ?? 0) > 0 && !product.selectedSize;
    const needsColor = (product.colors?.length ?? 1) > 1 && !product.selectedColor;
    
    if (needsSize || needsColor) {
      // Found a product that needs variation
      const sizePrompt = needsSize
        ? `"${product.productName}" এর সাইজ বলুন:\nAvailable: ${product.sizes.join(', ')}`
        : `"${product.productName}" এর কালার বলুন:\nAvailable: ${product.colors.join(', ')}`;
      
      return {
        matched: true,
        action: 'CONFIRM',
        response: `📦 Product ${i + 1}/${cart.length}\n\n${sizePrompt}`,
        newState: 'COLLECTING_MULTI_VARIATIONS',
        updatedContext: {
          state: 'COLLECTING_MULTI_VARIATIONS',
          cart,
          currentVariationIndex: i,
          collectingSize: needsSize,
        },
      };
    }
  }
  
  // All products done, move to name collection
  return {
    matched: true,
    action: 'CONFIRM',
    response: `✅ সব product এর সাইজ নেওয়া হয়েছে! ${emoji ? '🎉' : ''}\n\n` +
      `এখন আপনার সম্পূর্ণ নামটি বলবেন?\n(Example: Zayed Bin Hamid)`,
    newState: 'COLLECTING_NAME',
    updatedContext: {
      state: 'COLLECTING_NAME',
      cart,
      currentVariationIndex: undefined,
      collectingSize: undefined,
    },
  };
}

/**
 * Helper: Move directly to name collection (when no variations needed)
 */
function moveToNameCollection(
  context: ConversationContext,
  settings?: WorkspaceSettings
): FastLaneResult {
  const emoji = settings?.useEmojis ?? true;
  
  return {
    matched: true,
    action: 'CONFIRM',
    response: `${emoji ? '🎉' : ''} দারুণ!\n\nআপনার সম্পূর্ণ নামটি বলবেন?\n(Example: Zayed Bin Hamid)`,
    newState: 'COLLECTING_NAME',
    updatedContext: {
      state: 'COLLECTING_NAME',
      cart: context.cart,
      currentVariationIndex: undefined,
      collectingSize: undefined,
    },
  };
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
  phone?: string,
  selectedSize?: string,
  selectedColor?: string
): string {
  const cartTotal = calculateCartTotal(cart);
  
  // Build product info with size/color from cart item
  const itemsList = cart
    .map((item, idx) => {
      const itemTotal = item.productPrice * item.quantity;
      const itemAny = item as any;
      const size = selectedSize || itemAny.selectedSize || itemAny.variations?.size;
      const color = selectedColor || itemAny.selectedColor || itemAny.variations?.color;
      
      let productLine = `${idx + 1}. ${item.productName}`;
      if (size) productLine += `\n   📏 Size: ${size}`;
      if (color) productLine += `\n   🎨 Color: ${color}`;
      productLine += `\n   ৳${item.productPrice} × ${item.quantity} = ৳${itemTotal}`;
      return productLine;
    })
    .join('\n\n');
  
  return `📦 Order Summary
━━━━━━━━━━━━━━━━━━━━

👤 Name: ${customerName}
${phone ? `📱 Phone: ${phone}\n` : ''}📍 Address: ${address}

🛍️ Product:
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
 * Parses name, phone, address, size, and color from a single customer message
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
  let size: string | null = null;
  let color: string | null = null;
  let quantity: number = 1; // Default to 1
  
  // Check if multi-product order (sizes already collected in COLLECTING_MULTI_VARIATIONS)
  const isMultiProduct = context.cart && context.cart.length > 1;
  
  // Get product info from context to check if size/color is needed
  const product = context.cart && context.cart.length > 0 ? context.cart[0] : null;
  const productAny = product as any;
  const availableSizes = productAny?.sizes || productAny?.availableSizes || [];
  const availableColors = productAny?.colors || productAny?.availableColors || [];
  
  // For multi-product: sizes/colors already collected, no need to require them
  const requiresSize = !isMultiProduct && availableSizes.length > 0;
  const requiresColor = !isMultiProduct && availableColors.length > 1;
  
  // STRATEGY 1: Try labeled format (নাম:, Name:, সাইজ:, Size:, পরিমাণ:, Quantity:, etc.)
  const nameMatch = text.match(/(?:নাম|Name)\s*[:\-]\s*([^\n]+)/i);
  const phoneMatch = text.match(/(?:ফোন|Phone|Mobile|মোবাইল)\s*[:\-]\s*([^\n]+)/i);
  const addressMatch = text.match(/(?:ঠিকানা|Address)\s*[:\-]\s*([\s\S]+?)(?=(?:নাম|Name|ফোন|Phone|সাইজ|Size|কালার|Color|পরিমাণ|Quantity|$))/i);
  const sizeMatch = text.match(/(?:সাইজ|Size|Saiz)\s*[:\-]\s*([^\n]+)/i);
  const colorMatch = text.match(/(?:কালার|Color|Kalar|রং)\s*[:\-]\s*([^\n]+)/i);
  const quantityMatch = text.match(/(?:পরিমাণ|Quantity|Qty|সংখ্যা)\s*[:\-]\s*(\d+)/i);
  
  if (nameMatch) name = nameMatch[1].trim();
  if (phoneMatch) phone = phoneMatch[1].trim();
  if (addressMatch) address = addressMatch[1].trim();
  if (sizeMatch) size = sizeMatch[1].trim().toUpperCase();
  if (colorMatch) color = colorMatch[1].trim();
  if (quantityMatch) quantity = parseInt(quantityMatch[1]) || 1;
  
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
        // Address is everything after phone (excluding size/color if at end)
        if (phoneIndex < lines.length - 1 && !address) {
          const remainingLines = lines.slice(phoneIndex + 1);
          
          // Check last few lines for size, color, and quantity (in any order)
          // Work backwards from the end
          for (let i = remainingLines.length - 1; i >= 0 && i >= remainingLines.length - 4; i--) {
            const line = remainingLines[i];
            if (!line) continue;
            
            const lineLower = line.toLowerCase();
            const lineUpper = line.toUpperCase();
            
            // Check if it's a size FIRST (specific patterns: XS, S, M, L, XL, XXL, XXXL, or 28-48)
            const isSizePattern = /^(xs|s|m|l|xl|xxl|xxxl)$/i.test(line);
            const isTwoDigitSize = /^(2[8-9]|3[0-9]|4[0-8])$/.test(line); // Sizes 28-48
            if (!size && (isSizePattern || isTwoDigitSize)) {
              size = lineUpper;
              remainingLines.splice(i, 1);
              continue;
            }
            
            // Check if it's a quantity (pure number 2-999, but NOT a size pattern)
            // Matches: 2-9, 10-99, 100-999 (both Arabic and Bengali numerals)
            const isQuantityPattern = /^[২-৯]$|^[2-9]$|^[১-৯][০-৯]$|^[1-9][0-9]$|^[১-৯][০-৯]{2}$|^[1-9][0-9]{2}$/.test(line);
            if (quantity === 1 && isQuantityPattern && !isTwoDigitSize) {
              // Convert Bengali numerals to Arabic
              const convertedNum = line.replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)));
              quantity = parseInt(convertedNum) || 1;
              remainingLines.splice(i, 1);
              continue;
            }
            
            // Check if it's a color (matches available colors)
            const matchedColor = availableColors.find((c: string) => 
              c.toLowerCase() === lineLower
            );
            if (!color && matchedColor) {
              color = capitalizeWords(line);
              remainingLines.splice(i, 1);
              continue;
            }
          }
          
          address = remainingLines.join('\n');
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
  
  // Validate size if required
  const isSizeValid = !requiresSize || (size && availableSizes.some((s: string) => 
    s.toUpperCase() === size?.toUpperCase()
  ));
  
  // Validate color if required  
  const isColorValid = !requiresColor || (color && availableColors.some((c: string) => 
    c.toLowerCase() === color?.toLowerCase()
  ));
  
  // Validate stock for selected size
  let stockAvailable = 999; // Default high value if no size_stock
  let stockError: string | null = null;
  
  if (size && productAny?.size_stock && Array.isArray(productAny.size_stock)) {
    const sizeStock = productAny.size_stock.find((ss: any) => 
      ss.size?.toUpperCase() === size.toUpperCase()
    );
    if (sizeStock) {
      stockAvailable = sizeStock.quantity || 0;
      if (quantity > stockAvailable) {
        stockError = stockAvailable === 0 
          ? `দুঃখিত! "${size}" সাইজ এখন স্টকে নেই। অন্য সাইজ বেছে নিন।`
          : `দুঃখিত! "${size}" সাইজে মাত্র ${stockAvailable} পিস আছে। আপনি সর্বোচ্চ ${stockAvailable} পিস অর্ডার করতে পারবেন।`;
      }
    }
  } else if (productAny && quantity > (productAny.stock_quantity || 0)) {
    // Fallback to total stock if no size_stock
    stockAvailable = productAny.stock_quantity || 0;
    if (stockAvailable === 0) {
      stockError = `দুঃখিত! এই প্রোডাক্ট এখন স্টকে নেই।`;
    } else {
      stockError = `দুঃখিত! এই প্রোডাক্টে মাত্র ${stockAvailable} পিস আছে। আপনি সর্বোচ্চ ${stockAvailable} পিস অর্ডার করতে পারবেন।`;
    }
  }
  
  // Return error if stock is insufficient
  if (stockError) {
    return {
      matched: true,
      action: 'CONFIRM',
      response: emoji ? `❌ ${stockError}` : stockError,
      newState: 'AWAITING_CUSTOMER_DETAILS',
      updatedContext: {
        ...context,
        state: 'AWAITING_CUSTOMER_DETAILS',
      },
    };
  }
  
  // SUCCESS: All required fields extracted and valid
  if (name && isPhoneValid && address && isSizeValid && isColorValid) {
    const deliveryCharge = address.toLowerCase().includes('dhaka') || address.toLowerCase().includes('ঢাকা')
      ? (settings?.deliveryCharges?.insideDhaka || 60)
      : (settings?.deliveryCharges?.outsideDhaka || 120);
    
    // Update cart with selected size/color and quantity
    const updatedCart = context.cart.map((item, idx) => {
      if (idx === 0) {
        return {
          ...item,
          quantity: quantity, // Use parsed quantity
          variations: {
            ...(item as any).variations,
            size: size || undefined,
            color: color || undefined,
          },
          selectedSize: size || undefined,
          selectedColor: color || undefined,
        };
      }
      return item;
    });
    
    // Recalculate total with quantity
    const cartTotal = updatedCart.reduce((sum, item) => {
      return sum + (item.productPrice * item.quantity);
    }, 0);
    const totalAmount = cartTotal + deliveryCharge;
    
    const orderSummary = generateOrderSummary(
      name,
      updatedCart,
      address,
      deliveryCharge,
      totalAmount,
      phone || undefined,
      size || undefined,
      color || undefined
    );
    
    return {
      matched: true,
      action: 'COLLECT_ADDRESS',
      response: orderSummary,
      newState: 'CONFIRMING_ORDER',
      updatedContext: {
        ...context,
        state: 'CONFIRMING_ORDER',
        cart: updatedCart,
        checkout: {
          ...context.checkout,
          customerName: name || undefined,
          customerPhone: phone || undefined,
          customerAddress: address || undefined,
          deliveryCharge,
          totalAmount,
        },
        customerName: name || undefined,
        customerPhone: phone || undefined,
        customerAddress: address || undefined,
        deliveryCharge,
        totalAmount,
        // Store selected variations for order creation
        selectedSize: size || undefined,
        selectedColor: color || undefined,
      },
    };
  }
  
  // FAILURE: Log and build specific error message
  console.log(`[QUICK_FORM_PARSE_FAILURE] Conversation: ${context.metadata?.startedAt || 'unknown'}`);
  console.log(`Input: "${text}"`);
  console.log(`Parsed - Name: ${name || 'null'}, Phone: ${phone || 'null'} (valid: ${isPhoneValid}), Address: ${address || 'null'}`);
  console.log(`Parsed - Size: ${size || 'null'} (valid: ${isSizeValid}), Color: ${color || 'null'} (valid: ${isColorValid})`);
  
  // Build specific error message based on what's missing
  let missingFields = [];
  if (!name) missingFields.push('নাম');
  if (!isPhoneValid) missingFields.push('সঠিক ফোন নম্বর');
  if (!address) missingFields.push('ঠিকানা');
  if (requiresSize && !isSizeValid) missingFields.push(`সাইজ (${availableSizes.join('/')})`);
  if (requiresColor && !isColorValid) missingFields.push(`কালার (${availableColors.join('/')})`);
  
  let errorMsg = settings?.quick_form_error || 
    `দুঃখিত, আমি আপনার তথ্যটি সঠিকভাবে বুঝতে পারিনি। ${emoji ? '😔' : ''}`;
  
  // Add specific missing fields
  if (missingFields.length > 0) {
    errorMsg += `\n\n❌ Missing: ${missingFields.join(', ')}`;
  }
  
  // Build format example
  let formatExample = `\n\nঅনুগ্রহ করে নিচের ফর্ম্যাটে আবার দিন:\n\nনাম: আপনার নাম\nফোন: 017XXXXXXXX\nঠিকানা: আপনার সম্পূর্ণ ঠিকানা`;
  
  if (requiresSize) {
    formatExample += `\nসাইজ: ${availableSizes.join('/')}`;
  }
  if (requiresColor) {
    formatExample += `\nকালার: ${availableColors.join('/')}`;
  }
  
  errorMsg += formatExample;
  
  return {
    matched: true,
    action: 'CONFIRM',
    response: emoji ? errorMsg : errorMsg.replace(/😔|❌/g, ''),
    newState: 'AWAITING_CUSTOMER_DETAILS',
    updatedContext: {
      ...context,
      state: 'AWAITING_CUSTOMER_DETAILS',
    },
  };
}
