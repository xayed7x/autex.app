/**
 * Tool Executor — Dispatches and executes AI agent tool calls
 *
 * This is the bridge between what the AI decides to do and what
 * actually happens in the system. Every tool call is:
 * - Scoped to the correct workspaceId (injected, never from AI)
 * - Validated before execution
 * - Returns a structured result the AI can reason about
 *
 * @module lib/ai/tools/executor
 */

import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';
import { ConversationContext, CartItem, addToCart, removeFromCart } from '@/types/conversation';
import { getDeliveryCharge, WorkspaceSettings } from '@/lib/workspace/settings-cache';
import { searchProducts } from './search-products';
import { getProductById } from '@/lib/db/products';
import { saveOrder } from './save-order';
import type { AgentToolName } from './definitions';

// ============================================
// TYPES
// ============================================

/** Result returned to the AI after a tool executes. */
export interface ToolExecutionResult {
  success: boolean;
  data: Record<string, unknown>;
  message: string;
}

/** Everything the executor needs to run tools in the right scope. */
export interface ToolExecutionContext {
  workspaceId: string;
  conversationId: string;
  conversationContext: ConversationContext;
  settings: WorkspaceSettings;
  fbPageId: number;
}

/** Tracks what changed after a tool runs, so the orchestrator can persist it. */
export interface ToolSideEffects {
  updatedContext?: Partial<ConversationContext>;
  orderCreated?: boolean;
  orderNumber?: string;
  shouldSendTransactionalMessages?: boolean;
}

/** Combined output from a tool execution. */
export interface ToolExecutionOutput {
  result: ToolExecutionResult;
  sideEffects: ToolSideEffects;
}

// ============================================
// PHONE VALIDATION
// ============================================

const BD_PHONE_REGEX = /^01[3-9]\d{8}$/;

function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-()]/g, '');
}

function isValidBDPhone(phone: string): boolean {
  return BD_PHONE_REGEX.test(normalizePhone(phone));
}

// ============================================
// MAIN EXECUTOR
// ============================================

/**
 * Executes a tool call from the AI agent.
 *
 * @param toolName - Name of the tool to execute
 * @param args - Arguments parsed from the AI's tool call
 * @param ctx - Execution context (workspaceId, settings, conversation state)
 * @returns Tool result for the AI + side effects for the orchestrator
 */
export async function executeTool(
  toolName: AgentToolName,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<ToolExecutionOutput> {
  switch (toolName) {
    case 'search_products':
      return executeSearchProducts(args, ctx);

    case 'add_to_cart':
      return executeAddToCart(args, ctx);

    case 'remove_from_cart':
      return executeRemoveFromCart(args, ctx);

    case 'update_customer_info':
      return executeUpdateCustomerInfo(args, ctx);

    case 'save_order':
      return executeSaveOrder(args, ctx);

    case 'flag_for_review':
      return executeFlagForReview(args, ctx);

    case 'check_stock':
      return executeCheckStock(args, ctx);

    case 'track_order':
      return executeTrackOrder(args, ctx);

    case 'calculate_delivery':
      return executeCalculateDelivery(args, ctx);

    case 'collect_payment_digits':
      return executeCollectPaymentDigits(args, ctx);

    case 'record_negotiation_attempt':
      return executeRecordNegotiationAttempt(args, ctx);

    default: {
      const exhaustiveCheck: never = toolName;
      return {
        result: {
          success: false,
          data: {},
          message: `Unknown tool: ${exhaustiveCheck}`,
        },
        sideEffects: {},
      };
    }
  }
}

// ============================================
// TOOL IMPLEMENTATIONS
// ============================================

async function executeSearchProducts(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<ToolExecutionOutput> {
  const query = String(args.query || '');
  const size = args.size ? String(args.size) : undefined;
  const color = args.color ? String(args.color) : undefined;
  const searchResult = await searchProducts(query, ctx.workspaceId, size, color);

  const sendCard = args.sendCard !== false;
  // Default true if not specified

  return {
    result: {
      success: searchResult.success,
      data: { products: searchResult.products },
      message: searchResult.message,
    },
    sideEffects: {
      updatedContext: {
        metadata: {
          ...ctx.conversationContext.metadata,
          identifiedProducts: sendCard 
            ? searchResult.products 
            : ctx.conversationContext.metadata
              ?.identifiedProducts,
          // If sendCard false: keep existing
          // identifiedProducts, don't overwrite
          // So orchestrator won't send new card
        },
      },
    },
  };
}

async function executeAddToCart(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<ToolExecutionOutput> {
  const productId = String(args.productId || '');
  const quantity = Number(args.quantity) || 1;
  const selectedSize = args.selectedSize ? String(args.selectedSize) : undefined;
  const selectedColor = args.selectedColor ? String(args.selectedColor) : undefined;
  const negotiatedPrice = args.negotiatedPrice ? Number(args.negotiatedPrice) : undefined;

  if (!productId) {
    return {
      result: { success: false, data: {}, message: 'Missing productId.' },
      sideEffects: {},
    };
  }

  // Fetch full product data to get name, price, sizes, colors, pricing_policy
  const product = await getProductById(productId, ctx.workspaceId);

  if (!product) {
    return {
      result: { success: false, data: {}, message: `Product "${productId}" not found in this store.` },
      sideEffects: {},
    };
  }

   const productAny = product as Record<string, any>;
  const stockQuantity = productAny.stock_quantity ?? 0;

  if (stockQuantity <= 0) {
    return {
      result: { success: false, data: { productName: productAny.name }, message: `"${productAny.name}" is currently out of stock.` },
      sideEffects: {},
    };
  }

  // Filter available sizes and colors to ONLY include those in stock
  let availableSizes = Array.isArray(productAny.sizes) ? [...productAny.sizes] : [];
  let availableColors = Array.isArray(productAny.colors) ? [...productAny.colors] : [];

  if (productAny.variant_stock && Array.isArray(productAny.variant_stock) && productAny.variant_stock.length > 0) {
    availableSizes = availableSizes.filter(size => 
      productAny.variant_stock.some((v: any) => v.size?.toUpperCase() === size.toUpperCase() && (v.quantity || 0) > 0)
    );
    availableColors = availableColors.filter(color => 
      productAny.variant_stock.some((v: any) => v.color?.toLowerCase() === color.toLowerCase() && (v.quantity || 0) > 0)
    );
  } else if (productAny.variant_stock && typeof productAny.variant_stock === 'object' && Object.keys(productAny.variant_stock).length > 0) {
    availableSizes = availableSizes.filter(size => {
      const keys = Object.keys(productAny.variant_stock).filter(k => k.toUpperCase().includes(size.toUpperCase()));
      return keys.some(k => Number((productAny.variant_stock as any)[k]) > 0);
    });
    availableColors = availableColors.filter(color => {
      const keys = Object.keys(productAny.variant_stock).filter(k => k.toLowerCase().includes(color.toLowerCase()));
      return keys.some(k => Number((productAny.variant_stock as any)[k]) > 0);
    });
  } else if (productAny.size_stock && Array.isArray(productAny.size_stock) && productAny.size_stock.length > 0) {
    availableSizes = availableSizes.filter(size => {
      const sv = productAny.size_stock.find((s: any) => s.size?.toUpperCase() === size.toUpperCase());
      return sv ? (sv.quantity || 0) > 0 : false;
    });
  }

  // Use negotiated price if provided and valid, otherwise use listed price
  const effectivePrice = (negotiatedPrice && negotiatedPrice > 0) 
    ? negotiatedPrice 
    : productAny.price;

  const newItem: CartItem = {
    productId: productAny.id,
    productName: productAny.name,
    productPrice: effectivePrice,
    quantity,
    imageUrl: Array.isArray(productAny.image_urls) && productAny.image_urls.length > 0
      ? productAny.image_urls[0]
      : undefined,
    sizes: availableSizes,
    colors: availableColors,
    variant_stock: productAny.variant_stock,
    selectedSize,
    selectedColor,
    pricing_policy: productAny.pricing_policy || { isNegotiable: false },
  };

  const updatedCart = addToCart(ctx.conversationContext.cart || [], newItem);

  // Build negotiation metadata if a negotiated price was used
  const negotiationMeta = (negotiatedPrice && negotiatedPrice > 0)
    ? { 
        aiLastOffer: negotiatedPrice, 
        productId: productAny.id,
        roundNumber: 1,
        currentPrice: productAny.price
      }
    : undefined;

  return {
    result: {
      success: true,
      data: {
        productName: productAny.name,
        price: effectivePrice,
        listedPrice: productAny.price,
        negotiatedPrice: negotiatedPrice || null,
        quantity,
        cartSize: updatedCart.length,
        sizes: newItem.sizes,
        colors: newItem.colors,
      },
      message: negotiatedPrice
        ? `Added "${productAny.name}" (negotiated: ৳${effectivePrice}, listed: ৳${productAny.price}) to cart. Cart now has ${updatedCart.length} item(s).`
        : `Added "${productAny.name}" (৳${effectivePrice}) to cart. Cart now has ${updatedCart.length} item(s).`,
    },
    sideEffects: {
      updatedContext: {
        cart: updatedCart,
        metadata: {
          ...ctx.conversationContext.metadata,
          negotiation: negotiationMeta, // Set negotiation if price was negotiated, reset otherwise
          identifiedProducts: [
            {
              id: productAny.id,
              name: productAny.name,
              price: effectivePrice,
              stock: stockQuantity,
              inStock: true,
              sizes: newItem.sizes,
              colors: newItem.colors,
              imageUrl: newItem.imageUrl || null,
              variantStock: productAny.variant_stock || null,
              sizeStock: productAny.size_stock || null,
            }
          ],
        },
      },
    },
  };
}

async function executeRemoveFromCart(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<ToolExecutionOutput> {
  const productId = String(args.productId || '');

  if (!productId) {
    return {
      result: { success: false, data: {}, message: 'Missing productId.' },
      sideEffects: {},
    };
  }

  const currentCart = ctx.conversationContext.cart || [];
  const itemToRemove = currentCart.find((item) => item.productId === productId);

  if (!itemToRemove) {
    return {
      result: { success: false, data: {}, message: `Product "${productId}" is not in the cart.` },
      sideEffects: {},
    };
  }

  const updatedCart = removeFromCart(currentCart, productId);

  return {
    result: {
      success: true,
      data: { removedProduct: itemToRemove.productName, cartSize: updatedCart.length },
      message: `Removed "${itemToRemove.productName}" from cart. Cart now has ${updatedCart.length} item(s).`,
    },
    sideEffects: {
      updatedContext: { cart: updatedCart },
    },
  };
}

async function executeUpdateCustomerInfo(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<ToolExecutionOutput> {
  const name = args.name ? String(args.name).trim() : undefined;
  const phone = args.phone ? String(args.phone).trim() : undefined;
  const address = args.address ? String(args.address).trim() : undefined;
  const size = args.size ? String(args.size).trim() : undefined;
  const color = args.color ? String(args.color).trim() : undefined;
  const quantity = args.quantity ? Number(args.quantity) : undefined;

  // Validate phone if provided
  if (phone && !isValidBDPhone(phone)) {
    return {
      result: {
        success: false,
        data: { invalidField: 'phone' },
        message: `Invalid phone number "${phone}". Must be a valid Bangladesh number (01XXXXXXXXX, 11 digits).`,
      },
      sideEffects: {},
    };
  }

  const currentCheckout = ctx.conversationContext.checkout || {};

  // --- POST-ORDER PROTECTION ---
  // If the customer updates info AFTER an order is already saved, flag for manual review
  try {
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: recentOrders } = await supabase
      .from('orders')
      .select('id, status, payment_last_two_digits')
      .eq('conversation_id', ctx.conversationId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1);

    if (recentOrders && recentOrders.length > 0 && recentOrders[0].payment_last_two_digits) {
      console.log(`🚩 [POST-ORDER UPDATE] Customer trying to update info after order ${recentOrders[0].id} is finalized. Flagging.`);
      return {
        result: { 
          success: false, 
          data: { shouldFlag: true }, 
          message: "আপনার অর্ডারটি ইতিমধ্যই কনফার্ম করা হয়েছে। তথ্য পরিবর্তন করতে চাইলে আমাদের টিম আপনার সাথে কথা বলবে। 😊" 
        },
        sideEffects: { shouldFlag: true },
      };
    }
  } catch (err) {
    console.error('Error checking recent orders:', err);
  }

  // Calculate delivery charge if address is provided
  let deliveryCharge = currentCheckout.deliveryCharge;
  if (address) {
    deliveryCharge = getDeliveryCharge(address, ctx.settings);
  }

  const updatedCheckout = {
    ...currentCheckout,
    ...(name && { customerName: name }),
    ...(phone && { customerPhone: normalizePhone(phone) }),
    ...(address && { customerAddress: address, deliveryCharge }),
  };

  const updatedFields: string[] = [];
  if (name) updatedFields.push(`name: "${name}"`);
  if (phone) updatedFields.push(`phone: "${normalizePhone(phone)}"`);
  if (address) updatedFields.push(`address: "${address}" (delivery: ৳${deliveryCharge})`);

  let updatedCart = ctx.conversationContext.cart ? [...ctx.conversationContext.cart] : [];
  if (updatedCart.length > 0 && (size || color || quantity)) {
    const item = updatedCart[0];
    const reqSize = size || item.selectedSize;
    const reqColor = color || item.selectedColor;
    const reqQuantity = quantity || item.quantity;
    
    // Validate stock if size/color specified
    if (reqSize) {
       const product = await getProductById(item.productId, ctx.workspaceId);
       if (product) {
          const productAny = product as Record<string, any>;
          if (reqSize && reqColor && productAny.variant_stock) {
             let exactQuantity = 0;
             let availableCombos: string[] = [];
             const vsList = Array.isArray(productAny.variant_stock) ? productAny.variant_stock : [];
             if (vsList.length > 0) {
                const exactMatch = vsList.find((v: any) => v.size?.toUpperCase() === reqSize.toUpperCase() && v.color?.toLowerCase() === reqColor.toLowerCase());
                exactQuantity = exactMatch ? (exactMatch.quantity || 0) : 0;
                availableCombos = vsList.filter((v: any) => (v.quantity || 0) > 0).map((v: any) => `${v.size} (${v.color})`);
             } else if (typeof productAny.variant_stock === 'object') {
                const exactKey = `${reqSize}_${reqColor}`;
                const keyMatch = Object.keys(productAny.variant_stock).find(k => k.toUpperCase() === exactKey.toUpperCase());
                if (keyMatch) exactQuantity = Number((productAny.variant_stock as any)[keyMatch]) || 0;
                Object.entries(productAny.variant_stock).forEach(([k, v]) => {
                   if (Number(v) > 0) availableCombos.push(k.replace('_', ' (').concat(')'));
                });
             }
             if (exactQuantity < reqQuantity) {
                if (exactQuantity === 0) {
                   return {
                      result: { success: false, data: { outOfStock: true }, message: `দুঃখিত, ${reqSize} সাইজে ${reqColor} কালার এখন স্টকে নেই। পাওয়া যাচ্ছে: ${availableCombos.join(', ')}` },
                      sideEffects: {}
                   };
                }
                return {
                   result: { success: false, data: { lowStock: true }, message: `দুঃখিত, ${reqSize} সাইজে ${reqColor} কালার মাত্র ${exactQuantity}টি আছে। আপনি সর্বোচ্চ ${exactQuantity}টি অর্ডার করতে পারবেন।` },
                   sideEffects: {}
                };
             }
          } else if (reqSize && productAny.size_stock) {
             let exactQuantity = 0;
             let availableCombos: string[] = [];
             const ssList = Array.isArray(productAny.size_stock) ? productAny.size_stock : [];
             if (ssList.length > 0) {
                const exactMatch = ssList.find((s: any) => s.size?.toUpperCase() === reqSize.toUpperCase());
                exactQuantity = exactMatch ? (exactMatch.quantity || 0) : 0;
                availableCombos = ssList.filter((s: any) => (s.quantity || 0) > 0).map((s: any) => s.size);
             } else if (typeof productAny.size_stock === 'object') {
                const keyMatch = Object.keys(productAny.size_stock).find(k => k.toUpperCase() === reqSize.toUpperCase());
                if (keyMatch) exactQuantity = Number((productAny.size_stock as any)[keyMatch]) || 0;
                Object.entries(productAny.size_stock).forEach(([k, v]) => {
                   if (Number(v) > 0) availableCombos.push(k);
                });
             }
             if (exactQuantity < reqQuantity) {
                if (exactQuantity === 0) {
                   return {
                      result: { success: false, data: { outOfStock: true }, message: `দুঃখিত, ${reqSize} সাইজটি এখন স্টকে নেই। পাওয়া যাচ্ছে: ${availableCombos.join(', ')}` },
                      sideEffects: {}
                   };
                }
                return {
                   result: { success: false, data: { lowStock: true }, message: `দুঃখিত, ${reqSize} সাইজ মাত্র ${exactQuantity}টি আছে। আপনি সর্বোচ্চ ${exactQuantity}টি অর্ডার করতে পারবেন।` },
                   sideEffects: {}
                };
             }
          }
       }
    }
    
    updatedCart[0] = {
      ...item,
      ...(size && { selectedSize: size }),
      ...(color && { selectedColor: color }),
      ...(quantity && { quantity: reqQuantity })
    };
    if (size) updatedFields.push(`size: "${size}"`);
    if (color) updatedFields.push(`color: "${color}"`);
    if (quantity) updatedFields.push(`quantity: ${reqQuantity}`);
  }

  return {
    result: {
      success: true,
      data: { updatedFields, checkout: updatedCheckout, cart: updatedCart },
      message: `Updated: ${updatedFields.join(', ')}.`,
    },
    sideEffects: {
      updatedContext: { checkout: updatedCheckout, cart: updatedCart },
    },
  };
}

/**
 * save_order — Delegates to the full implementation in save-order.ts.
 * Handles validation, floor price checks, stock verification, DB insert,
 * and stock deduction. See save-order.ts for complete logic.
 */
async function executeSaveOrder(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<ToolExecutionOutput> {
  const customerName = args.customerName ? String(args.customerName) : undefined;
  const customerPhone = args.customerPhone ? String(args.customerPhone) : undefined;
  const customerAddress = args.customerAddress ? String(args.customerAddress) : undefined;

  const result = await saveOrder(
    ctx.workspaceId,
    ctx.conversationId,
    ctx.fbPageId,
    ctx.conversationContext,
    ctx.settings,
    { customerName, customerPhone, customerAddress }
  );

  // If order was successful, reset negotiation rounds
  if (result.result.success) {
    if (!result.sideEffects.updatedContext) result.sideEffects.updatedContext = {};
    if (!result.sideEffects.updatedContext.metadata) {
      result.sideEffects.updatedContext.metadata = { ...ctx.conversationContext.metadata };
    }
    
    const meta = result.sideEffects.updatedContext.metadata as any;
    if (meta.negotiation) {
      meta.negotiation.rounds = {};
    }
  }

  return result;
}

async function executeRecordNegotiationAttempt(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<ToolExecutionOutput> {
  // Do not trust the productId passed by the AI. Resolve from context.
  let productId = '';
  const cart = ctx.conversationContext.cart || [];
  const identified = (ctx.conversationContext.metadata as any)?.identifiedProducts || [];

  if (cart.length > 0) {
    productId = cart[0].productId;
  } else if (identified.length > 0) {
    // TAKE THE LAST identified product (the most recent one)
    const lastItem = identified[identified.length - 1];
    productId = lastItem.id || lastItem.productId;
  }

  if (!productId) {
    return {
      result: { 
        success: false, 
        data: {}, 
        message: 'No active product found in context to negotiate for. Please SEARCH for a product first.' 
      },
      sideEffects: {},
    };
  }

  // Get current rounds from metadata
  const metadata = ctx.conversationContext.metadata || {};
  const negotiation = (metadata as any).negotiation || { rounds: {} };
  const rounds = negotiation.rounds || {};

  // Increment round for this product
  const currentRound = (rounds[productId] || 0) + 1;
  rounds[productId] = currentRound;

  // Get fresh product info for pricing floor from DB
  const product = await getProductById(productId, ctx.workspaceId);
  if (!product) {
    return {
      result: { success: false, data: {}, message: `Product "${productId}" not found in database.` },
      sideEffects: {},
    };
  }

  const pAny = product as any;
  const pricing = pAny.pricing_policy || { isNegotiable: false };
  const minPrice = pricing.minPrice || Math.round(pAny.price * 0.8) || 0;

  const updatedMetadata = {
    ...metadata,
    negotiation: {
      ...negotiation,
      rounds: { ...rounds }
    }
  };

  return {
    result: {
      success: true,
      data: { 
        productId,
        productName: pAny.name,
        listedPrice: pAny.price,
        negotiable: pricing.isNegotiable,
        minPrice: pricing.isNegotiable ? minPrice : null,
        currentRound,
      },
      message: `Round ${currentRound} negotiation recorded for "${pAny.name}".`,
    },
    sideEffects: {
      updatedContext: {
        metadata: updatedMetadata
      }
    },
  };
}

async function executeFlagForReview(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<ToolExecutionOutput> {
  const reason = String(args.reason || 'Flagged by AI agent');

  try {
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    await supabase.from('conversations').update({
      control_mode: 'manual',
      needs_manual_response: true,
      manual_flag_reason: reason,
      manual_flagged_at: new Date().toISOString(),
    } as any).eq('id', ctx.conversationId);

    console.log(`🚨 [MANUAL FLAG] Reason: ${reason} — Bot paused, owner notified`);

    return {
      result: {
        success: true,
        data: { reason },
        message: 'Conversation flagged for manual review by the business owner.',
      },
      sideEffects: {},
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[flag_for_review] Failed:', errorMessage);

    return {
      result: {
        success: false,
        data: {},
        message: `Failed to flag conversation: ${errorMessage}`,
      },
      sideEffects: {},
    };
  }
}

async function executeCheckStock(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<ToolExecutionOutput> {
  const query = String(args.query || '');
  const requestedSize = args.size ? String(args.size) : undefined;
  const requestedColor = args.color ? String(args.color) : undefined;

  try {
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: products, error } = await supabase
      .from('products')
      .select('id, name, price, stock_quantity, sizes, colors, variant_stock, size_stock, image_urls')
      .eq('workspace_id', ctx.workspaceId)
      .ilike('name', `%${query}%`)
      .limit(3);

    if (error) throw error;

    if (!products || products.length === 0) {
      return {
        result: {
          success: true,
          data: { found: false },
          message: `No products matching "${query}" found.`,
        },
        sideEffects: {},
      };
    }

    const stockInfo = (products as Record<string, any>[]).map((p) => {
      let actualStock = p.stock_quantity ?? 0;
      
      if (requestedSize || requestedColor) {
        if (p.variant_stock && Array.isArray(p.variant_stock)) {
          const variant = p.variant_stock.find((v: any) => 
            (!requestedSize || v.size?.toUpperCase() === requestedSize.toUpperCase()) &&
            (!requestedColor || v.color?.toLowerCase() === requestedColor.toLowerCase())
          );
          if (variant !== undefined) actualStock = variant.quantity ?? 0;
        } else if (p.variant_stock && typeof p.variant_stock === 'object') {
          const key = `${requestedSize || ''}_${requestedColor || ''}`.replace(/^_|_$/g, '');
          const val = (p.variant_stock as Record<string,any>)[key];
          if (val !== undefined) actualStock = Number(val);
        } else if (requestedSize && p.size_stock && Array.isArray(p.size_stock)) {
          const sizeVariant = p.size_stock.find((s: any) => s.size?.toUpperCase() === requestedSize.toUpperCase());
          if (sizeVariant !== undefined) actualStock = sizeVariant.quantity ?? 0;
        }
      }

      const inStock = actualStock > 0;
      if (!inStock && (requestedSize || requestedColor)) {
        console.log(`⚠️ [STOCK FILTER] Removed [Size ${requestedSize || 'Any'} / Color ${requestedColor || 'Any'}] — quantity: 0`);
      }

      return {
        id: p.id,
        name: p.name,
        price: p.price,
        stock: actualStock,
        inStock,
        sizes: p.sizes || [],
        colors: p.colors || [],
        imageUrl: Array.isArray(p.image_urls) && p.image_urls.length > 0 ? p.image_urls[0] : null,
        variantStock: p.variant_stock || null,
        sizeStock: p.size_stock || null,
      };
    });

    return {
      result: {
        success: true,
        data: { found: true, products: stockInfo },
        message: `Found ${stockInfo.length} product(s): ${stockInfo.map((p) => `${p.name} (stock: ${p.stock}${!p.inStock ? ' - OUT OF STOCK' : ''})`).join(', ')}.`,
      },
      sideEffects: {
        updatedContext: {
          metadata: {
            ...ctx.conversationContext.metadata,
            identifiedProducts: stockInfo,
          },
        },
      },
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return {
      result: { success: false, data: {}, message: `Error checking stock: ${errorMessage}.` },
      sideEffects: {},
    };
  }
}

async function executeTrackOrder(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<ToolExecutionOutput> {
  const phone = String(args.phone || '');
  const normalizedPhone = phone.replace(/[^0-9]/g, '').slice(-11);

  try {
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: orders, error } = await supabase
      .from('orders')
      .select('order_number, status, total_amount, created_at, delivery_address')
      .eq('workspace_id', ctx.workspaceId)
      .ilike('customer_phone', `%${normalizedPhone}%`)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw error;

    if (!orders || orders.length === 0) {
      return {
        result: {
          success: true,
          data: { found: false },
          message: `No recent orders found for phone "${phone}".`,
        },
        sideEffects: {},
      };
    }

    const order = orders[0] as Record<string, any>;

    return {
      result: {
        success: true,
        data: { found: true, order },
        message: `Found order #${order.order_number}. Status: ${order.status}. Total: ৳${order.total_amount}. Date: ${new Date(order.created_at).toLocaleDateString()}.`,
      },
      sideEffects: {},
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return {
      result: { success: false, data: {}, message: `Error tracking order: ${errorMessage}.` },
      sideEffects: {},
    };
  }
}

async function executeCalculateDelivery(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<ToolExecutionOutput> {
  const address = String(args.address || '');
  const charge = getDeliveryCharge(address, ctx.settings);

  return {
    result: {
      success: true,
      data: { address, charge },
      message: `Delivery charge for "${address}": ৳${charge}.`,
    },
    sideEffects: {},
  };
}

async function executeCollectPaymentDigits(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<ToolExecutionOutput> {
  const digits = String(args.digits || '').trim();

  // Validate exactly 2 numeric digits
  if (!/^\d{2}$/.test(digits)) {
    return {
      result: {
        success: false,
        data: { invalidDigits: digits },
        message: `Invalid payment digits "${digits}". Must be exactly 2 numeric digits (e.g., 78 or 45).`,
      },
      sideEffects: {},
    };
  }

  // --- DATABASE SYNC ---
  // If we are awaiting digits for a specific order, update it in the DB immediately
  const metadata = ctx.conversationContext.metadata || {};
  const orderId = (metadata as any).awaitingPaymentOrderId;

  if (orderId) {
    try {
      const supabase = createClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );

      const { error } = await supabase
        .from('orders')
        .update({ payment_last_two_digits: digits } as any)
        .eq('id', orderId);

      if (!error) {
        console.log(`✅ [PAYMENT SYNC] Saved digits "${digits}" to order ${orderId}`);
      }
    } catch (err) {
      console.error('Failed to sync payment digits to DB:', err);
    }
  }

  const currentCheckout = ctx.conversationContext.checkout || {};

  return {
    result: {
      success: true,
      data: { digits },
      message: `Payment digits "${digits}" saved successfully to the order.`,
    },
    sideEffects: {
      updatedContext: {
        checkout: {
          ...currentCheckout,
          paymentLastTwoDigits: digits,
        },
        metadata: {
          ...metadata,
          awaitingPaymentDigits: false, // Clear the flag
          awaitingPaymentOrderId: undefined,
        }
      },
    },
  };
}
