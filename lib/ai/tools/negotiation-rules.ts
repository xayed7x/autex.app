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
    
    // The round stored is already incremented by the tool before this rules prompt is generated.
    // So if the tool was called once, we are currently generating the response for Round 1.
    const currentRound = negotiation?.rounds?.[productId] || 1;
    
    const isNegotiable = policy?.isNegotiable && (policy?.minPrice !== undefined && policy?.minPrice !== null);
    
    if (isNegotiable) {
      const minPrice = policy!.minPrice!;
      const listedPrice = item.productPrice || item.price || 0;
      const bulkOffered = negotiation?.bulkOffered || false;

      // Calculate step-down prices dynamically
      let round2Price = Math.round((listedPrice * 0.93) / 5) * 5; // 7% off, rounded to nearest 5
      if (round2Price < minPrice) round2Price = minPrice;
      
      let round3Price = Math.round(((round2Price + minPrice) / 2) / 5) * 5; // Midpoint, rounded to nearest 5
      if (round3Price < minPrice) round3Price = minPrice;

      // Build round-specific instruction
      let instructionForRound = "";
      if (currentRound === 1) {
        if (policy.bulkDiscounts && policy.bulkDiscounts.length > 0 && !bulkOffered) {
          instructionForRound = "ROUND 1 — BULK OFFER: Do NOT cut price. Offer the bulk deals listed below as the primary counter. Defend quality alongside. Set the tone: single piece stays at listed price, bulk is where the savings are.";
        } else {
          instructionForRound = "ROUND 1 — QUALITY DEFENSE: Do NOT offer any price discount. Defend quality using the product attributes listed below (mention ONLY non-null attributes). Hold firm at listed price.";
        }
      } else if (currentRound === 2) {
        instructionForRound = `ROUND 2 — SMALL CUT: Offer ৳${round2Price} (5-8% off listed). Frame as a personal exception, not a standard discount. Sound like you're making a special effort just for them.`;
      } else if (currentRound === 3) {
        instructionForRound = `ROUND 3 — CLOSER TO FLOOR: Offer ৳${round3Price}. Sound genuinely reluctant. This is a real sacrifice for you. Make it clear this is almost the lowest.`;
      } else {
        instructionForRound = `ROUND 4+ — HOLD FIRM: Hold at ৳${round3Price} (your last offer). Warm but absolutely final. NEVER go lower. If customer still refuses, pivot to: "নিতে চাইলে বলুন, আমি অর্ডার করে দিচ্ছি 😊"`;
      }

      let ruleBlock = `=== NEGOTIATION STATUS ===
Product: ${item.productName || item.name}
Current Round: ${currentRound}
Listed Price: ৳${listedPrice}

YOUR STRICT INSTRUCTION FOR THIS RESPONSE:
${instructionForRound}
===========================`;

      // Inject product attributes for quality defense (all rounds can reference these)
      const attrs = itemAny.product_attributes || {};
      const description = item.description || itemAny.description;
      const fabric = attrs.fabric || itemAny.fabric;
      const fit = attrs.fitType || itemAny.fitType;
      const occasion = attrs.occasion || itemAny.occasion;
      const gsm = attrs.gsm;
      const careInstructions = attrs.careInstructions;

      const attrLines: string[] = [];
      if (description) attrLines.push(`Description: ${description}`);
      if (fabric) attrLines.push(`Fabric: ${fabric}`);
      if (gsm) attrLines.push(`GSM: ${gsm}`);
      if (fit) attrLines.push(`Fit: ${fit}`);
      if (occasion) attrLines.push(`Occasion: ${occasion}`);
      if (careInstructions) attrLines.push(`Care: ${careInstructions}`);

      if (attrLines.length > 0) {
        ruleBlock += `\n\nProduct Attributes (use for quality defense — mention ONLY non-null values):`;
        for (const line of attrLines) {
          ruleBlock += `\n- ${line}`;
        }
      }
      
      // Inject bulk discount data (only if not yet offered)
      if (policy.bulkDiscounts && policy.bulkDiscounts.length > 0 && !bulkOffered) {
        ruleBlock += "\n\nBulk Discounts Available (Offer in Round 1 — ONE TIME ONLY):";
        for (const d of policy.bulkDiscounts) {
          const dPrice = Math.round(listedPrice * (1 - d.discountPercent / 100));
          ruleBlock += `\n- ${d.minQty}+ pieces: ৳${dPrice}/piece (${d.discountPercent}% off)`;
        }
      } else if (bulkOffered) {
        ruleBlock += "\n\n[Bulk discount already offered in this conversation — do NOT mention again.]";
      }

      sections.push(ruleBlock);
    } else {
      sections.push(`=== PRICING POLICY ===
Product: ${item.productName || item.name}
This product has a FIXED PRICE of ৳${item.productPrice || item.price || 0}.
Negotiation is NOT available for this product.
If customer asks for discount, respond warmly but firmly:
"Sir, এই প্রোডাক্টের দাম fixed, কমানোর সুযোগ নেই। তবে quality তে আপোষ নেই 😊"
========================`);
    }
  }

  return sections.join('\n\n');
}
