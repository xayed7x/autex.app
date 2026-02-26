/**
 * Negotiation Handler — 5-Round Concession Ladder
 * 
 * Handles customer price negotiations with a structured 5-round framework:
 *   Round 1: Defend value, no discount, ask budget
 *   Round 2: First concession (~8-10% off base)
 *   Round 3: Midpoint counter between last offer and floor
 *   Round 4: Final offer (floor + 5%), declare "last price"
 *   Round 5+: Firm decline, door open, never go lower
 * 
 * Also handles bulk discount queries and "last price" questions.
 * State is tracked in ConversationContext.metadata.negotiation.
 */

// ============================================
// TYPES
// ============================================

export interface PricingPolicy {
  isNegotiable: boolean;
  minPrice?: number | null;
  bulkDiscounts?: Array<{
    minQty: number;
    discountPercent: number;
  }>;
}

export interface ProductWithPricing {
  productName: string;
  productPrice: number;
  pricing_policy?: PricingPolicy | null;
  stock?: number;
}

export interface NegotiationState {
  roundNumber: number;
  currentPrice: number;
  customerLastOffer?: number;
  aiLastOffer?: number;
  floorPrice?: number;
  finalOfferDeclared?: boolean;
  status?: 'idle' | 'in_progress' | 'final_offered' | 'accepted' | 'declined';
  productId?: string;
}

export type NegotiationAction = 
  | 'ACCEPT'      // Accept offer, move to order flow
  | 'DECLINE'     // Fixed price or below floor, politely decline
  | 'COUNTER'     // Counter with a calculated price
  | 'CALCULATE'   // Bulk discount calculation
  | 'LAST_PRICE'  // Show minimum/last price
  | 'DEFEND'      // Round 1: defend value, no price cut
  | 'SKIP';       // Not a negotiation, skip

export interface NegotiationResult {
  handled: boolean;
  action: NegotiationAction;
  response?: string;
  newPrice?: number;
  quantity?: number;
  /** Updated negotiation state — caller MUST persist this */
  updatedNegotiationState?: NegotiationState;
}

// ============================================
// PATTERN DETECTION
// ============================================

/**
 * Extract price offer from text
 * Patterns: "800 দিব", "800 taka dibo", "দিব 800"
 */
function extractPriceOffer(text: string): number | null {
  const patterns = [
    // "800 দিব/দেব/dibo/debo"
    /(\d+)\s*(টাকা|taka|tk|৳)?\s*(দিব|দেব|দিবো|দেবো|dibo|debo)/i,
    // "দিব 800"
    /(দিব|দেব|দিবো|দেবো|dibo|debo)\s*(\d+)\s*(টাকা|taka|tk|৳)?/i,
    // "800 রাখেন/rakhen"
    /(\d+)\s*(টাকা|taka|tk|৳)?\s*(রাখেন|রাখবেন|রাখ|রাখুন|rakhen)/i,
    // "এটাই 800"
    /এটাই?\s*(\d+)/i,
    // Bare number when clearly in negotiation context (handled by caller)
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const numericGroups = match.slice(1).filter(g => g && /^\d+$/.test(g));
      if (numericGroups.length > 0) {
        return parseInt(numericGroups[0], 10);
      }
    }
  }
  
  return null;
}

/**
 * Extract bulk quantity from text
 * Patterns: "3টা নিলে", "5 ta nile", "3 piece kinle"
 */
function extractBulkQuantity(text: string): number | null {
  const patterns = [
    // "3টা/ta নিলে/nile"
    /(\d+)\s*(টা|ta|পিস|pis|piece|খানা|khana)?\s*(নিলে|nile|কিনলে|kinle|নিব|nibo)/i,
    // "একসাথে 3"
    /একসাথে\s*(\d+)/i,
    // "3 ta eksathe"
    /(\d+)\s*(টা|ta)?\s*(একসাথে|eksathe|together)/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const numericGroups = match.slice(1).filter(g => g && /^\d+$/.test(g));
      if (numericGroups.length > 0) {
        const qty = parseInt(numericGroups[0], 10);
        if (qty >= 2 && qty <= 100) {
          return qty;
        }
      }
    }
  }
  
  return null;
}

/**
 * Check if asking for last/minimum price
 */
function isLastPriceQuery(text: string): boolean {
  const patterns = [
    /লাস্ট\s*(প্রাইস|দাম|price)/i,
    /শেষ\s*(দাম|price)/i,
    /সর্বনিম্ন/i,
    /last\s*price/i,
    /final\s*price/i,
    /minimum\s*price/i,
    /lowest\s*price/i,
  ];
  
  return patterns.some(p => p.test(text));
}

/**
 * Check if this is a general discount inquiry (not specific offer)
 */
function isDiscountInquiry(text: string): boolean {
  const patterns = [
    /(ডিসকাউন্ট|discount)\s*(কত|koto|দিবেন|diben|হবে|hobe|আছে|ache)/i,
    /কত\s*(ডিসকাউন্ট|discount)/i,
    /discount\s*(available|ache)/i,
  ];
  
  return patterns.some(p => p.test(text));
}

/**
 * Check if message is a general negotiation attempt (not a specific price offer)
 */
function isGeneralNegotiationPush(text: string): boolean {
  const patterns = [
    /দাম\s*(কম|কমান|কমাও|কমাইয়া|কমায়ে)/i,
    /(dam|price)\s*(kom|koman|kamao)/i,
    /একটু\s*কম/i,
    /aktu\s*kom/i,
    /বেশি\s*(দাম|price)/i,
    /দাম\s*বেশি/i,
    /dam\s*besi/i,
    /price\s*(besi|beshi)/i,
    /আরো?\s*(একটু)?\s*কম/i,
    /aro\s*(ektu)?\s*kom/i,
    /price\s*(ta)?\s*(aktu|ektu)?\s*kam/i,
  ];
  
  return patterns.some(p => p.test(text));
}

// ============================================
// PRICE CALCULATION HELPERS
// ============================================

/** Round 2 concession: ~8-10% below base price */
function calculateRound2Price(basePrice: number, floorPrice: number): number {
  const discount = Math.round(basePrice * 0.09); // ~9% off
  const round2Price = basePrice - discount;
  // Never go below floor
  return Math.max(round2Price, floorPrice);
}

/** Round 3 counter: midpoint between last AI offer and floor */
function calculateRound3Price(lastAiOffer: number, floorPrice: number): number {
  const midpoint = Math.round((lastAiOffer + floorPrice) / 2);
  return Math.max(midpoint, floorPrice);
}

/** Round 4 final offer: floor + 5% buffer */
function calculateFinalOffer(floorPrice: number): number {
  const buffer = Math.round(floorPrice * 0.05);
  return floorPrice + buffer;
}

// ============================================
// RESPONSE BUILDERS (Meem's voice)
// ============================================

function buildRound1Response(basePrice: number, productName: string): string {
  return `ভাইয়া ${productName} এর quality দেখলে বুঝবেন ৳${basePrice} সত্যিই fair price 😊\n\n` +
    `এই range এ এই quality market এ rare — fabric আর finishing নিজেই compare করে দেখবেন!\n\n` +
    `আপনার budget কত বলেন, দেখি কী করা যায়? 🤝`;
}

function buildRound2Response(newPrice: number, basePrice: number, productName: string): string {
  const discount = Math.round(((basePrice - newPrice) / basePrice) * 100);
  return `ভাইয়া আপনার জন্য special করে ৳${newPrice} তে দিতে পারি (${discount}% ছাড়!) 😊\n\n` +
    `এটা সত্যিই ভালো deal — quality দেখলে বুঝবেন। আর COD আছে, আগে দেখে তারপর টাকা দিবেন!\n\n` +
    `এই price এ নেবেন? 🤝`;
}

function buildRound3Response(newPrice: number, basePrice: number): string {
  const discount = Math.round(((basePrice - newPrice) / basePrice) * 100);
  return `ভাইয়া বুঝতে পারছি budget matter করে, তাই আরেকটু কমিয়ে ৳${newPrice} বলছি (${discount}% ছাড়!) 😊\n\n` +
    `এর চেয়ে কম করা সত্যিই কঠিন হবে — quality compromise করতে চাই না আপনার সাথে।\n\n` +
    `৳${newPrice} তে নেবেন? 🤝`;
}

function buildRound4FinalResponse(finalPrice: number, basePrice: number): string {
  const discount = Math.round(((basePrice - finalPrice) / basePrice) * 100);
  return `ভাইয়া আপনার জন্য সর্বোচ্চ চেষ্টা করে ৳${finalPrice} বলছি — এটাই আমার last price (${discount}% ছাড়!) 💯\n\n` +
    `এর নিচে দেওয়া possible না ভাইয়া, quality maintain করতে হয়। আর COD আছে — risk নেই!\n\n` +
    `এই price এ confirm করবেন? ✅`;
}

function buildRound5DeclineResponse(lastOffer: number): string {
  return `ভাইয়া ৳${lastOffer} ই সর্বনিম্ন, এর নিচে দেওয়া সম্ভব না 😊\n\n` +
    `তবে product টা সত্যিই ভালো — হাতে পেলে বুঝবেন! COD আছে, আগে দেখে তারপর টাকা দিবেন।\n\n` +
    `নিতে চাইলে বলেন, order করে দিই! 🤝`;
}

function buildAcceptResponse(offeredPrice: number, productName: string): string {
  return `✅ ঠিক আছে ভাইয়া, ৳${offeredPrice} তে ${productName} দিচ্ছি! দারুণ deal হলো 🎉`;
}

function buildFixedPriceDecline(originalPrice: number, productName: string): string {
  return `ভাইয়া ${productName} এর দাম ৳${originalPrice} fixed রাখা হয়েছে 😊\n\n` +
    `কিন্তু quality দেখলে বুঝবেন — ১০০% authentic! আর COD আছে, আগে দেখে তারপর টাকা দিবেন।\n\n` +
    `এই দামেই নিতে চান? 🤝`;
}

function buildBulkDiscountResponse(
  quantity: number,
  unitPrice: number,
  discountPercent: number,
  productName: string
): string {
  const discountedUnitPrice = Math.round(unitPrice * (1 - discountPercent / 100));
  const totalPrice = discountedUnitPrice * quantity;
  
  return `ভাইয়া দারুণ! ${quantity}টা নিলে ${discountPercent}% ছাড় দিচ্ছি! 🎉\n\n` +
    `💰 প্রতিটা: ৳${discountedUnitPrice} (আগে ৳${unitPrice})\n` +
    `💵 মোট: ৳${totalPrice}\n\n` +
    `এই deal এ নেবেন? order করতে বলেন! 🤝`;
}

function buildProactiveBulkOffer(quantity: number, unitPrice: number, productName: string): string {
  // Flat 5% courtesy discount for bulk without defined tiers
  const discountPercent = 5;
  const discountedUnitPrice = Math.round(unitPrice * 0.95);
  const totalPrice = discountedUnitPrice * quantity;
  
  return `ভাইয়া ${quantity}টা নিচ্ছেন বলে আপনার জন্য special — ৳${discountedUnitPrice}/piece করে দিচ্ছি (${discountPercent}% ছাড়!) 🎉\n\n` +
    `💵 মোট: ৳${totalPrice}\n\n` +
    `এই deal এ order করবেন? 🤝`;
}

function buildNoBulkDiscountResponse(quantity: number, unitPrice: number): string {
  const totalPrice = unitPrice * quantity;
  return `${quantity}টার মোট দাম: ৳${totalPrice} (৳${unitPrice}/piece) 📦\n\n` +
    `অর্ডার করতে চাইলে বলেন! 🤝`;
}

function buildLastPriceResponse(
  isNegotiable: boolean,
  originalPrice: number,
  minPrice?: number | null,
  negotiationState?: NegotiationState
): string {
  // If final offer already declared, return that
  if (negotiationState?.finalOfferDeclared && negotiationState.aiLastOffer) {
    return `ভাইয়া ৳${negotiationState.aiLastOffer} ই last price — এর নিচে possible না 😊\n\n` +
      `COD আছে, risk ছাড়া নিতে পারবেন! এই price এ নেবেন? ✅`;
  }
  
  if (isNegotiable && minPrice) {
    // Asking "last price" directly — treat as jumping to Round 4
    const finalOffer = calculateFinalOffer(minPrice);
    const discount = Math.round(((originalPrice - finalOffer) / originalPrice) * 100);
    return `সর্বনিম্ন ৳${finalOffer} দিতে পারবো — এটাই last price (${discount}% ছাড়!) 💯\n\n` +
      `COD আছে, আগে দেখে তারপর টাকা দিবেন। এই price এ নেবেন? ✅`;
  }
  
  return `ভাইয়া দাম ৳${originalPrice} fixed। কিন্তু quality premium! 💯\n\nCOD আছে — risk ছাড়া নিতে পারবেন! এই দামে নেবেন?`;
}

function buildDiscountInquiryResponse(
  pricing: PricingPolicy | null | undefined,
  originalPrice: number
): string {
  if (!pricing) {
    return `ভাইয়া দাম ৳${originalPrice} fixed। তবে quality দেখে খুশি হবেন! 😊\nCOD আছে — আগে দেখে তারপর টাকা দিবেন!`;
  }
  
  const parts: string[] = [];
  
  if (pricing.isNegotiable) {
    parts.push(`ভাইয়া আপনার budget বলেন, দেখি কী করতে পারি! 😊`);
  }
  
  if (pricing.bulkDiscounts && pricing.bulkDiscounts.length > 0) {
    const bulkInfo = pricing.bulkDiscounts
      .sort((a, b) => a.minQty - b.minQty)
      .map(d => `• ${d.minQty}+ টা = ${d.discountPercent}% ছাড়`)
      .join('\n');
    parts.push(`\n\n📦 বেশি নিলে বেশি ছাড়:\n${bulkInfo}`);
  }
  
  if (parts.length === 0) {
    return `দাম ৳${originalPrice} fixed রাখা হয়েছে। quality premium! 💯\nCOD আছে — risk ছাড়া নিতে পারবেন!`;
  }
  
  return parts.join('') + `\n\nকত টা নিতে চান বলেন! 🤝`;
}

// ============================================
// MAIN HANDLER — 5-ROUND FRAMEWORK
// ============================================

/**
 * Handle negotiation-related messages with 5-round concession ladder.
 * 
 * @param input - Customer message
 * @param product - Product in cart with pricing policy
 * @param negotiationState - Current negotiation state (persisted in context.metadata.negotiation)
 * @param trustBuilders - Optional trust info
 * @param explicitPrice - Optional explicit price extracted by AI Director
 * @returns NegotiationResult with updatedNegotiationState that caller MUST persist
 */
export function handleNegotiation(
  input: string,
  product: ProductWithPricing,
  negotiationState?: NegotiationState,
  trustBuilders?: { yearsInBusiness?: number; customerCount?: number },
  explicitPrice?: number
): NegotiationResult {
  const cleanInput = input.toLowerCase().trim();
  const pricing = product.pricing_policy;
  const basePrice = product.productPrice;
  const floorPrice = pricing?.minPrice || basePrice; // If no minPrice, floor = base (fixed)
  const isNegotiable = pricing?.isNegotiable || false;
  
  // Initialize or use existing state
  const state: NegotiationState = negotiationState || {
    roundNumber: 0,
    currentPrice: basePrice,
    floorPrice: floorPrice,
    status: 'idle',
  };
  
  // Ensure floor price is set
  if (!state.floorPrice) {
    state.floorPrice = floorPrice;
  }

  // ========================================
  // 1. BULK QUANTITY DETECTION (check first — proactive offer)
  // ========================================
  const bulkQty = extractBulkQuantity(cleanInput);
  if (bulkQty !== null) {
    console.log(`📦 [NEGOTIATION] Bulk query: ${bulkQty} items`);
    
    // Find applicable discount tier
    const bulkDiscounts = pricing?.bulkDiscounts || [];
    const applicableTier = bulkDiscounts
      .filter(d => d.minQty <= bulkQty)
      .sort((a, b) => b.minQty - a.minQty)[0];
    
    if (applicableTier) {
      console.log(`📦 [NEGOTIATION] Tier found: ${applicableTier.minQty}+ = ${applicableTier.discountPercent}%`);
      const discountedPrice = Math.round(basePrice * (1 - applicableTier.discountPercent / 100));
      return {
        handled: true,
        action: 'CALCULATE',
        response: buildBulkDiscountResponse(bulkQty, basePrice, applicableTier.discountPercent, product.productName),
        quantity: bulkQty,
        newPrice: discountedPrice,
        updatedNegotiationState: { ...state, status: 'in_progress' },
      };
    }
    
    // Proactive bulk offer: qty ≥ 3 but no defined tiers → flat 5% courtesy
    if (bulkQty >= 3) {
      console.log(`📦 [NEGOTIATION] No tier — proactive 5% courtesy discount for ${bulkQty} items`);
      const discountedPrice = Math.round(basePrice * 0.95);
      return {
        handled: true,
        action: 'CALCULATE',
        response: buildProactiveBulkOffer(bulkQty, basePrice, product.productName),
        quantity: bulkQty,
        newPrice: discountedPrice,
        updatedNegotiationState: { ...state, status: 'in_progress' },
      };
    }
    
    // Qty < 3, no discount
    console.log(`📦 [NEGOTIATION] Small quantity, no discount`);
    return {
      handled: true,
      action: 'CALCULATE',
      response: buildNoBulkDiscountResponse(bulkQty, basePrice),
      quantity: bulkQty,
      updatedNegotiationState: state,
    };
  }

  // ========================================
  // 2. LAST PRICE QUERY
  // ========================================
  if (isLastPriceQuery(cleanInput)) {
    console.log(`💰 [NEGOTIATION] Last price query`);
    
    if (isNegotiable && pricing?.minPrice) {
      const finalOffer = calculateFinalOffer(pricing.minPrice);
      return {
        handled: true,
        action: 'LAST_PRICE',
        response: buildLastPriceResponse(true, basePrice, pricing.minPrice, state),
        newPrice: state.finalOfferDeclared ? state.aiLastOffer : finalOffer,
        updatedNegotiationState: {
          ...state,
          roundNumber: Math.max(state.roundNumber, 4),
          aiLastOffer: state.finalOfferDeclared ? state.aiLastOffer : finalOffer,
          finalOfferDeclared: true,
          status: 'final_offered',
        },
      };
    }
    
    return {
      handled: true,
      action: 'LAST_PRICE',
      response: buildLastPriceResponse(false, basePrice),
      updatedNegotiationState: state,
    };
  }

  // ========================================
  // 3. GENERAL DISCOUNT INQUIRY ("discount ache?")
  // ========================================
  if (isDiscountInquiry(cleanInput)) {
    console.log(`💰 [NEGOTIATION] Discount inquiry`);
    return {
      handled: true,
      action: 'CALCULATE',
      response: buildDiscountInquiryResponse(pricing, basePrice),
      updatedNegotiationState: { ...state, roundNumber: Math.max(state.roundNumber, 1), status: 'in_progress' },
    };
  }

  // ========================================
  // 4. PRICE OFFER DETECTION ("800 দিব") 
  // ========================================
  const offeredPrice = explicitPrice || extractPriceOffer(cleanInput);
  if (offeredPrice !== null) {
    console.log(`💰 [NEGOTIATION] Price offer: ৳${offeredPrice} (Round ${state.roundNumber + 1}, floor: ৳${floorPrice})`);
    
    // Not negotiable → fixed price decline
    if (!isNegotiable) {
      console.log(`💰 [NEGOTIATION] DECLINE — fixed price`);
      return {
        handled: true,
        action: 'DECLINE',
        response: buildFixedPriceDecline(basePrice, product.productName),
        updatedNegotiationState: { ...state, customerLastOffer: offeredPrice },
      };
    }

    // ---- FINAL OFFER LOCK ----
    // Once final offer is declared, NEVER go lower
    if (state.finalOfferDeclared && state.aiLastOffer) {
      if (offeredPrice >= state.aiLastOffer) {
        // Accept at or above last offer
        console.log(`💰 [NEGOTIATION] ACCEPT — offer ≥ final offer`);
        return {
          handled: true,
          action: 'ACCEPT',
          response: buildAcceptResponse(offeredPrice, product.productName),
          newPrice: offeredPrice,
          updatedNegotiationState: { ...state, customerLastOffer: offeredPrice, currentPrice: offeredPrice, status: 'accepted' },
        };
      } else {
        // Below final offer — firm decline
        console.log(`💰 [NEGOTIATION] DECLINE — below final offer (locked)`);
        return {
          handled: true,
          action: 'DECLINE',
          response: buildRound5DeclineResponse(state.aiLastOffer),
          updatedNegotiationState: { ...state, customerLastOffer: offeredPrice, roundNumber: Math.max(state.roundNumber, 5) },
        };
      }
    }

    // ---- ACCEPT if offer ≥ base price ----
    if (offeredPrice >= basePrice) {
      console.log(`💰 [NEGOTIATION] ACCEPT — offer ≥ base price`);
      return {
        handled: true,
        action: 'ACCEPT',
        response: buildAcceptResponse(offeredPrice, product.productName),
        newPrice: offeredPrice,
        updatedNegotiationState: { ...state, customerLastOffer: offeredPrice, currentPrice: offeredPrice, status: 'accepted' },
      };
    }

    // ---- ACCEPT if offer ≥ floor price (and we're past round 1) ----
    if (offeredPrice >= floorPrice && state.roundNumber >= 1) {
      console.log(`💰 [NEGOTIATION] ACCEPT — offer ≥ floor and past Round 1`);
      return {
        handled: true,
        action: 'ACCEPT',
        response: buildAcceptResponse(offeredPrice, product.productName),
        newPrice: offeredPrice,
        updatedNegotiationState: { ...state, customerLastOffer: offeredPrice, currentPrice: offeredPrice, status: 'accepted' },
      };
    }

    // ---- 5-ROUND CONCESSION LADDER ----
    const nextRound = state.roundNumber + 1;

    if (nextRound <= 1) {
      // ROUND 1: Defend value, no discount
      console.log(`💰 [NEGOTIATION] Round 1 — defending value`);
      return {
        handled: true,
        action: 'DEFEND',
        response: buildRound1Response(basePrice, product.productName),
        updatedNegotiationState: {
          ...state,
          roundNumber: 1,
          customerLastOffer: offeredPrice,
          aiLastOffer: basePrice,
          status: 'in_progress',
        },
      };
    }

    if (nextRound === 2) {
      // ROUND 2: First concession ~8-10% off
      const round2Price = calculateRound2Price(basePrice, floorPrice);
      console.log(`💰 [NEGOTIATION] Round 2 — concession to ৳${round2Price}`);
      
      // If customer offered more than round 2 price, accept
      if (offeredPrice >= round2Price) {
        return {
          handled: true,
          action: 'ACCEPT',
          response: buildAcceptResponse(offeredPrice, product.productName),
          newPrice: offeredPrice,
          updatedNegotiationState: { ...state, roundNumber: 2, customerLastOffer: offeredPrice, currentPrice: offeredPrice, status: 'accepted' },
        };
      }
      
      return {
        handled: true,
        action: 'COUNTER',
        response: buildRound2Response(round2Price, basePrice, product.productName),
        newPrice: round2Price,
        updatedNegotiationState: {
          ...state,
          roundNumber: 2,
          customerLastOffer: offeredPrice,
          aiLastOffer: round2Price,
          currentPrice: round2Price,
          status: 'in_progress',
        },
      };
    }

    if (nextRound === 3) {
      // ROUND 3: Midpoint between last AI offer and floor
      const lastAiOffer = state.aiLastOffer || calculateRound2Price(basePrice, floorPrice);
      const round3Price = calculateRound3Price(lastAiOffer, floorPrice);
      console.log(`💰 [NEGOTIATION] Round 3 — midpoint counter ৳${round3Price}`);
      
      // If customer offered more than round 3 price, accept
      if (offeredPrice >= round3Price) {
        return {
          handled: true,
          action: 'ACCEPT',
          response: buildAcceptResponse(offeredPrice, product.productName),
          newPrice: offeredPrice,
          updatedNegotiationState: { ...state, roundNumber: 3, customerLastOffer: offeredPrice, currentPrice: offeredPrice, status: 'accepted' },
        };
      }
      
      return {
        handled: true,
        action: 'COUNTER',
        response: buildRound3Response(round3Price, basePrice),
        newPrice: round3Price,
        updatedNegotiationState: {
          ...state,
          roundNumber: 3,
          customerLastOffer: offeredPrice,
          aiLastOffer: round3Price,
          currentPrice: round3Price,
          status: 'in_progress',
        },
      };
    }

    if (nextRound === 4) {
      // ROUND 4: Final offer (floor + 5%), declare "last price"
      const finalOffer = calculateFinalOffer(floorPrice);
      console.log(`💰 [NEGOTIATION] Round 4 — FINAL OFFER ৳${finalOffer}`);
      
      // If customer offered more than final offer, accept
      if (offeredPrice >= finalOffer) {
        return {
          handled: true,
          action: 'ACCEPT',
          response: buildAcceptResponse(offeredPrice, product.productName),
          newPrice: offeredPrice,
          updatedNegotiationState: { ...state, roundNumber: 4, customerLastOffer: offeredPrice, currentPrice: offeredPrice, status: 'accepted' },
        };
      }
      
      return {
        handled: true,
        action: 'COUNTER',
        response: buildRound4FinalResponse(finalOffer, basePrice),
        newPrice: finalOffer,
        updatedNegotiationState: {
          ...state,
          roundNumber: 4,
          customerLastOffer: offeredPrice,
          aiLastOffer: finalOffer,
          currentPrice: finalOffer,
          finalOfferDeclared: true,
          status: 'final_offered',
        },
      };
    }

    // ROUND 5+: Firm decline, door open
    const lastOffer = state.aiLastOffer || calculateFinalOffer(floorPrice);
    console.log(`💰 [NEGOTIATION] Round 5+ — firm decline at ৳${lastOffer}`);
    
    // Still accept if they come up to meet us
    if (offeredPrice >= lastOffer) {
      return {
        handled: true,
        action: 'ACCEPT',
        response: buildAcceptResponse(offeredPrice, product.productName),
        newPrice: offeredPrice,
        updatedNegotiationState: { ...state, roundNumber: nextRound, customerLastOffer: offeredPrice, currentPrice: offeredPrice, status: 'accepted' },
      };
    }
    
    return {
      handled: true,
      action: 'DECLINE',
      response: buildRound5DeclineResponse(lastOffer),
      updatedNegotiationState: {
        ...state,
        roundNumber: nextRound,
        customerLastOffer: offeredPrice,
        finalOfferDeclared: true,
        status: 'final_offered',
      },
    };
  }

  // ========================================
  // 5. GENERAL NEGOTIATION PUSH ("দাম কমান", "price besi")
  // ========================================
  if (isGeneralNegotiationPush(cleanInput)) {
    console.log(`💰 [NEGOTIATION] General push detected (Round ${state.roundNumber + 1})`);
    
    if (!isNegotiable) {
      return {
        handled: true,
        action: 'DECLINE',
        response: buildFixedPriceDecline(basePrice, product.productName),
        updatedNegotiationState: state,
      };
    }

    // If final offer already declared, hold firm
    if (state.finalOfferDeclared && state.aiLastOffer) {
      return {
        handled: true,
        action: 'DECLINE',
        response: buildRound5DeclineResponse(state.aiLastOffer),
        updatedNegotiationState: { ...state, roundNumber: Math.max(state.roundNumber, 5) },
      };
    }
    
    // Round 1 — defend value
    if (state.roundNumber < 1) {
      return {
        handled: true,
        action: 'DEFEND',
        response: buildRound1Response(basePrice, product.productName),
        updatedNegotiationState: {
          ...state,
          roundNumber: 1,
          aiLastOffer: basePrice,
          status: 'in_progress',
        },
      };
    }
    
    // Already past round 1 but no specific offer — prompt for budget
    return {
      handled: true,
      action: 'DEFEND',
      response: `ভাইয়া আপনার budget কত বলেন? একটা price বললে দেখি কী করতে পারি 😊🤝`,
      updatedNegotiationState: state,
    };
  }

  // ========================================
  // NOT A NEGOTIATION QUERY
  // ========================================
  return {
    handled: false,
    action: 'SKIP',
  };
}

// ============================================
// PUBLIC DETECTION FUNCTION
// ============================================

/**
 * Check if a message looks like a negotiation query.
 * Used by fast-lane.ts to decide whether to route to negotiation handler.
 */
export function isNegotiationQuery(text: string): boolean {
  const cleanText = text.toLowerCase().trim();
  return !!(
    extractPriceOffer(cleanText) ||
    extractBulkQuantity(cleanText) ||
    isLastPriceQuery(cleanText) ||
    isDiscountInquiry(cleanText) ||
    isGeneralNegotiationPush(cleanText)
  );
}

// ============================================
// EXPORTS
// ============================================

export {
  extractPriceOffer,
  extractBulkQuantity,
  isLastPriceQuery,
  isDiscountInquiry,
  isGeneralNegotiationPush,
};
