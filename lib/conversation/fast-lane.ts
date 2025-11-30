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

// ============================================
// TYPES
// ============================================

export interface FastLaneResult {
  /** Whether the fast lane matched this input */
  matched: boolean;
  
  /** Action to take (if matched) */
  action?: 'CONFIRM' | 'DECLINE' | 'COLLECT_NAME' | 'COLLECT_PHONE' | 'COLLECT_ADDRESS' | 'GREETING';
  
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

// Confirmation patterns
const YES_PATTERNS = [
  /^(yes|yep|yeah|yup|sure|ok|okay|y)$/i,
  /^(ji|jii|hae|haan|ha|hum)$/i,
  /^(হ্যাঁ|জি|ঠিক আছে|আছে|হুম)$/i,
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
  
  // Check for YES
  if (YES_PATTERNS.some(pattern => pattern.test(input))) {
    const message = settings?.fastLaneMessages?.productConfirm || 
      `${emoji ? 'দারুণ! 🎉' : 'দারুণ!'}\n\nআপনার সম্পূর্ণ নামটি বলবেন?\n(Example: Zayed Bin Hamid)`;
    
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
 * Handles COLLECTING_PHONE state (phone number validation)
 */
function handleCollectingPhone(
  input: string,
  context: ConversationContext,
  settings?: WorkspaceSettings
): FastLaneResult {
  const emoji = settings?.useEmojis ?? true;
  
  // Remove spaces and check against patterns
  const cleanedInput = input.replace(/\s/g, '');
  
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
        newState: 'COLLECTING_ADDRESS',
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
  
  return { matched: false };
}

/**
 * Handles COLLECTING_ADDRESS state (address validation)
 */
function handleCollectingAddress(
  input: string,
  context: ConversationContext,
  settings?: WorkspaceSettings
): FastLaneResult {
  // Simple heuristic: address should be at least 10 characters
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
      totalAmount
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
      action: 'CONFIRM',
      response: emoji ? message : message.replace(/[🎉😊📱📍✅]/g, ''),
      newState: 'IDLE',
      updatedContext: {
        state: 'IDLE',
        // Keep cart and checkout for order creation
        // Will be cleared after order is saved
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
 * Generates order summary message
 */
function generateOrderSummary(
  customerName: string,
  cart: CartItem[],
  address: string,
  deliveryCharge: number,
  totalAmount: number
): string {
  const cartTotal = calculateCartTotal(cart);
  
  let summary = `📦 Order Summary\n`;
  summary += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  summary += `👤 Name: ${customerName}\n`;
  summary += `📍 Address: ${address}\n\n`;
  
  summary += `🛍️ Items:\n`;
  cart.forEach((item, index) => {
    summary += `${index + 1}. ${item.productName}\n`;
    summary += `   ৳${item.productPrice} × ${item.quantity} = ৳${item.productPrice * item.quantity}\n`;
  });
  
  summary += `\n💰 Pricing:\n`;
  summary += `• Subtotal: ৳${cartTotal}\n`;
  summary += `• Delivery: ৳${deliveryCharge}\n`;
  summary += `• Total: ৳${totalAmount}\n\n`;
  
  summary += `━━━━━━━━━━━━━━━━━━━━\n`;
  summary += `Confirm this order? (YES/NO) ✅`;
  
  return summary;
}
