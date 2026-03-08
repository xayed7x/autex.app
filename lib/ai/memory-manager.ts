/**
 * Memory Summarization System
 *
 * Runs synchronously before the single agent is called.
 * If a conversation has >10 messages, it compresses the older messages
 * into a single summary string, saves it to the DB, and passes only
 * the summary + recent 5 messages to the agent.
 *
 * CRITICAL RULE: If summarization fails for any reason, it MUST naturally
 * fall back to returning the full uncompressed history. It must NEVER
 * throw an error that blocks the customer's message flow.
 *
 * @module lib/ai/memory-manager
 */

import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';
import { ChatCompletionMessageParam } from 'openai/resources/index.mjs';
import { logApiUsage } from './usage-tracker';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MAX_MESSAGES_BEFORE_SUMMARY = 10;
const MESSAGES_TO_KEEP = 5;

// ============================================
// TYPES
// ============================================

export interface MemoryResult {
  memorySummary: string | null;
  recentMessages: ChatCompletionMessageParam[];
}

// ============================================
// MAIN FUNCTION
// ============================================

/**
 * Manages conversation history size by summarizing older messages.
 *
 * Algorithm:
 * 1. If messages <= max, return as-is with existing summary.
 * 2. If messages > max, split into 'to_summarize' (old) and 'to_keep' (recent).
 * 3. Include the *existing* summary alongside 'to_summarize' to build a new master summary.
 * 4. Save new summary to DB and delete the old raw messages from DB.
 * 5. Return new summary + 'to_keep' messages.
 *
 * @param workspaceId - The Workspace UUID
 * @param conversationId - The DB conversation UUID
 * @param currentSummary - The existing summary from the DB (if any)
 * @param allMessages - The full array of messages currently loaded
 * @returns Object containing the (possibly updated) summary and the array of messages to pass to the agent
 */
export async function manageMemory(
  workspaceId: string,
  conversationId: string,
  currentSummary: string | null,
  allMessages: ChatCompletionMessageParam[]
): Promise<MemoryResult> {
  // If we are under the limit, no summarization needed
  if (allMessages.length <= MAX_MESSAGES_BEFORE_SUMMARY) {
    return {
      memorySummary: currentSummary,
      recentMessages: allMessages,
    };
  }

  console.log(`🧠 [MEMORY] Conversation has ${allMessages.length} messages. Triggering summarization...`);

  try {
    // 1. Split messages
    // The last N messages we want to keep exactly as they are (fresh context)
    const messagesToKeep = allMessages.slice(-MESSAGES_TO_KEEP);
    // The older messages we want to compress
    const messagesToSummarize = allMessages.slice(0, -MESSAGES_TO_KEEP);

    // 2. Generate the new summary
    const newSummary = await generateSummary(workspaceId, conversationId, currentSummary, messagesToSummarize);

    // 3. Persist to Database (fire and await, but catch locally)
    await persistSummaryToDb(conversationId, newSummary);

    return {
      memorySummary: newSummary,
      recentMessages: messagesToKeep,
    };
  } catch (error) {
    // CRITICAL: If anything fails, swallow the error and return the full history.
    // We NEVER want a DB/OpenAI error in summarization to break the user's flow.
    console.error(`❌ [MEMORY] Summarization failed. Falling back to full history.`, error);
    return {
      memorySummary: currentSummary,
      recentMessages: allMessages,
    };
  }
}

// ============================================
// HELPERS
// ============================================

/**
 * Calls OpenAI to compress older messages into a dense summary.
 */
async function generateSummary(
  workspaceId: string,
  conversationId: string,
  existingSummary: string | null,
  messagesToSummarize: ChatCompletionMessageParam[]
): Promise<string> {
  let promptText = 'Summarize the following e-commerce conversation history between a user and an AI sales assistant.';
  promptText += '\nExtract key facts: customer preferences, items discussed, agreed prices, sizing details, or context.';
  promptText += '\nKeep it extremely dense and concise. Use bullet points.';
  promptText += '\nOmit greetings and fluff.\n\n';

  if (existingSummary) {
    promptText += `=== PREVIOUS SUMMARY ===\n${existingSummary}\n\n`;
  }

  promptText += '=== NEW MESSAGES TO ADD TO SUMMARY ===\n';
  
  for (const msg of messagesToSummarize) {
    const role = msg.role === 'user' ? 'Customer' : 'AI';
    // We stringify tool/system messages safely fallback to content
    const content = typeof msg.content === 'string' ? msg.content : '[Non-text content]';
    if (content) {
      promptText += `${role}: ${content}\n`;
    }
  }

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You are a highly efficient conversation summarizer. Output only the dense summary facts without introductory text.' },
      { role: 'user', content: promptText }
    ],
    temperature: 0.3, // Low temp for factual consistency
    max_tokens: 400,
  });

  if (completion.usage) {
    logApiUsage({
      workspaceId,
      conversationId,
      model: 'gpt-4o-mini',
      featureName: 'memory_summarization',
      usage: {
        promptTokens: completion.usage.prompt_tokens,
        completionTokens: completion.usage.completion_tokens,
        totalTokens: completion.usage.total_tokens,
        cachedPromptTokens: (completion.usage as any).prompt_tokens_details?.cached_tokens,
      }
    });
  }

  return completion.choices[0].message.content || existingSummary || '';
}

/**
 * Saves the new summary to the DB and updates timestamps.
 * 
 * Note: We are currently NOT deleting the old message rows from the `messages` table here
 * because we are relying on next.js edge functions/Vercel timeouts, and deleting rows might be slow.
 * Instead, the orchestrator just reads the summary and the last N messages.
 */
async function persistSummaryToDb(conversationId: string, newSummary: string): Promise<void> {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false },
    }
  );

  const { error } = await supabase
    .from('conversations')
    .update({ 
      memory_summary: newSummary,
      memory_summarized_at: new Date().toISOString()
    })
    .eq('id', conversationId);

  if (error) {
    throw new Error(`Failed to save memory summary to DB: ${error.message}`);
  }
  
  console.log(`💾 [MEMORY] Summary saved to DB for conversation ${conversationId}`);
}
