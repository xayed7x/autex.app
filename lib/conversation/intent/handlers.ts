/**
 * Intent Handlers
 * 
 * Each intent type has a dedicated handler that:
 * 1. Processes the intent
 * 2. Uses context (cart, state, product info)
 * 3. Returns response + state update
 */

import { ConversationContext, ConversationState, CartItem } from '@/types/conversation';
import { WorkspaceSettings } from '@/lib/workspace/settings';
import { ClassifiedIntent, IntentType } from './classifier';
import { handleNegotiation, ProductWithPricing } from '../negotiation-handler';

// ============================================
// HANDLER RESULT TYPE
// ============================================

export interface IntentHandlerResult {
  handled: boolean;
  response: string;
  newState: ConversationState;
  updatedContext: Partial<ConversationContext>;
  createOrder?: boolean;
  flagManual?: boolean;
  flagReason?: string;
}

// ============================================
// HANDLER CONTEXT (passed to all handlers)
// ============================================

export interface HandlerContext {
  intent: ClassifiedIntent;
  input: string;
  context: ConversationContext;
  settings?: WorkspaceSettings;
  product?: CartItem | null;
}

// ============================================
// NEGOTIATION HANDLERS
// ============================================

export function handleNegotiatePrice(ctx: HandlerContext): IntentHandlerResult {
  // Route to AI Salesman Core for proper 4-round negotiation
  return {
    handled: false,
    response: '',
    newState: ctx.context.state,
    updatedContext: {},
  };
}

export function handleBulkQuery(ctx: HandlerContext): IntentHandlerResult {
  const { intent, context } = ctx;
  const product = context.cart?.[0];
  const quantity = intent.extractedData.quantity || 1;
  
  if (!product) {
    return {
      handled: true,
      response: 'দুঃখিত, কোন প্রোডাক্টটি নিতে চান? দয়া করে প্রোডাক্টের ছবি বা নাম পাঠান। 📸',
      newState: 'IDLE',
      updatedContext: {},
    };
  }
  
  const productAny = product as any;
  const pricing = productAny.pricing_policy;
  const bulkDiscounts = pricing?.bulkDiscounts || [];
  const originalPrice = productAny.originalPrice || product.productPrice;
  
  // Check if customer has a negotiated price (consider both finalized currentPrice and pending aiLastOffer)
  const negotiationState = context.metadata?.negotiation;
  
  console.log('🔍 [BULK DEBUG] Negotiation State:', JSON.stringify(negotiationState, null, 2));
  
  let negotiatedPrice = negotiationState?.currentPrice;
  
  // If AI made an offer that is lower than current price, consider that as the active negotiated price
  // This handles cases where user accepts AI's offer implicitly by ordering
  if (negotiationState?.aiLastOffer && negotiationState.aiLastOffer < (negotiatedPrice || Infinity)) {
    negotiatedPrice = negotiationState.aiLastOffer;
    console.log(`💰 [BULK] Using AI's last offer as negotiated price: ৳${negotiatedPrice}`);
  }
  
  const hasNegotiated = negotiatedPrice && negotiatedPrice < originalPrice;
  
  // Find applicable bulk tier
  const applicableTier = bulkDiscounts
    .filter((d: any) => d.minQty <= quantity)
    .sort((a: any, b: any) => b.minQty - a.minQty)[0];
  
  // Calculate both prices
  const bulkDiscountedPrice = applicableTier 
    ? Math.round(originalPrice * (1 - applicableTier.discountPercent / 100))
    : originalPrice;
  
  // BEST PRICE WINS: Use negotiated price if it's better than bulk discount
  let finalPricePerItem: number;
  let priceSource: 'negotiated' | 'bulk' | 'original';
  
  if (hasNegotiated && negotiatedPrice! <= bulkDiscountedPrice) {
    // Negotiated price is better - use it
    finalPricePerItem = negotiatedPrice!;
    priceSource = 'negotiated';
    console.log(`💰 [BULK] Using negotiated price: ৳${negotiatedPrice} (better than bulk ৳${bulkDiscountedPrice})`);
  } else if (applicableTier) {
    // Bulk discount is better
    finalPricePerItem = bulkDiscountedPrice;
    priceSource = 'bulk';
    console.log(`💰 [BULK] Using bulk discount: ৳${bulkDiscountedPrice} (${applicableTier.discountPercent}% off)`);
  } else {
    // Original price
    finalPricePerItem = originalPrice;
    priceSource = 'original';
  }
  
  const totalPrice = finalPricePerItem * quantity;
  const regularTotal = originalPrice * quantity;
  const saving = regularTotal - totalPrice;
  
  // Build response based on price source
  let response: string;
  if (priceSource === 'negotiated') {
    response = `ভাইয়া, আপনার negotiated price ৳${finalPricePerItem} maintain করছি! 💪\n\n` +
      `**${quantity}টির** মোট: **৳${totalPrice}** (সেভ ৳${saving}!)\n\n` +
      `অর্ডার করতে **নাম** দিন 👇`;
  } else if (priceSource === 'bulk' && applicableTier) {
    response = `🎉 দারুণ! **${quantity}টিতে ${applicableTier.discountPercent}% ছাড়!**\n\n` +
      `মোট: **৳${totalPrice}** (সেভ ৳${saving}!)\n\n` +
      `অর্ডার করতে **নাম** দিন 👇`;
  } else {
    response = `জি, **${quantity}টির** মোট **৳${totalPrice}**। 😊\n\nনাম দিন 👇`;
  }
  
  return {
    handled: true,
    response,
    newState: 'COLLECTING_NAME',
    updatedContext: {
      cart: context.cart.map(item => ({
        ...item,
        quantity,
        productPrice: finalPricePerItem,
      })),
    },
  };
}

export function handleLastPriceQuery(ctx: HandlerContext): IntentHandlerResult {
  // Route to AI Salesman Core for proper 4-round negotiation
  return {
    handled: false,
    response: '',
    newState: ctx.context.state,
    updatedContext: {},
  };
}

// ============================================
// CONFIRMATION HANDLERS
// ============================================

// ============================================
// VARIATION HANDLERS
// ============================================

export function handleProvideSize(ctx: HandlerContext): IntentHandlerResult {
  const size = ctx.intent.extractedData.size || ctx.input.trim();
  const product = ctx.context.cart?.[0];
  
  if (!product) return { handled: true, response: 'কোন প্রোডাক্টের সাইজ?', newState: 'IDLE', updatedContext: {} };
  
  // Validate size if possible
  const productAny = product as any;
  const availableSizes = productAny.sizes || [];
  
  // TODO: Add fuzzy matching for size?
  
  // Check if Color is also needed
  const needsColor = productAny.colors && productAny.colors.length > 0 && !product.selectedColor;

  if (needsColor) {
    return {
      handled: true,
      response: `সাইজ **${size}** নোট করা হলো! ✅\n\nঅর্ডার কনফার্ম করার আগে দয়া করে **কালার** সিলেক্ট করুন।\nAvailable Colors: ${productAny.colors.join(', ')}`,
      newState: 'COLLECTING_MULTI_VARIATIONS',
      updatedContext: {
        cart: ctx.context.cart.map(item => ({
          ...item,
          selectedSize: size,
          variations: { ...item.variations, size }
        })),
        state: 'COLLECTING_MULTI_VARIATIONS',
        collectingSize: false
      }
    };
  }

  return {
    handled: true,
    response: `সাইজ **${size}** নোট করা হলো! ✅\n\nএখন আপনার **নাম** বলুন 👇`,
    newState: 'COLLECTING_NAME',
    updatedContext: {
      cart: ctx.context.cart.map(item => ({
        ...item,
        selectedSize: size,
        variations: { ...item.variations, size }
      })),
      state: 'COLLECTING_NAME'
    }
  };
}

export function handleProvideColor(ctx: HandlerContext): IntentHandlerResult {
  const color = ctx.intent.extractedData.color || ctx.input.trim();
  
  const product = ctx.context.cart?.[0];
  if (!product) return { handled: true, response: 'কোন প্রোডাক্টের কালার?', newState: 'IDLE', updatedContext: {} };
  
  const productAny = product as any;
  // Check if Size is also needed (if not already selected)
  const needsSize = productAny.sizes && productAny.sizes.length > 0 && !product.selectedSize;

  if (needsSize) {
    return {
      handled: true,
      response: `কালার **${color}** নোট করা হলো! ✅\n\nঅর্ডার কনফার্ম করার আগে দয়া করে **সাইজ** সিলেক্ট করুন।\nAvailable Sizes: ${productAny.sizes.join(', ')}`,
      newState: 'COLLECTING_MULTI_VARIATIONS',
      updatedContext: {
        cart: ctx.context.cart.map(item => ({
          ...item,
          selectedColor: color,
          variations: { ...item.variations, color }
        })),
        state: 'COLLECTING_MULTI_VARIATIONS',
        collectingSize: true
      }
    };
  }

  return {
    handled: true,
    response: `কালার **${color}** নোট করা হলো! ✅\n\nএখন আপনার **নাম** বলুন 👇`,
    newState: 'COLLECTING_NAME',
    updatedContext: {
      cart: ctx.context.cart.map(item => ({
        ...item,
        selectedColor: color,
        variations: { ...item.variations, color }
      })),
      state: 'COLLECTING_NAME'
    }
  };
}

export function handleProvideFullInfo(ctx: HandlerContext): IntentHandlerResult {
  // Parse full info (Quick Form response)
  const lines = ctx.input.split('\n');
  const name = ctx.intent.extractedData.name || lines[0] || '';
  const phone = ctx.intent.extractedData.phone || lines.find(l => /\d{11}/.test(l)) || '';
  const address = ctx.intent.extractedData.address || lines[lines.length - 1] || '';
  
  if (!name || !phone || !address) {
    return {
      handled: true,
      response: ctx.settings?.quick_form_error || 'তথ্য অসম্পূর্ণ। দয়া করে আবার দিন।',
      newState: 'AWAITING_CUSTOMER_DETAILS',
      updatedContext: {}
    };
  }
  
  return {
    handled: true,
    response: `ধন্যবাদ! আপনার অর্ডার ইনফরমেশন পেয়েছি। ✅\n\nনাম: ${name}\nফোন: ${phone}\nঠিকানা: ${address}\n\nসব ঠিক আছে? (হ্যাঁ/না)`,
    newState: 'CONFIRMING_ORDER',
    updatedContext: {
      checkout: {
        customerName: name,
        customerPhone: phone,
        customerAddress: address,
      },
      state: 'CONFIRMING_ORDER'
    }
  };
}


// ============================================
// CONFIRMATION HANDLERS
// ============================================

export function handleConfirmYes(ctx: HandlerContext): IntentHandlerResult {
  const { context, settings } = ctx;
  const state = context.state;
  const product = context.cart?.[0];
  
  // Check Order Collection Style
  const isQuickForm = settings?.order_collection_style === 'quick_form';
  
  if (state === 'CONFIRMING_PRODUCT' || (context.cart && context.cart.length > 0)) {
    
    // 1. Check for Missing Variations (Size/Color)
    if (product) {
       const productAny = product as any;
       const needsSize = productAny.sizes && productAny.sizes.length > 0 && !product.selectedSize;
       const needsColor = productAny.colors && productAny.colors.length > 0 && !product.selectedColor;
       
       // If conversational, ask step by step
       if (!isQuickForm) {
         if (needsSize) {
           return {
             handled: true,
             response: `অর্ডার কনফার্ম করার আগে দয়া করে **সাইজ** সিলেক্ট করুন।\n\nAvailable Sizes: ${productAny.sizes.join(', ')}`,
             newState: 'COLLECTING_MULTI_VARIATIONS',
             updatedContext: { state: 'COLLECTING_MULTI_VARIATIONS', collectingSize: true }
           };
         }
         
         if (needsColor) {
           return {
             handled: true,
             response: `অর্ডার কনফার্ম করার আগে দয়া করে **কালার** সিলেক্ট করুন।\n\nAvailable Colors: ${productAny.colors.join(', ')}`,
             newState: 'COLLECTING_MULTI_VARIATIONS',
             updatedContext: { state: 'COLLECTING_MULTI_VARIATIONS', collectingSize: false }
           };
         }
       }
    }

    // 2. Proceed to Name Collection (Conversational) OR Quick Form
    if (isQuickForm) {
      let prompt = settings?.quick_form_prompt || 
        'দারুণ! অর্ডারটি সম্পন্ন করতে, অনুগ্রহ করে নিচের ফর্ম্যাট অনুযায়ী আপনার তথ্য দিন:\n\nনাম:\nফোন:\nসম্পূর্ণ ঠিকানা:';
        
      if (product) {
        const productAny = product as any;
        if (productAny.sizes?.length) prompt += `\nসাইজ: (${productAny.sizes.join('/')})`;
        if (productAny.colors?.length) prompt += `\nকালার: (${productAny.colors.join('/')})`;
      }
      
      return {
        handled: true,
        response: prompt,
        newState: 'AWAITING_CUSTOMER_DETAILS',
        updatedContext: { state: 'AWAITING_CUSTOMER_DETAILS' }
      };
    } else {
      return {
        handled: true,
        response: 'দারুণ! অর্ডারটি সম্পন্ন করতে আপনার **নাম** দিন। 📝',
        newState: 'COLLECTING_NAME',
        updatedContext: { state: 'COLLECTING_NAME' },
      };
    }
  }
  
  if (state === 'CONFIRMING_ORDER') {
    return {
      handled: true,
      response: '✅ অর্ডার নিশ্চিত!',
      newState: 'IDLE',
      updatedContext: { state: 'IDLE' },
      createOrder: true,
    };
  }
  
  return {
    handled: true,
    response: 'কি অর্ডার করতে চান? প্রোডাক্টের ছবি পাঠান! 📸',
    newState: 'IDLE',
    updatedContext: {},
  };
}

export function handleConfirmNo(ctx: HandlerContext): IntentHandlerResult {
  return {
    handled: true,
    response: 'ঠিক আছে! অন্য কিছু দেখতে চাইলে জানান। 😊',
    newState: 'IDLE',
    updatedContext: {
      cart: [],
      checkout: {},
    },
  };
}

// ============================================
// ORDER INFO HANDLERS
// ============================================

export function handleProvideName(ctx: HandlerContext): IntentHandlerResult {
  const name = ctx.intent.extractedData.name || ctx.input.trim();
  
  // Basic name validation
  if (name.length < 2 || name.length > 50) {
    return {
      handled: true,
      response: 'সঠিক নাম দিন (২-৫০ অক্ষর)',
      newState: ctx.context.state,
      updatedContext: {},
    };
  }
  
  return {
    handled: true,
    response: `ধন্যবাদ ${name}! 📱 এখন আপনার **ফোন নম্বর** দিন:`,
    newState: 'COLLECTING_PHONE',
    updatedContext: {
      checkout: {
        ...ctx.context.checkout,
        customerName: name,
      },
      state: 'COLLECTING_PHONE',
    },
  };
}

export function handleProvidePhone(ctx: HandlerContext): IntentHandlerResult {
  const phone = ctx.intent.extractedData.phone || ctx.input.replace(/\D/g, '');
  
  // Validate Bangladesh phone
  if (!/^01[3-9]\d{8}$/.test(phone)) {
    return {
      handled: true,
      response: 'সঠিক ফোন নম্বর দিন (01XXXXXXXXX)',
      newState: ctx.context.state,
      updatedContext: {},
    };
  }
  
  return {
    handled: true,
    response: `📍 চমৎকার! এখন আপনার **সম্পূর্ণ ঠিকানা** দিন:`,
    newState: 'COLLECTING_ADDRESS',
    updatedContext: {
      checkout: {
        ...ctx.context.checkout,
        customerPhone: phone,
      },
      state: 'COLLECTING_ADDRESS',
    },
  };
}

export function handleProvideAddress(ctx: HandlerContext): IntentHandlerResult {
  const address = ctx.input.trim();
  
  if (address.length < 10) {
    return {
      handled: true,
      response: 'সম্পূর্ণ ঠিকানা দিন (এলাকা, রোড, বাসা নম্বর)',
      newState: ctx.context.state,
      updatedContext: {},
    };
  }
  
  // Build order summary (use negotiated price if available)
  const cart = ctx.context.cart || [];
  const checkout = ctx.context.checkout || {};
  const negotiation = ctx.context.metadata?.negotiation;
  const totalAmount = cart.reduce((sum, item) => {
    const price = (negotiation?.aiLastOffer && negotiation.aiLastOffer < item.productPrice)
      ? negotiation.aiLastOffer : item.productPrice;
    return sum + (price * (item.quantity || 1));
  }, 0);
  const deliveryCharge = ctx.settings?.deliveryCharges?.insideDhaka || 60;
  
  const summary = `📦 **অর্ডার সামারি:**\n\n` +
    `👤 নাম: ${checkout.customerName}\n` +
    `📱 ফোন: ${checkout.customerPhone}\n` +
    `📍 ঠিকানা: ${address}\n\n` +
    `🛒 প্রোডাক্ট: ${cart.map(i => `${i.productName} x${i.quantity || 1}`).join(', ')}\n` +
    `💰 মোট: ৳${totalAmount} + ৳${deliveryCharge} (ডেলিভারি) = **৳${totalAmount + deliveryCharge}**\n\n` +
    `✅ অর্ডার কনফার্ম করতে **হ্যাঁ** বলুন`;
  
  return {
    handled: true,
    response: summary,
    newState: 'CONFIRMING_ORDER',
    updatedContext: {
      checkout: {
        ...checkout,
        customerAddress: address,
      },
      state: 'CONFIRMING_ORDER',
    },
  };
}

// ============================================
// QUERY HANDLERS
// ============================================

export function handleDeliveryQuery(ctx: HandlerContext): IntentHandlerResult {
  const settings = ctx.settings;
  const dhakaCharge = settings?.deliveryCharges?.insideDhaka || 60;
  const outsideCharge = settings?.deliveryCharges?.outsideDhaka || 120;
  const deliveryTime = settings?.deliveryTime || '৩-৫ দিন';
  
  return {
    handled: true,
    response: `🚚 ডেলিভারি তথ্য:\n\n` +
      `• ঢাকার মধ্যে: ৳${dhakaCharge}\n` +
      `• ঢাকার বাইরে: ৳${outsideCharge}\n` +
      `• সময়: ${deliveryTime}\n\n` +
      `অর্ডার করতে চাইলে বলুন! 😊`,
    newState: ctx.context.state,
    updatedContext: {},
  };
}

export function handlePaymentQuery(ctx: HandlerContext): IntentHandlerResult {
  return {
    handled: true,
    response: `💳 পেমেন্ট অপশন:\n\n` +
      `• ক্যাশ অন ডেলিভারি (COD) ✅\n` +
      `• বিকাশ / নগদ / রকেট\n\n` +
      `অর্ডার করবেন? 😊`,
    newState: ctx.context.state,
    updatedContext: {},
  };
}

export function handleReturnQuery(ctx: HandlerContext): IntentHandlerResult {
  return {
    handled: true,
    response: `🔄 রিটার্ন পলিসি:\n\n` +
      `• প্রোডাক্ট পেয়ে চেক করে নিন\n` +
      `• সমস্যা থাকলে ৩ দিনের মধ্যে জানান\n` +
      `• এক্সচেঞ্জ বা রিফান্ড সম্ভব\n\n` +
      `নিশ্চিন্তে অর্ডার করুন! 😊`,
    newState: ctx.context.state,
    updatedContext: {},
  };
}

export function handleTrustConcern(ctx: HandlerContext): IntentHandlerResult {
  return {
    handled: true,
    response: `✅ **100% অথেনটিক প্রোডাক্ট!**\n\n` +
      `• অরিজিনাল কোয়ালিটি গ্যারান্টি\n` +
      `• পছন্দ না হলে এক্সচেঞ্জ সুবিধা\n` +
      `• হাজারো সন্তুষ্ট গ্রাহক\n\n` +
      `নিশ্চিন্তে অর্ডার করুন! 🛡️`,
    newState: ctx.context.state,
    updatedContext: {},
  };
}

export function handlePriceObjection(ctx: HandlerContext): IntentHandlerResult {
  // Route to AI Salesman Core for empathetic handling
  return {
    handled: false,
    response: '',
    newState: ctx.context.state,
    updatedContext: {},
  };
}

export function handleGreeting(ctx: HandlerContext): IntentHandlerResult {
  return {
    handled: true,
    response: `আসসালামু আলাইকুম! 😊\n\nকি অর্ডার করতে চান? প্রোডাক্টের ছবি পাঠান! 📸`,
    newState: 'IDLE',
    updatedContext: {},
  };
}

export function handleThanks(ctx: HandlerContext): IntentHandlerResult {
  return {
    handled: true,
    response: `আপনাকেও ধন্যবাদ! 🙏\n\nআবার যেকোনো প্রয়োজনে নক করুন। 😊`,
    newState: ctx.context.state,
    updatedContext: {},
  };
}

export function handleComplaint(ctx: HandlerContext): IntentHandlerResult {
  return {
    handled: false,
    response: '',
    newState: ctx.context.state,
    updatedContext: {},
    flagManual: true,
    flagReason: 'Customer complaint - needs human attention',
  };
}

export function handleUnknown(ctx: HandlerContext): IntentHandlerResult {
  return {
    handled: false,
    response: '',
    newState: ctx.context.state,
    updatedContext: {},
    flagManual: true,
    flagReason: 'Could not understand customer intent',
  };
}

// ============================================
// MAIN HANDLER ROUTER
// ============================================

const handlers: Record<IntentType, (ctx: HandlerContext) => IntentHandlerResult> = {
  NEGOTIATE_PRICE: handleNegotiatePrice,
  BULK_QUERY: handleBulkQuery,
  LAST_PRICE_QUERY: handleLastPriceQuery,
  DISCOUNT_QUERY: handleLastPriceQuery, // Similar handling
  
  PROVIDE_NAME: handleProvideName,
  PROVIDE_PHONE: handleProvidePhone,
  PROVIDE_ADDRESS: handleProvideAddress,
  PROVIDE_SIZE: handleProvideSize,
  PROVIDE_COLOR: handleProvideColor,
  PROVIDE_QUANTITY: handleBulkQuery,
  PROVIDE_FULL_INFO: handleProvideFullInfo,
  
  CONFIRM_YES: handleConfirmYes,
  CONFIRM_NO: handleConfirmNo,
  
  PRODUCT_QUERY: handleUnknown, // Let AI Director handle
  PRICE_QUERY: handleLastPriceQuery,
  STOCK_QUERY: handleUnknown, // Let AI Director handle
  
  DELIVERY_QUERY: handleDeliveryQuery,
  PAYMENT_QUERY: handlePaymentQuery,
  RETURN_QUERY: handleReturnQuery,
  EXCHANGE_QUERY: handleReturnQuery,
  
  TRUST_CONCERN: handleTrustConcern,
  PRICE_OBJECTION: handlePriceObjection,
  DELAY: handleConfirmNo, // Graceful exit
  
  GREETING: handleGreeting,
  THANKS: handleThanks,
  ORDER_STATUS: handleUnknown, // FLAG_MANUAL
  CANCEL_ORDER: handleUnknown, // FLAG_MANUAL
  CHANGE_ORDER: handleUnknown, // FLAG_MANUAL
  COMPLAINT: handleComplaint,
  
  UNKNOWN: handleUnknown,
};

export function handleIntent(
  intent: ClassifiedIntent,
  input: string,
  context: ConversationContext,
  settings?: WorkspaceSettings
): IntentHandlerResult {
  const handler = handlers[intent.intent] || handleUnknown;
  
  const ctx: HandlerContext = {
    intent,
    input,
    context,
    settings,
    product: context.cart?.[0] || null,
  };
  
  return handler(ctx);
}
