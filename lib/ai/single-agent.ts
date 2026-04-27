import { AgentInput, AgentOutput } from './shared/types';
import { runFoodAgent } from './agents/food-agent';
import { runClothingAgent } from './agents/clothing-agent';

// Re-export types so orchestrator.ts and others don't break
export type { AgentInput, AgentOutput };

/**
 * Agent Router
 * 
 * Routes the conversational request to the specialized agent
 * based on the business category.
 */
export async function runAgent(input: AgentInput): Promise<AgentOutput> {
  const category = input.settings.businessCategory || 'clothing';
  
  console.log(`[AGENT ROUTER] Routing to: ${category} agent`);
  
  switch (category) {
    case 'food':
      return runFoodAgent(input);
    
    case 'clothing':
    default:
      return runClothingAgent(input);
  }
}
