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
  | 'SELECTING_CART_ITEMS'  // NEW: Multi-product selection
  | 'COLLECTING_MULTI_VARIATIONS'  // NEW: Size/color for each product
  | 'COLLECTING_NAME'
  | 'COLLECTING_PHONE'
  | 'COLLECTING_ADDRESS'
  | 'COLLECTING_PAYMENT_DIGITS'
  | 'CONFIRMING_ORDER'
  | 'AWAITING_CUSTOMER_DETAILS';  // NEW: Quick form state

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
  // Available options for the product (for Quick Form prompts)
  sizes?: string[];
  colors?: string[];
  // Selected values
  selectedSize?: string;
  selectedColor?: string;
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
// PENDING IMAGE (for multi-product batching)
// ============================================

/**
 * Represents a pending product image that's been recognized
 * but not yet added to cart (waiting for batch confirmation)
 */
export interface PendingImage {
  /** Image URL from Facebook */
  url: string;
  
  /** Timestamp when image was received (ms since epoch) */
  timestamp: number;
  
  /** Recognition result from image processing */
  recognitionResult: {
    success: boolean;
    productId?: string;
    productName?: string;
    productPrice?: number;
    imageUrl?: string;
    confidence?: number;
    tier?: string;
    sizes?: string[];
    colors?: string[];
  };
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
  // IMAGE QUEUE (for multi-product batching)
  // ============================================
  
  /** Pending images waiting for batch confirmation (max 5) */
  pendingImages?: PendingImage[];
  
  /** Timestamp of last image received (for 5-min window) */
  lastImageReceivedAt?: number;
  
  // ============================================
  // MULTI-VARIATION COLLECTION
  // ============================================
  
  /** Current cart item index for variation collection (0-based) */
  currentVariationIndex?: number;
  
  /** Whether we're collecting size (true) or color (false) for current item */
  collectingSize?: boolean;
  
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
  
  // ============================================
  // SIZE/COLOR SELECTION (for Quick Form)
  // ============================================
  
  /** Selected size from Quick Form parsing */
  selectedSize?: string;
  
  /** Selected color from Quick Form parsing */
  selectedColor?: string;
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
    pendingImages: [],
    lastImageReceivedAt: undefined,
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
  
  // Preserve pending images if they exist
  newContext.pendingImages = oldContext.pendingImages || [];
  newContext.lastImageReceivedAt = oldContext.lastImageReceivedAt;
  
  return newContext;
}

// ============================================
// IMAGE QUEUE HELPER FUNCTIONS
// ============================================

/** Maximum number of products in a single order */
export const MAX_PENDING_IMAGES = 5;

/** Time window for batching images (5 minutes in ms) */
export const BATCH_WINDOW_MS = 5 * 60 * 1000;

/** Timeout for expired batch (10 minutes in ms) */
export const BATCH_EXPIRY_MS = 10 * 60 * 1000;

/**
 * Adds a pending image to the queue
 * Returns updated pendingImages array (max 5 items)
 */
export function addPendingImage(
  pendingImages: PendingImage[],
  newImage: PendingImage
): { images: PendingImage[]; wasLimited: boolean } {
  const current = pendingImages || [];
  
  // Check if we already have this product (avoid duplicates)
  const existingIndex = current.findIndex(
    (img) => img.recognitionResult.productId === newImage.recognitionResult.productId
  );
  
  if (existingIndex >= 0) {
    // Update existing entry with new timestamp
    const updated = [...current];
    updated[existingIndex] = { ...newImage };
    return { images: updated, wasLimited: false };
  }
  
  // Check if at limit
  if (current.length >= MAX_PENDING_IMAGES) {
    return { images: current, wasLimited: true };
  }
  
  return { images: [...current, newImage], wasLimited: false };
}

/**
 * Clears all pending images
 */
export function clearPendingImages(): PendingImage[] {
  return [];
}

/**
 * Checks if we're within the 5-minute batch window
 */
export function isWithinBatchWindow(lastImageReceivedAt?: number): boolean {
  if (!lastImageReceivedAt) return false;
  const elapsed = Date.now() - lastImageReceivedAt;
  return elapsed < BATCH_WINDOW_MS;
}

/**
 * Checks if the batch has expired (10+ minutes since last image)
 */
export function isBatchExpired(lastImageReceivedAt?: number): boolean {
  if (!lastImageReceivedAt) return true;
  const elapsed = Date.now() - lastImageReceivedAt;
  return elapsed >= BATCH_EXPIRY_MS;
}

/**
 * Gets successfully recognized products from pending images
 */
export function getRecognizedProducts(pendingImages: PendingImage[]): PendingImage[] {
  return (pendingImages || []).filter(img => img.recognitionResult.success);
}
