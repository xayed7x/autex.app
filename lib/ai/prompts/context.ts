/**
 * Dynamic Context Builder
 * 
 * Layer 3 of AI Salesman Core.
 * Injects real-time conversation context:
 * - Conversation History (last N messages)
 * - Negotiation State (rounds, offers)
 * - Customer Profile
 * 
 * @module lib/ai/prompts/context
 */

import { ConversationContext } from '@/types/conversation';
import { NegotiationState, buildNegotiationContext } from './universal';

// ============================================
// TYPES
// ============================================

export interface MessageHistory {
  role: 'customer' | 'bot';
  content: string;
  timestamp?: Date;
}

export interface CustomerProfile {
  name?: string;
  isReturning: boolean;
  previousOrders?: number;
  sentiment?: 'positive' | 'neutral' | 'hesitant' | 'frustrated';
}

// ============================================
// CONVERSATION HISTORY BUILDER
// ============================================

export function buildConversationHistory(
  messages: MessageHistory[],
  maxMessages: number = 10
): string {
  if (!messages.length) {
    return `
## 💬 CONVERSATION HISTORY

No previous messages - this is the start of the conversation.
`;
  }

  // Take last N messages
  const recentMessages = messages.slice(-maxMessages);
  
  const formattedMessages = recentMessages
    .map(msg => `${msg.role === 'customer' ? '👤 Customer' : '🤖 You'}: ${msg.content}`)
    .join('\n');

  return `
## 💬 CONVERSATION HISTORY (Last ${recentMessages.length} messages)

${formattedMessages}
`;
}

// ============================================
// NEGOTIATION STATE BUILDER
// ============================================

export function buildNegotiationState(
  context: ConversationContext,
  productPrice: number,
  minPrice: number
): { state: NegotiationState; prompt: string } {
  // Extract negotiation metadata from context
  const negotiationMeta = context.metadata?.negotiation ?? {
    roundNumber: 1,
    currentPrice: productPrice,
    customerLastOffer: undefined as number | undefined,
    aiLastOffer: undefined as number | undefined,
  };
  
  const state: NegotiationState = {
    roundNumber: negotiationMeta.roundNumber || 1,
    originalPrice: productPrice,
    minPrice: minPrice,
    currentPrice: negotiationMeta.currentPrice || productPrice,
    customerLastOffer: negotiationMeta.customerLastOffer,
    aiLastOffer: negotiationMeta.aiLastOffer,
  };

  return {
    state,
    prompt: buildNegotiationContext(state),
  };
}

// ============================================
// CUSTOMER PROFILE BUILDER
// ============================================

export function buildCustomerProfile(profile: CustomerProfile): string {
  return `
## 👤 CUSTOMER PROFILE

- **Name:** ${profile.name || 'Unknown'}
- **Customer Type:** ${profile.isReturning ? '⭐ Returning Customer' : 'New Customer'}
${profile.previousOrders ? `- **Previous Orders:** ${profile.previousOrders}` : ''}
${profile.sentiment ? `- **Current Mood:** ${profile.sentiment}` : ''}

${profile.isReturning ? '**NOTE:** This is a returning customer. Consider offering loyalty appreciation.' : ''}
`;
}

// ============================================
// COMPLETE CONTEXT BUILDER
// ============================================

export function buildDynamicContext(
  conversationHistory: MessageHistory[],
  negotiationState?: NegotiationState,
  customerProfile?: CustomerProfile
): string {
  let context = '';

  // Add conversation history
  context += buildConversationHistory(conversationHistory);

  // Add negotiation state if in negotiation
  if (negotiationState) {
    context += buildNegotiationContext(negotiationState);
  }

  // Add customer profile if available
  if (customerProfile) {
    context += buildCustomerProfile(customerProfile);
  }

  return context;
}

// ============================================
// UTILITY: Extract messages from DB format
// ============================================

export function extractMessageHistory(
  messages: Array<{ sender_type: string; content: string; created_at: string }>
): MessageHistory[] {
  return messages.map(msg => ({
    role: msg.sender_type === 'customer' ? 'customer' : 'bot',
    content: msg.content,
    timestamp: new Date(msg.created_at),
  }));
}

// ============================================
// UTILITY: Increment negotiation round
// ============================================

export function incrementNegotiationRound(
  currentState: NegotiationState,
  customerOffer?: number,
  aiOffer?: number
): NegotiationState {
  return {
    ...currentState,
    roundNumber: currentState.roundNumber + 1,
    customerLastOffer: customerOffer ?? currentState.customerLastOffer,
    aiLastOffer: aiOffer ?? currentState.aiLastOffer,
    currentPrice: aiOffer ?? currentState.currentPrice,
  };
}
