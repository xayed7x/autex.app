import { CLOTHING_IDENTITY, CLOTHING_RULES, CLOTHING_ORDER_SUMMARY_RULES } from './clothing';
import { FOOD_IDENTITY, FOOD_RULES, FOOD_ORDER_SUMMARY_RULES, FOOD_STATE_MACHINE, FOOD_POST_ORDER_POLICY } from './food';

export interface CategoryPromptBlocks {
  identity: string;
  rules: string;
  orderSummaryRules: string;
  stateMachine?: string;
}

export function getCategoryPromptBlocks(category: string): CategoryPromptBlocks {
  if (category === 'food') {
    return {
      identity: FOOD_IDENTITY,
      rules: `${FOOD_RULES}\n\n${FOOD_POST_ORDER_POLICY}`,
      orderSummaryRules: FOOD_ORDER_SUMMARY_RULES,
      stateMachine: FOOD_STATE_MACHINE,
    };
  }

  // Default to Clothing/General
  return {
    identity: CLOTHING_IDENTITY,
    rules: CLOTHING_RULES,
    orderSummaryRules: CLOTHING_ORDER_SUMMARY_RULES,
  };
}
