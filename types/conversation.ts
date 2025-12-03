/**
 * AI Director - Phase 1: Rich Conversation Types
 * 
 * This file defines the new, rich conversation context and state types
 * for the upgraded AI Director architecture.
 */

// ============================================
// CONVERSATION STATES
// ============================================

export type ConversationState =
  | 'IDLE'
  | 'CONFIRMING_PRODUCT'
  | 'COLLECTING_NAME'
  | 'COLLECTING_PHONE'
  | 'COLLECTING_ADDRESS'
  | 'COLLECTING_PAYMENT_DIGITS'
  | 'CONFIRMING_ORDER';

// ============================================
// CART ITEM
// ============================================

export interface CartItem {
  productId: string;
  productName: string;
  productPrice: number;
  quantity: number;
  imageUrl?: string;
  variations?: Record<string, string>; // e.g., { size: 'L', color: 'Red' }
}

// ============================================
// CHECKOUT INFORMATION
// ============================================

export interface CheckoutInfo {
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  deliveryCharge?: number;
  totalAmount?: number;
  paymentMethod?: 'cod' | 'bkash' | 'nagad' | 'bank';
  paymentLastTwoDigits?: string;
}

// ============================================
// CONVERSATION METADATA
// ============================================

export interface ConversationMetadata {
  /** Last image hash sent by user (for learning mode) */
  lastImageHash?: string;
  
  /** Last image URL sent by user */
  lastImageUrl?: string;
  
  /** Last product viewed/searched */
  lastProductId?: string;
  
  /** Conversation start time */
  startedAt?: string;
  
  /** Total messages in this conversation */
  messageCount?: number;
  
  /** User's preferred language (detected) */
  preferredLanguage?: 'bn' | 'en' | 'mixed';
  
  /** Whether user has completed an order before */
  isReturningCustomer?: boolean;
}

// ============================================
// RICH CONVERSATION CONTEXT
// ============================================

/**
 * Rich conversation context that stores the complete state
 * of the conversation including cart, checkout, and metadata.
 * 
 * This is stored in the `context` JSONB column in the database.
 */
export interface ConversationContext {
  /** Current conversation state */
  state: ConversationState;
  
  /** Shopping cart (supports multiple items) */
  cart: CartItem[];
  
  /** Checkout information */
  checkout: CheckoutInfo;
  
  /** Additional metadata */
  metadata: ConversationMetadata;
  
  // ============================================
  // LEGACY FIELDS (for backward compatibility)
  // These will be deprecated in Phase 2
  // ============================================
  
  /** @deprecated Use cart[0].productId instead */
  productId?: string;
  
  /** @deprecated Use cart[0].productName instead */
  productName?: string;
  
  /** @deprecated Use cart[0].productPrice instead */
  productPrice?: number;
  
  /** @deprecated Use checkout.customerName instead */
  customerName?: string;
  
  /** @deprecated Use checkout.customerPhone instead */
  customerPhone?: string;
  
  /** @deprecated Use checkout.customerAddress instead */
  customerAddress?: string;
  
  /** @deprecated Use checkout.deliveryCharge instead */
  deliveryCharge?: number;
  
  /** @deprecated Use checkout.totalAmount instead */
  totalAmount?: number;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Creates an empty conversation context with default values
 */
export function createEmptyContext(): ConversationContext {
  return {
    state: 'IDLE',
    cart: [],
    checkout: {},
    metadata: {
      messageCount: 0,
    },
  };
}

/**
 * Calculates the total amount for the cart
 */
export function calculateCartTotal(cart: CartItem[]): number {
  return cart.reduce((total, item) => {
    return total + (item.productPrice * item.quantity);
  }, 0);
}

/**
 * Adds an item to the cart or updates quantity if it already exists
 */
export function addToCart(
  cart: CartItem[],
  item: CartItem
): CartItem[] {
  const existingIndex = cart.findIndex(
    (i) => i.productId === item.productId
  );

  if (existingIndex >= 0) {
    // Update quantity
    const newCart = [...cart];
    newCart[existingIndex] = {
      ...newCart[existingIndex],
      quantity: newCart[existingIndex].quantity + item.quantity,
    };
    return newCart;
  } else {
    // Add new item
    return [...cart, item];
  }
}

/**
 * Removes an item from the cart
 */
export function removeFromCart(
  cart: CartItem[],
  productId: string
): CartItem[] {
  return cart.filter((item) => item.productId !== productId);
}

/**
 * Migrates legacy context to new rich structure
 * This ensures backward compatibility with existing conversations
 */
export function migrateLegacyContext(
  oldContext: Partial<ConversationContext>
): ConversationContext {
  const newContext: ConversationContext = createEmptyContext();
  
  // Preserve state
  newContext.state = oldContext.state || 'IDLE';
  
  // Migrate product to cart if exists
  if (oldContext.productId && oldContext.productName && oldContext.productPrice) {
    newContext.cart = [{
      productId: oldContext.productId,
      productName: oldContext.productName,
      productPrice: oldContext.productPrice,
      quantity: 1,
    }];
  } else if (oldContext.cart) {
    newContext.cart = oldContext.cart;
  }
  
  // Migrate checkout info
  newContext.checkout = {
    customerName: oldContext.customerName || oldContext.checkout?.customerName,
    customerPhone: oldContext.customerPhone || oldContext.checkout?.customerPhone,
    customerAddress: oldContext.customerAddress || oldContext.checkout?.customerAddress,
    deliveryCharge: oldContext.deliveryCharge || oldContext.checkout?.deliveryCharge,
    totalAmount: oldContext.totalAmount || oldContext.checkout?.totalAmount,
    paymentMethod: oldContext.checkout?.paymentMethod,
  };
  
  // Preserve metadata if exists
  if (oldContext.metadata) {
    newContext.metadata = { ...newContext.metadata, ...oldContext.metadata };
  }
  
  // Keep legacy fields for backward compatibility
  newContext.productId = oldContext.productId;
  newContext.productName = oldContext.productName;
  newContext.productPrice = oldContext.productPrice;
  newContext.customerName = oldContext.customerName;
  newContext.customerPhone = oldContext.customerPhone;
  newContext.customerAddress = oldContext.customerAddress;
  newContext.deliveryCharge = oldContext.deliveryCharge;
  newContext.totalAmount = oldContext.totalAmount;
  
  return newContext;
}
