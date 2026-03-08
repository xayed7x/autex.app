/**
 * Workspace Customization Prompt Builder
 * 
 * Layer 2 of AI Salesman Core.
 * Injects per-workspace settings into the prompt:
 * - Business Name & Brand Tone
 * - Pricing Policies
 * - Knowledge Base (Delivery, Returns, Payment)
 * - Custom Greetings
 * 
 * @module lib/ai/prompts/workspace
 */

import { WorkspaceSettings } from '@/lib/workspace/settings';

// ============================================
// TYPES
// ============================================

export interface ProductContext {
  productId: string;
  productName: string;
  originalPrice: number;
  description?: string;
  sizes?: string[];
  colors?: string[];
  stock?: number;
  pricingPolicy?: {
    isNegotiable: boolean;
    minPrice?: number;
    bulkDiscounts?: Array<{ minQty: number; discountPercent: number }>;
  };
}

export interface KnowledgeBase {
  deliveryInfo: string;
  deliveryCharge: string;
  returnPolicy: string;
  paymentMethods: string;
  warranty?: string;
  customFAQ?: Array<{ question: string; answer: string }>;
}

// ============================================
// WORKSPACE PROMPT BUILDER
// ============================================

export function buildWorkspaceContext(
  settings: WorkspaceSettings,
  product?: ProductContext | null
): string {
  const businessName = settings.businessName || 'Our Business';
  const tone = settings.tone || 'friendly';
  
  let prompt = `
## 🏪 BUSINESS CONTEXT

**Business:** ${businessName}
**Brand Tone:** ${tone === 'professional' ? 'Professional & Formal' : 'Friendly & Casual'}
`;

  // Add product context if available
  if (product) {
    prompt += `
## 📦 CURRENT PRODUCT

- **Name:** ${product.productName}
- **Price:** ৳${product.originalPrice}
${product.description ? `- **Description:** ${product.description}

**IMPORTANT:** Only mention features that are in the Description above. If no description, say ONLY the name and price.` : `
**IMPORTANT:** No description provided. Say ONLY the product name and price. DO NOT invent features like "premium fabric" or "high quality".`}
${product.sizes?.length ? `- **Available Sizes:** ${product.sizes.join(', ')}` : ''}
${product.colors?.length ? `- **Available Colors:** ${product.colors.join(', ')}` : ''}
${product.stock !== undefined ? `- **Stock:** ${product.stock > 0 ? `${product.stock} available` : 'Out of stock'}` : ''}
`;

    // Add pricing policy (for AI to know boundaries, NOT to reveal)
    if (product.pricingPolicy) {
      const { isNegotiable, minPrice, bulkDiscounts } = product.pricingPolicy;
      prompt += `
## 💰 PRICING RULES (INTERNAL - DO NOT REVEAL EXACT NUMBERS)

- **Negotiable:** ${isNegotiable ? 'Yes' : 'No - Price is FIXED'}
${isNegotiable && minPrice ? `- **Minimum Acceptable:** ৳${minPrice} (NEVER go below this, NEVER reveal directly)` : ''}
${bulkDiscounts?.length ? `- **Bulk Discounts:** ${bulkDiscounts.map(d => `${d.minQty}+ = ${d.discountPercent}% off`).join(', ')}` : ''}
`;
    }
  }

  // Add Knowledge Base
  prompt += buildKnowledgeBaseSection(settings);

  return prompt;
}

// ============================================
// KNOWLEDGE BASE BUILDER
// ============================================

function buildKnowledgeBaseSection(settings: WorkspaceSettings): string {
  const deliveryTime = settings.deliveryTime || '3-5 দিন';
  const insideDhaka = settings.deliveryCharges?.insideDhaka || 60;
  const outsideDhaka = settings.deliveryCharges?.outsideDhaka || 120;
  
  let section = `
## 📚 KNOWLEDGE BASE (Use this to answer customer questions)

### Delivery Information
- **Delivery Time:** ${deliveryTime}
- **Inside Dhaka:** ৳${insideDhaka}
- **Outside Dhaka:** ৳${outsideDhaka}
`;

  // Payment Methods — built dynamically from settings
  const paymentMethods = settings.paymentMethods;
  const enabledMethods: string[] = [];
  if (paymentMethods?.bkash?.enabled) {
    enabledMethods.push(`- bKash: ${paymentMethods.bkash.number || '(number not set)'}`);
  }
  if (paymentMethods?.nagad?.enabled) {
    enabledMethods.push(`- Nagad: ${paymentMethods.nagad.number || '(number not set)'}`);
  }
  if (paymentMethods?.cod?.enabled) {
    enabledMethods.push(`- Cash on Delivery (COD)`);
  }

  if (enabledMethods.length > 0) {
    section += `
### Payment Methods
${enabledMethods.join('\n')}
`;
  } else {
    section += `
### Payment Methods
- Payment information has not been configured. If asked, say you will confirm the payment details.
`;
  }

  // Return Policy — from settings, NOT hardcoded
  if (settings.returnPolicy) {
    section += `
### Return Policy
${settings.returnPolicy}
`;
  } else {
    section += `
### Return Policy
- If customer asks about returns, say: "এই বিষয়টা confirm করে বলছি" and do NOT invent a policy.
`;
  }

  // Exchange Policy — from settings
  if (settings.exchangePolicy) {
    section += `
### Exchange Policy
${settings.exchangePolicy}
`;
  }

  // Quality Guarantee — from settings, omit if empty
  if (settings.qualityGuarantee) {
    section += `
### Quality Assurance
${settings.qualityGuarantee}
`;
  }

  // Custom FAQs — from settings
  if (settings.customFaqs && settings.customFaqs.length > 0) {
    section += `
### Business FAQ
`;
    for (const faq of settings.customFaqs) {
      if (faq.question && faq.answer) {
        section += `**Q:** ${faq.question}\n**A:** ${faq.answer}\n\n`;
      }
    }
  }

  section += `
**NOTE:** If customer asks something NOT covered here, say you'll confirm and get back to them, or offer to connect with support.
`;

  return section;
}

// ============================================
// EXPORTS
// ============================================

export function buildCompletePrompt(
  universalPrompt: string,
  settings: WorkspaceSettings,
  product?: ProductContext | null
): string {
  const workspaceContext = buildWorkspaceContext(settings, product);
  return `${universalPrompt}\n\n${workspaceContext}`;
}
