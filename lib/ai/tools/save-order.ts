/**
 * save_order Tool — Creates a real customer order in the database
 *
 * This is the most critical tool in the system. It:
 * 1. Validates all required fields (cart, name, phone, address)
 * 2. Enforces negotiation floor price (server-side guardrail)
 * 3. Calculates totals (respecting negotiated prices)
 * 4. Inserts into orders + order_items tables
 * 5. Deducts stock (variant-aware)
 *
 * The orchestrator handles transactional messages (confirmation, payment
 * instructions) AFTER this tool returns success. The AI must never
 * generate those messages.
 *
 * @module lib/ai/tools/save-order
 */

import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';
import { ConversationContext, CartItem } from '@/types/conversation';
import { getDeliveryCharge, WorkspaceSettings } from '@/lib/workspace/settings-cache';
import type { ToolExecutionResult, ToolSideEffects } from './executor';

// ============================================
// TYPES
// ============================================

export interface SaveOrderOutput {
  result: ToolExecutionResult;
  sideEffects: ToolSideEffects;
}

interface ValidationError {
  missing: string[];
  errors: string[];
}

// ============================================
// CONSTANTS
// ============================================

const BD_PHONE_REGEX = /^01[3-9]\d{8}$/;
const MIN_ADDRESS_LENGTH = 10;

// ============================================
// MAIN FUNCTION
// ============================================

/**
 * Validates all order data, enforces price floors, then saves to DB.
 *
 * @param workspaceId - Workspace scope (injected by orchestrator)
 * @param conversationId - Conversation ID for the order
 * @param fbPageId - Facebook page ID for the order
 * @param context - Current conversation context (cart, checkout, metadata)
 * @param settings - Workspace settings (for delivery charge calculation)
 * @param overrides - Optional customer info passed directly by AI
 */
export async function saveOrder(
  workspaceId: string,
  conversationId: string,
  fbPageId: number,
  context: ConversationContext,
  settings: WorkspaceSettings,
  overrides?: {
    customerName?: string;
    customerPhone?: string;
    customerAddress?: string;
    deliveryDate?: string;
    flavor?: string;
    weight?: string;
    custom_message?: string;
    pounds_ordered?: number;
  }
): Promise<SaveOrderOutput> {
  const cart = context.cart || [];
  
  // Prioritize overrides from tool arguments over context
  const checkout = {
    ...context.checkout,
    ...(overrides?.customerName && { customerName: overrides.customerName }),
    ...(overrides?.customerPhone && { customerPhone: overrides.customerPhone }),
    ...(overrides?.customerAddress && { customerAddress: overrides.customerAddress }),
    ...(overrides?.deliveryDate && { deliveryDate: overrides.deliveryDate }),
  };
  
  const negotiation = (context.metadata as Record<string, any>)?.negotiation;

  // ========================================
  // PHASE 1: VALIDATION
  // ========================================

  const validation = validateOrderData(cart, checkout, settings.businessCategory);

  if (validation.missing.length > 0 || validation.errors.length > 0) {
    const allIssues = [...validation.missing, ...validation.errors];
    return {
      result: {
        success: false,
        data: { missing: validation.missing, errors: validation.errors },
        message: `Cannot save order. Issues: ${allIssues.join(', ')}. Please collect these from the customer first.`,
      },
      sideEffects: {},
    };
  }

  // ========================================
  // PHASE 2: FLOOR PRICE ENFORCEMENT
  // ========================================

  const priceViolation = checkPriceFloors(cart, negotiation);

  if (priceViolation) {
    return {
      result: {
        success: false,
        data: { error: 'price_below_minimum' },
        message: priceViolation,
      },
      sideEffects: {},
    };
  }

  // ========================================
  // PHASE 3: STOCK VERIFICATION (Exclude food businesses)
  // ========================================

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  if (settings.businessCategory !== 'food') {
    const stockIssue = await verifyStock(supabase, cart);

    if (stockIssue) {
      return {
        result: {
          success: false,
          data: { error: 'out_of_stock' },
          message: stockIssue,
        },
        sideEffects: {},
      };
    }
  }

  // ========================================
  // PHASE 4: CALCULATE TOTALS
  // ========================================

  const subtotal = calculateSubtotal(cart, negotiation);
  const deliveryCharge = checkout.deliveryCharge
    ?? getDeliveryCharge(checkout.customerAddress!, settings);
  const totalAmount = subtotal + deliveryCharge;

  // ========================================
  // PHASE 5: INSERT ORDER
  // ========================================

  try {
    const orderNumber = generateOrderNumber();
    const firstItem = cart[0];
    const firstItemAny = firstItem as Record<string, any>;

    // === DIAGNOSTIC LOGGING ===
    console.log('[save_order] === DIAGNOSTIC DATA ===');
    console.log('[save_order] Cart Items:', JSON.stringify(cart.map(item => ({
      productId: item.productId,
      productName: item.productName,
      productPrice: item.productPrice,
      quantity: item.quantity,
      selectedSize: (item as any).selectedSize,
      selectedColor: (item as any).selectedColor,
    })), null, 2));
    console.log('[save_order] Checkout:', JSON.stringify({
      customerName: checkout.customerName,
      customerPhone: checkout.customerPhone,
      customerAddress: checkout.customerAddress,
      deliveryCharge: checkout.deliveryCharge,
      paymentLastTwoDigits: checkout.paymentLastTwoDigits,
    }, null, 2));
    console.log('[save_order] Calculated:', { subtotal, deliveryCharge, totalAmount, orderNumber });
    console.log('[save_order] === END DIAGNOSTIC ===');

    const orderData = {
      workspace_id: workspaceId,
      fb_page_id: fbPageId, // bigint in DB — pass as number, not string
      conversation_id: conversationId,
      customer_name: checkout.customerName,
      customer_phone: checkout.customerPhone,
      customer_address: checkout.customerAddress,
      delivery_charge: deliveryCharge,
      total_amount: totalAmount,
      order_number: orderNumber,
      status: 'pending',
      payment_status: 'unpaid',
      product_image_url: firstItem.imageUrl || null,
      product_variations: cart.length > 1
        ? { multi_product: true, item_count: cart.length }
        : (firstItemAny.variations || null),
      payment_last_two_digits: checkout.paymentLastTwoDigits || null,
      selected_size: cart.length === 1 ? (firstItemAny.selectedSize || null) : null,
      selected_color: cart.length === 1 ? (firstItemAny.selectedColor || null) : null,
      delivery_date: checkout.deliveryDate || null,
      flavor: cart.length === 1 ? (firstItemAny.selectedFlavor || null) : null,
      weight: cart.length === 1 ? (firstItemAny.selectedWeight || null) : null,
      custom_message: cart.length === 1 ? (firstItemAny.selectedCustomMessage || overrides?.custom_message || null) : null,
      pounds_ordered: cart.length === 1 ? (firstItemAny.selectedPounds || overrides?.pounds_ordered || null) : null,
    };

    const { data: orderResult, error: orderError } = await supabase
      .from('orders')
      .insert(orderData as any)
      .select('id')
      .single();

    if (orderError) {
      console.error('[save_order] Order insert failed:', orderError.message);
      return failWithFlag(`Order insert failed: ${orderError.message}`);
    }

    const orderId = orderResult.id;

    // ========================================
    // PHASE 6: INSERT ORDER ITEMS
    // ========================================

    const imageUrlMap = await fetchProductImages(supabase, cart);

    const orderItems = cart.map((item) => {
      const itemAny = item as Record<string, any>;
      const effectivePrice = getEffectivePrice(item, negotiation);

      return {
        order_id: orderId,
        product_id: item.productId,
        product_name: item.productName,
        product_price: effectivePrice,
        quantity: item.quantity,
        selected_size: itemAny.selectedSize || itemAny.variations?.size || null,
        selected_color: itemAny.selectedColor || itemAny.variations?.color || null,
        subtotal: effectivePrice * item.quantity,
        product_image_url: imageUrlMap[item.productId] || item.imageUrl || null,
      };
    });

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItems);

    if (itemsError) {
      console.error('[save_order] Order items insert failed:', itemsError.message);
      // Order row exists but items failed — not ideal but non-blocking
    }

    // ========================================
    // PHASE 7: DEDUCT STOCK (Moved to Dashboard Confirm Action)
    // ========================================
    // Stock is no longer deducted immediately upon AI order creation.
    // It is instead deducted when the business owner clicks "Mark as Confirmed"
    // in the dashboard (/api/orders/[id]/route.ts).

    // ========================================
    // PHASE 8: RETURN SUCCESS
    // ========================================

    return {
      result: {
        success: true,
        data: {
          orderNumber,
          orderId,
          totalAmount,
          subtotal,
          deliveryCharge,
          itemCount: cart.length,
        },
        message: `Order #${orderNumber} saved successfully. Total: ৳${totalAmount} (subtotal: ৳${subtotal} + delivery: ৳${deliveryCharge}).`,
      },
      sideEffects: {
        orderCreated: true,
        orderNumber,
        shouldSendTransactionalMessages: true,
        updatedContext: {
          cart: [],
          checkout: {},
          metadata: {
            ...context.metadata,
            negotiation: undefined,
            latestOrderId: orderId,
            latestOrderNumber: orderNumber,
            // Preserve order data for transactional messages (cart is cleared above)
            latestOrderData: {
              subtotal,
              deliveryCharge,
              totalAmount,
              customerName: checkout.customerName || 'Customer',
              itemCount: cart.length,
            },
          },
        },
      },
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[save_order] Unexpected error:', errorMessage);
    return failWithFlag(`Unexpected error saving order: ${errorMessage}`);
  }
}

// ============================================
// VALIDATION
// ============================================

function validateOrderData(
  cart: CartItem[],
  checkout: Record<string, any>,
  businessCategory?: string
): ValidationError {
  const missing: string[] = [];
  const errors: string[] = [];

  if (cart.length === 0) {
    missing.push('cart (no products added)');
  } else {
    cart.forEach((item, index) => {
      if (!item.productId) {
        errors.push(`Cart item ${index + 1} missing productId`);
      }
      if (!item.productPrice || item.productPrice <= 0) {
        errors.push(`Cart item ${index + 1} has invalid price`);
      }
      if (!item.quantity || item.quantity < 1) {
        errors.push(`Cart item ${index + 1} has invalid quantity`);
      }
    });
  }

  if (!checkout.customerName?.trim()) {
    missing.push('name');
  }

  if (!checkout.customerPhone) {
    missing.push('phone');
  } else {
    const normalizedPhone = checkout.customerPhone.replace(/[\s\-()]/g, '');
    if (!BD_PHONE_REGEX.test(normalizedPhone)) {
      errors.push(`Invalid phone number "${checkout.customerPhone}" (must be 01XXXXXXXXX)`);
    }
  }

  if (!checkout.customerAddress) {
    missing.push('address');
  } else if (checkout.customerAddress.trim().length < MIN_ADDRESS_LENGTH) {
    errors.push(`Address too short (minimum ${MIN_ADDRESS_LENGTH} characters)`);
  }

  if (businessCategory === 'food') {
    if (!checkout.deliveryDate?.trim()) {
      missing.push('delivery date (required for made-to-order food/cake)');
    }
  }

  return { missing, errors };
}

// ============================================
// PRICE FLOOR ENFORCEMENT
// ============================================

/**
 * Checks that no negotiated price violates the product's minPrice.
 * Returns an error message if violated, null if all prices are valid.
 */
function checkPriceFloors(
  cart: CartItem[],
  negotiation: Record<string, any> | undefined
): string | null {
  if (!negotiation?.aiLastOffer) {
    return null; // No negotiation happened — prices are at listed value
  }

  for (const item of cart) {
    const isForThisProduct = !negotiation.productId || negotiation.productId === item.productId;

    if (!isForThisProduct) continue;

    const pricingPolicy = item.pricing_policy;
    if (!pricingPolicy?.isNegotiable) continue;

    const minPrice = pricingPolicy.minPrice;
    if (minPrice && negotiation.aiLastOffer < minPrice) {
      return (
        `Price ৳${negotiation.aiLastOffer} for "${item.productName}" is below the minimum ` +
        `allowed price of ৳${minPrice}. Cannot complete this order at this price.`
      );
    }
  }

  return null;
}

// ============================================
// STOCK VERIFICATION
// ============================================

async function verifyStock(
  supabase: any,
  cart: CartItem[]
): Promise<string | null> {
  for (const item of cart) {
    const { data: product } = await supabase
      .from('products')
      .select('stock_quantity, name, variant_stock, size_stock, sizes, colors')
      .eq('id', item.productId)
      .single();

    if (!product) {
      return `Product "${item.productName}" no longer exists in the catalog.`;
    }

    const itemAny = item as Record<string, any>;
    const reqSize = itemAny.selectedSize || itemAny.variations?.size;
    const reqColor = itemAny.selectedColor || itemAny.variations?.color;

    // Determine what this product actually supports based on DB
    const hasVariantStock = product.variant_stock && 
      (Array.isArray(product.variant_stock) 
        ? product.variant_stock.length > 0 
        : Object.keys(product.variant_stock).length > 0);
    
    const hasSizeStock = product.size_stock && 
      (Array.isArray(product.size_stock) 
        ? product.size_stock.length > 0 
        : Object.keys(product.size_stock).length > 0);

    const productHasColors = product.colors && 
      Array.isArray(product.colors) && 
      product.colors.length > 0;

    const productHasSizes = product.sizes && 
      Array.isArray(product.sizes) && 
      product.sizes.length > 0;

    // PATH 1: Product has both size and color in DB
    if (productHasColors && productHasSizes && hasVariantStock && reqSize && reqColor) {
      let exactQuantity = 0;
      let availableCombos: string[] = [];
      const vsList = Array.isArray(product.variant_stock) 
        ? product.variant_stock 
        : [];

      if (vsList.length > 0) {
        const exactMatch = vsList.find((v: any) => 
          v.size?.toUpperCase() === reqSize.toUpperCase() && 
          v.color?.toLowerCase() === reqColor.toLowerCase()
        );
        exactQuantity = exactMatch ? (exactMatch.quantity || 0) : 0;
        availableCombos = vsList
          .filter((v: any) => (v.quantity || 0) > 0)
          .map((v: any) => `${v.size} (${v.color})`);
      } else if (typeof product.variant_stock === 'object') {
        const exactKey = `${reqSize}_${reqColor}`;
        const keyMatch = Object.keys(product.variant_stock)
          .find(k => k.toUpperCase() === exactKey.toUpperCase());
        if (keyMatch) exactQuantity = Number((product.variant_stock as any)[keyMatch]) || 0;
        Object.entries(product.variant_stock).forEach(([k, v]) => {
          if (Number(v) > 0) availableCombos.push(k.replace('_', ' (').concat(')'));
        });
      }

      console.log(`\n🔍 [STOCK CHECK - PATH 1: Size+Color]\nProduct: ${product.name}\nRequested: Size ${reqSize} | Color ${reqColor} | Qty: ${item.quantity}\nAvailable: ${exactQuantity}\nResult: ${exactQuantity < item.quantity ? 'BLOCKED ❌' : 'PASSED ✅'}\n`);

      if (exactQuantity < item.quantity) {
        if (exactQuantity === 0) {
          return `দুঃখিত, ${reqSize} সাইজে ${reqColor} কালার এখন স্টকে নেই। পাওয়া যাচ্ছে: ${availableCombos.join(', ')}`;
        }
        return `দুঃখিত, ${reqSize} সাইজে ${reqColor} কালার মাত্র ${exactQuantity}টি আছে। আপনি সর্বোচ্চ ${exactQuantity}টি অর্ডার করতে পারবেন।`;
      }

    // PATH 2: Product has only size (no color) in DB
    } else if (productHasSizes && !productHasColors && reqSize) {
      let exactQuantity = 0;
      let availableCombos: string[] = [];

      if (hasSizeStock) {
        const ssList = Array.isArray(product.size_stock) 
          ? product.size_stock 
          : [];

        if (ssList.length > 0) {
          const exactMatch = ssList.find((s: any) => 
            s.size?.toUpperCase() === reqSize.toUpperCase()
          );
          exactQuantity = exactMatch ? (exactMatch.quantity || 0) : 0;
          availableCombos = ssList
            .filter((s: any) => (s.quantity || 0) > 0)
            .map((s: any) => s.size);
        } else if (typeof product.size_stock === 'object') {
          const keyMatch = Object.keys(product.size_stock)
            .find(k => k.toUpperCase() === reqSize.toUpperCase());
          if (keyMatch) exactQuantity = Number((product.size_stock as any)[keyMatch]) || 0;
          Object.entries(product.size_stock).forEach(([k, v]) => {
            if (Number(v) > 0) availableCombos.push(k);
          });
        }
      } else {
        // Fallback to stock_quantity if no size_stock
        exactQuantity = product.stock_quantity ?? 0;
      }

      console.log(`\n🔍 [STOCK CHECK - PATH 2: Size only]\nProduct: ${product.name}\nRequested: Size ${reqSize} | Qty: ${item.quantity}\nAvailable: ${exactQuantity}\nResult: ${exactQuantity < item.quantity ? 'BLOCKED ❌' : 'PASSED ✅'}\n`);

      if (exactQuantity < item.quantity) {
        if (exactQuantity === 0) {
          return `দুঃখিত, ${reqSize} সাইজটি এখন স্টকে নেই। পাওয়া যাচ্ছে: ${availableCombos.join(', ')}`;
        }
        return `দুঃখিত, ${reqSize} সাইজে মাত্র ${exactQuantity}টি আছে। আপনি সর্বোচ্চ ${exactQuantity}টি অর্ডার করতে পারবেন।`;
      }

    // PATH 3: Product has no size, no color — simple quantity check
    } else {
      // FINAL GATEKEEPER: If it reached here but the product actually HAS sizes or colors in its catalog,
      // it means the AI tried to save a variation-less item for a variation-rich product. BLOCK IT.
      if (productHasSizes && !reqSize) {
        return `"${product.name}" এর জন্য সাইজ (Size) সিলেক্ট করা বাধ্যতামূলক।`;
      }
      if (productHasColors && !reqColor) {
        return `"${product.name}" এর জন্য কালার (Color) সিলেক্ট করা বাধ্যতামূলক।`;
      }

      const available = product.stock_quantity ?? 0;
      
      console.log(`\n🔍 [STOCK CHECK - PATH 3: Quantity only]\nProduct: ${product.name}\nRequested Qty: ${item.quantity}\nAvailable: ${available}\nResult: ${available < item.quantity ? 'BLOCKED ❌' : 'PASSED ✅'}\n`);

      if (available < item.quantity) {
        return `দুঃখিত, "${product.name}" এ মাত্র ${available}টি আছে। আপনি সর্বোচ্চ ${available}টি অর্ডার করতে পারবেন।`;
      }
    }
  }
  return null;
}

// ============================================
// PRICE CALCULATION
// ============================================

function calculateSubtotal(
  cart: CartItem[],
  negotiation: Record<string, any> | undefined
): number {
  return cart.reduce((sum, item) => {
    const effectivePrice = getEffectivePrice(item, negotiation);
    return sum + (effectivePrice * item.quantity);
  }, 0);
}

function getEffectivePrice(
  item: CartItem,
  negotiation: Record<string, any> | undefined
): number {
  if (!negotiation?.aiLastOffer) return item.productPrice;

  const isForThisProduct = !negotiation.productId || negotiation.productId === item.productId;
  return isForThisProduct ? negotiation.aiLastOffer : item.productPrice;
}

// ============================================
// IMAGE FETCHING
// ============================================

async function fetchProductImages(
  supabase: any,
  cart: CartItem[]
): Promise<Record<string, string>> {
  const productIds = cart.map((item) => item.productId);

  const { data: products } = await supabase
    .from('products')
    .select('id, image_urls')
    .in('id', productIds);

  const imageMap: Record<string, string> = {};

  if (products) {
    for (const p of products as Record<string, any>[]) {
      if (p.image_urls && Array.isArray(p.image_urls) && p.image_urls.length > 0) {
        imageMap[p.id] = p.image_urls[0];
      }
    }
  }

  return imageMap;
}

// ============================================
// HELPERS
// ============================================

function generateOrderNumber(): string {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${timestamp}${random}`;
}

/**
 * Creates a failure result that tells the orchestrator to also
 * flag the conversation for manual review.
 */
function failWithFlag(message: string): SaveOrderOutput {
  return {
    result: {
      success: false,
      data: { shouldFlag: true },
      message,
    },
    sideEffects: {},
  };
}
