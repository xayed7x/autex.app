/**
 * Negotiation Rules — Dynamic System Prompt Builder
 *
 * Generates negotiation boundary rules for the agent's system prompt.
 * These rules are injected dynamically when the cart contains
 * negotiable products. The AI handles the conversation naturally,
 * but these rules constrain its pricing decisions.
 *
 * Two layers of enforcement:
 *   1. PROMPT LAYER (this file) — Tells the AI its boundaries
 *   2. SERVER LAYER (save-order.ts) — Hard rejects orders below minPrice
 *
 * @module lib/ai/tools/negotiation-rules
 */

import { CartItem } from '@/types/conversation';

// ============================================
// TYPES
// ============================================

interface NegotiableProduct {
  name: string;
  listedPrice: number;
  minPrice: number;
  bulkDiscounts: Array<{ minQty: number; discountPercent: number }>;
  description?: string;
  fabric?: string;
  fitType?: string;
  occasion?: string[];
  productAttributes?: Record<string, any>;
}

// ============================================
// MAIN FUNCTION
// ============================================

/**
 * Builds negotiation rules text for the system prompt.
 *
 * Only called when the cart has at least one negotiable product.
 * Returns null if no products in the cart are negotiable.
 *
 * @param cart - Current cart items (with pricing_policy loaded)
 * @param negotiation - Current negotiation context from metadata
 * @returns Formatted rules string for the system prompt, or null
 */
export function buildNegotiationRules(
  cart: CartItem[],
  negotiation?: { bulkOffered?: boolean; bulkRejected?: boolean; rounds?: Record<string, number> },
  identifiedProducts?: any[]
): string | null {
  // 1. Priority: Cart first, then LAST identified product
  let itemsToProcess: any[] = [];
  if (cart && cart.length > 0) {
    itemsToProcess = cart;
  } else if (identifiedProducts && identifiedProducts.length > 0) {
    // ONLY TAKE THE LAST ONE for pre-cart negotiation
    itemsToProcess = [identifiedProducts[identifiedProducts.length - 1]];
  }

  if (itemsToProcess.length === 0) return null;

  const sections: string[] = [];

  for (const item of itemsToProcess) {
    const policy = item.pricing_policy || item.pricingPolicy;
    const itemAny = item as any;
    const productId = item.productId || item.id;
    
    // We increment by 1 because the round stored is the COMPLETE rounds
    // and the next interaction starts the NEXT round.
    const currentRound = (negotiation?.rounds?.[productId] || 0) + 1;
    
    const isNegotiable = policy?.isNegotiable && (policy?.minPrice !== undefined && policy?.minPrice !== null);
    
    if (isNegotiable) {
      const minPrice = policy!.minPrice!;
      const listedPrice = item.productPrice || item.price || 0;

      let ruleBlock = `=== NEGOTIATION STATUS ===
Product: ${item.productName || item.name}
Current Round: ${currentRound}
Min Price: ৳${minPrice}
Listed Price: ৳${listedPrice}

YOUR INSTRUCTIONS FOR ROUND ${currentRound}:
Round 1: Do NOT offer any discount. Defend quality using fabric, fit, occasion. Offer bulk as alternative if available.
Say something like: 'ভাইয়া এই দামেই সবচেয়ে ভালো quality পাচ্ছেন...'

Round 2: Offer 5-8% off listed price only. Frame as special exception.
Say: 'শুধু আপনার জন্য একটু কমিয়ে ৳${Math.round(listedPrice * 0.93)} দিতে পারি...'

Round 3: Offer closer to minPrice. Sound genuinely reluctant.
Say: 'Boss জানলে বকবে, তবু ৳${minPrice + 50} দিচ্ছি, এর নিচে সম্ভব না 😅'

Round 4+: Hold firm at last offered price. Warm but absolutely final.
Never go lower than minPrice.
===========================`;

      // Inject details for defense in Round 1
      if (currentRound === 1) {
        let defense = "\nValue Defense Data:";
        const description = item.description || itemAny.description;
        const fabric = itemAny.product_attributes?.fabric || itemAny.fabric;
        const fit = itemAny.product_attributes?.fitType || itemAny.fitType;

        if (description) defense += `\n- Description: ${description}`;
        if (fabric) defense += `\n- Fabric: ${fabric}`;
        if (fit) defense += `\n- Fit: ${fit}`;
        ruleBlock += defense;
        
        if (policy.bulkDiscounts && policy.bulkDiscounts.length > 0 && !negotiation?.bulkRejected) {
           ruleBlock += "\n\nBulk Discounts Available (Offer these first!):";
           for (const d of policy.bulkDiscounts) {
              const dPrice = Math.round(listedPrice * (1 - d.discountPercent / 100));
              ruleBlock += `\n- ${d.minQty}+ pieces: ৳${dPrice}/piece`;
           }
        }
      }

      sections.push(ruleBlock);
    } else {
      sections.push(`=== PRICING POLICY ===
Product: ${item.productName || item.name}
This product has a FIXED PRICE of ৳${item.productPrice || item.price || 0}.
Negotiation is NOT available for this product.
If customer asks for discount, respond warmly but firmly:
'ভাইয়া এই প্রোডাক্টটার দাম fixed, কমানোর সুযোগ নেই। তবে quality তে আপোষ নেই, নিশ্চিত থাকুন 😊'
========================`);
    }
  }

  return sections.join('\n\n');
}
