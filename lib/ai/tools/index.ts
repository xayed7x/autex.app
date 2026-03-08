/**
 * Agent Tools — Barrel Export
 *
 * Single import point for tool definitions and execution.
 *
 * Usage:
 * ```typescript
 * import { AGENT_TOOL_DEFINITIONS, executeTool } from '@/lib/ai/tools';
 * ```
 *
 * @module lib/ai/tools
 */

export { AGENT_TOOL_DEFINITIONS, type AgentToolName } from './definitions';
export {
  executeTool,
  type ToolExecutionResult,
  type ToolExecutionContext,
  type ToolSideEffects,
  type ToolExecutionOutput,
} from './executor';
export {
  searchProducts,
  type ProductSearchResult,
  type SearchProductsOutput,
} from './search-products';
export { saveOrder, type SaveOrderOutput } from './save-order';
export {
  renderOrderConfirmationMessages,
  renderOrderCancelledMessage,
  type OrderData,
  type TransactionalMessages,
} from './transactional-messages';
export { buildNegotiationRules } from './negotiation-rules';
export { runAgent, type AgentInput, type AgentOutput } from '../single-agent';
