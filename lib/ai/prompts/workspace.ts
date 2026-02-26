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
  const deliveryCharge = settings.deliveryCharges || 60;
  
  return `
## 📚 KNOWLEDGE BASE (Use this to answer customer questions)

### Delivery Information
- **Delivery Time:** ${deliveryTime}
- **Delivery Charge:** ৳${deliveryCharge} (ঢাকার বাইরে ভিন্ন হতে পারে)
- **Delivery Partner:** Courier Service

### Payment Methods
- Cash on Delivery (COD) ✅
- bKash / Nagad (if applicable)

### Return & Exchange Policy
- যদি প্রোডাক্ট ভাঙ্গা বা ত্রুটিপূর্ণ থাকে, ৭ দিনের মধ্যে জানালে এক্সচেঞ্জ বা রিফান্ড হবে
- সাইজ/কালার চেঞ্জ করতে হলে ডেলিভারি চার্জ গ্রাহক বহন করবেন

### Quality Assurance
- ১০০% অথেনটিক প্রোডাক্ট
- কোয়ালিটি চেক করে পাঠানো হয়

**NOTE:** If customer asks something NOT covered here, say you'll confirm and get back to them, or offer to connect with support.
`;
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
