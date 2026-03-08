/**
 * Intent System - Main Entry Point
 * 
 * This is the Intent-First Architecture for handling ANY customer message.
 * 
 * Usage:
 * ```
 * import { processWithIntent } from '@/lib/conversation/intent';
 * 
 * const result = await processWithIntent(message, context, settings);
 * ```
 */

export { classifyIntent } from './classifier';
export type { IntentType, ClassifiedIntent } from './classifier';
export { handleIntent } from './handlers';
export type { IntentHandlerResult } from './handlers';

import { classifyIntent, ClassifiedIntent } from './classifier';
import { handleIntent, IntentHandlerResult } from './handlers';
import { ConversationContext } from '@/types/conversation';
import { WorkspaceSettings } from '@/lib/workspace/settings';
import { generateSalesmanResponse, updateContextWithNegotiation, MessageHistory } from '@/lib/ai';

/**
 * Main entry point - classifies intent and handles it
 * Falls back to AI Salesman Core for complex conversations
 */
export async function processWithIntent(
  message: string,
  context: ConversationContext,
  settings?: WorkspaceSettings,
  conversationHistory?: Array<{ sender: string; message: string; timestamp: string }>
): Promise<IntentHandlerResult & { intent: ClassifiedIntent }> {
  // Step 1: Classify the intent
  const intent = await classifyIntent(message, context);
  
  console.log(`🎯 [INTENT] Classified: ${intent.intent} (${intent.source}, confidence: ${intent.confidence})`);
  
  // Step 2: Try standard intent handlers first
  const result = handleIntent(intent, message, context, settings);
  
  console.log(`📤 [INTENT] Handler result: handled=${result.handled}, newState=${result.newState}`);
  
  // Step 3: If not handled, decide whether to use AI Salesman Core or route to AI Director
  // 
  // CRITICAL GUARD: AI Salesman Core should ONLY handle messages about an ACTIVE product
  // in context (negotiation, questions about it, ordering it). It should NEVER handle:
  // - PRODUCT_SEARCH intents (customer looking for a NEW product)
  // - UNKNOWN intents in IDLE state (likely a product search or general question)
  // These must fall through to AI Director which has SEARCH_PRODUCTS capability.
  
  const isProductSearch = intent.intent === 'PRODUCT_SEARCH';
  const isUnknownInIdle = intent.intent === 'UNKNOWN' && context.state === 'IDLE';
  const hasActiveProduct = context.cart && context.cart.length > 0;
  const shouldSkipSalesman = isProductSearch || isUnknownInIdle;
  
  if (!result.handled && settings && !shouldSkipSalesman && hasActiveProduct) {
    console.log('🤖 [AI SALESMAN] Active product in context + non-search intent → using AI Salesman Core...');
    
    try {
      // Get product from cart OR from pendingImages (for pre-Order Now queries)
      let product = context.cart?.[0] || null;
      
      if (!product && context.pendingImages?.length) {
        // Use the most recent successfully recognized pending image
        const recognized = context.pendingImages
          .filter(img => img.recognitionResult.success)
          .sort((a, b) => b.timestamp - a.timestamp)[0];
        
        if (recognized?.recognitionResult?.productId) {
          // Fetch FULL product from DB to get pricing_policy and description
          const { getProductById } = await import('@/lib/db/products');
          const fullProduct = await getProductById(recognized.recognitionResult.productId);
          
          if (fullProduct) {
            console.log(`📦 [AI SALESMAN] Fetched full product: ${fullProduct.name}`);
            const productAny = fullProduct as any;
            product = {
              productId: fullProduct.id,
              productName: fullProduct.name,
              productPrice: fullProduct.price,
              quantity: 1,
              imageUrl: fullProduct.image_urls?.[0],
              sizes: fullProduct.sizes,
              colors: fullProduct.colors,
              pricing_policy: productAny.pricing_policy,
              description: fullProduct.description,
            } as any;
          } else {
            // Fallback to basic pendingImage data
            const rec = recognized.recognitionResult;
            product = {
              productId: rec.productId || '',
              productName: rec.productName || 'Unknown Product',
              productPrice: rec.productPrice || 0,
              quantity: 1,
            } as any;
            console.log(`📦 [AI SALESMAN] Using basic pending image: ${product?.productName}`);
          }
        }
      }
      
      // Convert conversation history to MessageHistory format
      const messageHistory: MessageHistory[] = (conversationHistory || []).map(msg => ({
        role: msg.sender === 'customer' ? 'customer' as const : 'bot' as const,
        content: msg.message,
        timestamp: msg.timestamp ? new Date(msg.timestamp) : undefined,
      }));
      
      const salesmanResult = await generateSalesmanResponse({
        customerMessage: message,
        conversationContext: context,
        settings: settings,
        product: product,
        messageHistory: messageHistory,
      });
      
      console.log(`🤖 [AI SALESMAN] Intent: ${salesmanResult.intentDetected}, Action: ${salesmanResult.suggestedAction}`);
      
      // Update context with negotiation state if applicable
      let updatedContext: Partial<ConversationContext> = {};
      if (salesmanResult.updatedNegotiationState) {
        const newContext = updateContextWithNegotiation(context, salesmanResult.updatedNegotiationState);
        updatedContext = { metadata: newContext.metadata };
      }
      
      return {
        handled: true,
        response: salesmanResult.response,
        newState: context.state, // AI Salesman doesn't change state directly
        updatedContext,
        intent,
        flagManual: salesmanResult.shouldEscalate,
        flagReason: salesmanResult.escalationReason,
      };
    } catch (error) {
      console.error('❌ [AI SALESMAN] Error:', error);
      // Fall through to return unhandled result
    }
  } else if (!result.handled && shouldSkipSalesman) {
    console.log(`🚫 [AI SALESMAN] SKIPPED — intent=${intent.intent}, state=${context.state}, reason=${isProductSearch ? 'PRODUCT_SEARCH → route to AI Director' : 'UNKNOWN in IDLE → route to AI Director'}`);
  } else if (!result.handled && !hasActiveProduct) {
    console.log(`🚫 [AI SALESMAN] SKIPPED — no active product in context, routing to AI Director`);
  }
  
  return {
    ...result,
    intent,
  };
}

