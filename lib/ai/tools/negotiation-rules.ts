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
 * @returns Formatted rules string for the system prompt, or null
 */
export function buildNegotiationRules(cart: CartItem[]): string | null {
  const negotiableProducts = extractNegotiableProducts(cart);

  if (negotiableProducts.length === 0) {
    return null;
  }

  const sections: string[] = [
    '=== NEGOTIATION RULES (STRICTLY FOLLOW) ===',
    '',
  ];

  // Global rules
  sections.push(
    'You may negotiate prices with the customer. Follow these rules:',
    '- Start by defending the listed price. Explain value before offering discounts.',
    '- Concede gradually. Never jump straight to the minimum price.',
    '- NEVER reveal the minimum price to the customer, even if they ask directly.',
    '- NEVER accept a price below the minimum listed for each product.',
    '- If the customer insists on a price below your minimum, politely decline and offer the minimum as your "absolute best" price.',
    '- If the customer asks "last price" or "সর্বনিম্ন দাম", offer a price slightly above your minimum (add 5-10%).',
    '',
  );

  // Per-product rules
  for (const product of negotiableProducts) {
    sections.push(`--- ${product.name} ---`);
    sections.push(`Listed price: ৳${product.listedPrice}`);
    sections.push(`YOUR absolute minimum (NEVER go below, NEVER reveal): ৳${product.minPrice}`);

    if (product.bulkDiscounts.length > 0) {
      sections.push('Bulk discounts (offer proactively if customer orders multiple):');
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

    products.push({
      name: item.productName,
      listedPrice: item.productPrice,
      minPrice,
      bulkDiscounts: policy.bulkDiscounts || [],
    });
  }

  return products;
}
