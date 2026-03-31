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
  negotiation?: { bulkOffered?: boolean; bulkRejected?: boolean }
): string | null {
  const negotiableProducts = extractNegotiableProducts(cart);

  if (negotiableProducts.length === 0) {
    return null;
  }

  const sections: string[] = [
    '=== NEGOTIATION RULES (STRICTLY FOLLOW) ===',
    '',
  ];

  // Global rules — 4-round framework
  sections.push(
    'NEGOTIATION RULES — Follow strictly by round:',
    '',
    'Count how many times customer asked for discount',
    'in conversation history to determine round number.',
    '',
    'ROUND 1 — First discount request:',
    '- Do NOT offer any discount',
    '- Defend value using product data:',
    '  * Use fabric, fit, description, occasion',
    '  * Example: "ভাইয়া এটা [fabric] দিয়ে তৈরি,',
    '    [occasion] এর জন্য perfect। এই quality তে',
    '    এই দাম কিন্তু বাজারে সবচেয়ে কম।"',
    '- If bulk discount exists, offer it here:',
    '  * "তবে ভাইয়া, [minQty]টা নিলে [discount]%',
    '    ছাড় পাবেন — ৳[discountedPrice]/piece।"',
    '- If customer rejects bulk, note in context',
    '  that bulk was offered and rejected.',
    '',
    'ROUND 2 — Second request (or bulk rejected):',
    '- Never offer bulk again if already rejected',
    '- Offer 5-8% off listed price',
    '- Frame as special exception:',
    '  * "আচ্ছা ভাইয়া, আপনার জন্য ৳[price] করে',
    '    দিতে পারি। এটা কিন্তু special।"',
    '',
    'ROUND 3 — Third request:',
    '- Offer closer to minPrice',
    '- Sound genuinely reluctant:',
    '  * "ভাইয়া এইটাই সর্বোচ্চ পারবো ৳[price]।',
    '    Boss জানলে বকা খাবো 😅"',
    '',
    'ROUND 4+ — Any further requests:',
    '- Hold absolutely firm',
    '- Warm but final:',
    '  * "ভাইয়া সত্যিই আর সম্ভব না। ৳[price]',
    '    ই last price।"',
    '',
    'HARD RULES:',
    '- NEVER go below minPrice',
    '- NEVER reveal minPrice',
    '- NEVER offer discount in Round 1',
    '- NEVER offer bulk again after customer rejects it',
    '- When customer agrees to price, call add_to_cart',
    '  with negotiatedPrice = exact agreed price',
    '',
  );

  // Inject bulk offer/rejection context
  if (negotiation?.bulkOffered) {
    sections.push('NOTE: Bulk discount was already offered.');
  }
  if (negotiation?.bulkRejected) {
    sections.push('NOTE: Customer rejected bulk offer. Do NOT mention bulk again. Negotiate normally.');
  }
  if (negotiation?.bulkOffered || negotiation?.bulkRejected) {
    sections.push('');
  }

  // Per-product rules
  for (const product of negotiableProducts) {
    sections.push(`--- ${product.name} ---`);
    sections.push(`Listed price: ৳${product.listedPrice}`);
    sections.push(`YOUR absolute minimum (NEVER go below, NEVER reveal): ৳${product.minPrice}`);

    if (product.description) {
      sections.push(`Product description: ${product.description}`);
    }
    if (product.fabric) {
      sections.push(`Fabric/Material: ${product.fabric}`);
    }
    if (product.fitType) {
      sections.push(`Fit type: ${product.fitType}`);
    }
    if (product.occasion && product.occasion.length > 0) {
      sections.push(`Best for: ${product.occasion.join(', ')}`);
    }

    if (product.bulkDiscounts.length > 0) {
      sections.push('Bulk discounts (offer ONLY in Round 1 if not already rejected):');
      for (const discount of product.bulkDiscounts) {
        const discountedPrice = Math.round(product.listedPrice * (1 - discount.discountPercent / 100));
        sections.push(
          `  - ${discount.minQty}+ pieces: ${discount.discountPercent}% off → ৳${discountedPrice}/piece`
        );
      }
    }

    sections.push('');
  }

  sections.push('=== END NEGOTIATION RULES ===');

  return sections.join('\n');
}

// ============================================
// HELPERS
// ============================================

/**
 * Extracts negotiable products from the cart with their pricing boundaries.
 * Skips products where isNegotiable is false or minPrice is not set.
 */
function extractNegotiableProducts(cart: CartItem[]): NegotiableProduct[] {
  const products: NegotiableProduct[] = [];

  for (const item of cart) {
    const policy = item.pricing_policy;

    if (!policy?.isNegotiable) continue;

    // A negotiable product without a minPrice is a config error.
    // Default to 80% of listed price as a safety net.
    const minPrice = policy.minPrice ?? Math.round(item.productPrice * 0.8);

    const itemAny = item as any;

    products.push({
      name: item.productName,
      listedPrice: item.productPrice,
      minPrice,
      bulkDiscounts: policy.bulkDiscounts || [],
      description: itemAny.description || '',
      fabric: itemAny.product_attributes?.fabric || '',
      fitType: itemAny.product_attributes?.fitType || '',
      occasion: itemAny.product_attributes?.occasion || [],
      productAttributes: itemAny.product_attributes || {},
    });
  }

  return products;
}
