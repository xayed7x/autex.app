/**
 * AI Salesman Core
 * 
 * The main orchestrator for the AI Salesman system.
 * Assembles all prompt layers and calls the LLM.
 * 
 * This is the SINGLE ENTRY POINT for all AI-powered responses.
 * 
 * @module lib/ai/salesman-core
 */

import OpenAI from 'openai';
import { ConversationContext, CartItem } from '@/types/conversation';
import { WorkspaceSettings } from '@/lib/workspace/settings';
import { UNIVERSAL_SALESMAN_PROMPT, AIResponse, NegotiationState } from './prompts/universal';
import { buildWorkspaceContext, ProductContext } from './prompts/workspace';
import { buildDynamicContext, MessageHistory, extractMessageHistory, incrementNegotiationRound } from './prompts/context';

// ============================================
// TYPES
// ============================================

export interface SalesmanInput {
  customerMessage: string;
  conversationContext: ConversationContext;
  settings: WorkspaceSettings;
  messageHistory?: MessageHistory[];
  product?: CartItem | null;
}

export interface SalesmanOutput {
  response: string;
  intentDetected: string;
  sentiment: string;
  shouldEscalate: boolean;
  escalationReason?: string;
  suggestedAction: string;
  updatedNegotiationState?: NegotiationState;
}

// ============================================
// MAIN FUNCTION
// ============================================

export async function generateSalesmanResponse(
  input: SalesmanInput
): Promise<SalesmanOutput> {
  const { customerMessage, conversationContext, settings, messageHistory = [], product } = input;

  // Build product context
  const productContext: ProductContext | undefined = product ? {
    productId: product.productId,
    productName: product.productName,
    originalPrice: product.productPrice,
    sizes: (product as any).sizes,
    colors: (product as any).colors,
    stock: (product as any).stock_quantity,
    pricingPolicy: (product as any).pricing_policy,
  } : undefined;

  // Extract negotiation state
  const pricingPolicy = productContext?.pricingPolicy;
  const isNegotiable = pricingPolicy?.isNegotiable ?? false;
  const minPrice = pricingPolicy?.minPrice ?? productContext?.originalPrice ?? 0;
  
  console.log('💰 [AI SALESMAN] Product context:', {
    productName: productContext?.productName,
    price: productContext?.originalPrice,
    pricingPolicy,
    isNegotiable,
    minPrice,
  });
  
  // Build negotiation state if applicable
  let negotiationState: NegotiationState | undefined;
  if (isNegotiable && productContext) {
    const meta = conversationContext.metadata?.negotiation ?? {
      roundNumber: 1,
      currentPrice: productContext.originalPrice,
      customerLastOffer: undefined as number | undefined,
      aiLastOffer: undefined as number | undefined,
    };
    negotiationState = {
      roundNumber: meta.roundNumber || 1,
      originalPrice: productContext.originalPrice,
      minPrice: minPrice,
      currentPrice: meta.currentPrice || productContext.originalPrice,
      customerLastOffer: meta.customerLastOffer,
      aiLastOffer: meta.aiLastOffer,
    };
    console.log('🔄 [AI SALESMAN] Negotiation state:', negotiationState);
  } else {
    console.log('⚠️ [AI SALESMAN] Not negotiable or no product context');
  }

  // Assemble complete prompt
  const workspaceContext = buildWorkspaceContext(settings, productContext);
  const dynamicContext = buildDynamicContext(
    messageHistory,
    negotiationState,
    {
      name: conversationContext.checkout?.customerName,
      isReturning: false, // TODO: Check from customer history
    }
  );

  const fullSystemPrompt = `${UNIVERSAL_SALESMAN_PROMPT}\n\n${workspaceContext}\n\n${dynamicContext}`;

  // Call OpenAI
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  try {
    console.log('🤖 [AI SALESMAN] Generating response...');
    console.log('📝 [AI SALESMAN] Customer message:', customerMessage);
    console.log(`📜 [AI SALESMAN] History: ${messageHistory.length} messages`);

    // Build messages array with conversation history
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: fullSystemPrompt },
    ];
    
    // Add conversation history (last N messages for context)
    for (const msg of messageHistory.slice(-10)) {
      messages.push({
        role: msg.role === 'customer' ? 'user' : 'assistant',
        content: msg.content,
      });
    }
    
    // Add current message
    messages.push({ role: 'user', content: customerMessage });

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o', // Using best model for sales quality
      messages: messages,
      temperature: 0.7, // Some creativity for natural responses
      max_tokens: 500,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content || '{}';
    const parsed: AIResponse = JSON.parse(content);

    console.log('✅ [AI SALESMAN] Response generated:', parsed.intent_detected);

    // Check if this was a negotiation - update state
    // Update state whenever AI mentions a price (not just for NEGOTIATION intent)
    let updatedNegotiationState: NegotiationState | undefined;
    if (negotiationState) {
      // Extract offered price from AI response if counter-offered
      // Pass 1: Try ৳-prefixed prices (e.g., "৳1080")
      let offeredPrice: number | undefined;
      const prefixedMatches = parsed.response.match(/৳([\d,]+)/g);
      if (prefixedMatches && prefixedMatches.length > 0) {
        const lastMatch = prefixedMatches[prefixedMatches.length - 1];
        offeredPrice = parseInt(lastMatch.replace(/[৳,]/g, ''), 10);
      }
      
      // Pass 2: If no ৳-prefixed price found, look for standalone numbers
      // that are within the negotiation range (between minPrice and originalPrice)
      if (!offeredPrice) {
        const standaloneMatches = parsed.response.match(/\b(\d{3,5})\b/g);
        if (standaloneMatches) {
          for (const match of standaloneMatches.reverse()) { // Check last number first
            const num = parseInt(match, 10);
            if (num >= negotiationState.minPrice && num <= negotiationState.originalPrice) {
              offeredPrice = num;
              break;
            }
          }
        }
      }
      
      if (offeredPrice && offeredPrice < negotiationState.originalPrice) {
        console.log(`💰 [AI SALESMAN] Saving negotiated price: ৳${offeredPrice}`);
        updatedNegotiationState = incrementNegotiationRound(
          negotiationState,
          undefined, // Customer offer parsed separately
          offeredPrice
        );
      } else {
        console.log(`⚠️ [AI SALESMAN] No valid negotiated price found in response. Extracted: ${offeredPrice}`);
      }
    }

    return {
      response: parsed.response,
      intentDetected: parsed.intent_detected,
      sentiment: parsed.sentiment,
      shouldEscalate: parsed.should_escalate,
      escalationReason: parsed.escalation_reason || undefined,
      suggestedAction: parsed.suggested_next_action,
      updatedNegotiationState,
    };

  } catch (error) {
    console.error('❌ [AI SALESMAN] Error:', error);
    
    // Fallback response
    return {
      response: 'দুঃখিত, একটু সমস্যা হয়েছে। আবার চেষ্টা করুন অথবা আমাদের সাথে যোগাযোগ করুন। 🙏',
      intentDetected: 'ERROR',
      sentiment: 'neutral',
      shouldEscalate: true,
      escalationReason: 'AI Error',
      suggestedAction: 'ESCALATE',
    };
  }
}

// ============================================
// HELPER: Update context with negotiation state
// ============================================

export function updateContextWithNegotiation(
  context: ConversationContext,
  negotiationState: NegotiationState
): ConversationContext {
  return {
    ...context,
    metadata: {
      ...context.metadata,
      negotiation: {
        productId: context.cart?.[0]?.productId,
        roundNumber: negotiationState.roundNumber,
        currentPrice: negotiationState.currentPrice,
        customerLastOffer: negotiationState.customerLastOffer,
        aiLastOffer: negotiationState.aiLastOffer,
      },
    },
  };
}

// ============================================
// EXPORTS
// ============================================

export { UNIVERSAL_SALESMAN_PROMPT } from './prompts/universal';
export type { ProductContext } from './prompts/workspace';
export { buildWorkspaceContext } from './prompts/workspace';
export type { MessageHistory } from './prompts/context';
export { buildDynamicContext } from './prompts/context';
