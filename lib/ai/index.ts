/**
 * AI Salesman Core - Barrel Export
 * 
 * Single import point for all AI Salesman functionality.
 * 
 * Usage:
 * ```typescript
 * import { generateSalesmanResponse, SalesmanInput } from '@/lib/ai';
 * ```
 */

// Main function
export { 
  generateSalesmanResponse,
  updateContextWithNegotiation,
  type SalesmanInput,
  type SalesmanOutput,
} from './salesman-core';

// Prompts (for advanced usage)
export { UNIVERSAL_SALESMAN_PROMPT, type NegotiationState, type AIResponse } from './prompts/universal';
export { buildWorkspaceContext, type ProductContext } from './prompts/workspace';
export { buildDynamicContext, type MessageHistory, extractMessageHistory } from './prompts/context';
