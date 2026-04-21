/**
 * API Usage and Cost Tracking
 *
 * Central utility to log OpenAI token usage and calculate costs in USD and BDT.
 * Cost rate configuration is centralized here.
 */

import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';

// ============================================
// CONFIGURATION
// ============================================

export const USD_TO_BDT_RATE = 122.67;


const PRICING = {
  'gpt-4o-mini': {
    inputPer1M: 0.150,
    cachedInputPer1M: 0.075,
    outputPer1M: 0.600,
  },
  'gpt-4o': {
    inputPer1M: 2.50,
    cachedInputPer1M: 1.25, // GPT-4o cached is usually 50%
    outputPer1M: 10.00,
  },
  'whisper-1': {
    costPerMinute: 0.006,
  }
};

// ============================================
// TYPES
// ============================================

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedPromptTokens?: number;
}

export type FeatureName = 
  | 'agent_response' 
  | 'memory_summarization' 
  | 'image_recognition_tier3' 
  | string;

export interface ApiUsagePayload {
  workspaceId: string;
  conversationId?: string;
  imageHash?: string;
  model: string;
  featureName: FeatureName;
  usage?: TokenUsage;
  cost?: number; // Manual override for models like Whisper
}

// ============================================
// FUNCTIONS
// ============================================

/**
 * Calculates the exact cost in USD for a given model and token usage.
 */
export function calculateCostUSD(model: string, usage?: TokenUsage): number {
  if (model === 'whisper-1') return 0; // Handled via manual cost for now
  if (!usage || !usage.totalTokens) return 0;
  
  // Normalize model string in case of versions like gpt-4o-2024-05-13
  const normalizedModel = model.includes('mini') ? 'gpt-4o-mini' : 'gpt-4o';
  const pricing = PRICING[normalizedModel as keyof typeof PRICING] || PRICING['gpt-4o-mini'];

  const cachedTokens = usage.cachedPromptTokens || 0;
  const regularPromptTokens = Math.max(0, usage.promptTokens - cachedTokens);

  const inputCost = (regularPromptTokens / 1_000_000) * pricing.inputPer1M;
  const cachedInputCost = (cachedTokens / 1_000_000) * pricing.cachedInputPer1M;
  const outputCost = (usage.completionTokens / 1_000_000) * pricing.outputPer1M;

  return inputCost + cachedInputCost + outputCost;
}

/**
 * Asynchronously logs API usage to the 'api_usage' table.
 * Designed to be fire-and-forget; catches its own errors so it never blocks the main thread.
 */
export async function logApiUsage(payload: ApiUsagePayload): Promise<void> {
  try {
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    const costUSD = payload.cost ?? calculateCostUSD(payload.model, payload.usage);

    await supabase.from('api_usage').insert({
      workspace_id: payload.workspaceId,
      conversation_id: payload.conversationId || null,
      image_hash: payload.imageHash || null,
      api_type: 'openai', // legacy field, kept for safety
      cost: costUSD,
      model: payload.model,
      feature_name: payload.featureName,
      prompt_tokens: payload.usage?.promptTokens || 0,
      completion_tokens: payload.usage?.completionTokens || 0,
      total_tokens: payload.usage?.totalTokens || 0,
      created_at: new Date().toISOString()
    });

    console.log(`💰 [COST TRACKER] Logged ${payload.featureName} | ${payload.model} | $${costUSD.toFixed(6)} (${(costUSD * USD_TO_BDT_RATE).toFixed(4)} BDT)`);

  } catch (error) {
    // Fire and forget: never crash the app for a logging failure
    console.error(`❌ [COST TRACKER] Failed to log usage for ${payload.featureName}:`, error);
  }
}
