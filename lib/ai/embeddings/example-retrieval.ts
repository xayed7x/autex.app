/**
 * Example Retrieval — Semantic Search at Runtime
 *
 * Embeds the customer's message and performs cosine similarity search
 * against stored conversation example embeddings to find the most
 * relevant examples for prompt injection.
 *
 * Graceful fallback: returns [] on any error so the agent continues
 * without examples rather than crashing.
 */

import OpenAI from 'openai';
import { SupabaseClient } from '@supabase/supabase-js';

const EMBEDDING_MODEL = 'text-embedding-3-small';

export interface RetrievedExample {
  customer: string;
  agent: string;
  type: string;
}

/**
 * Retrieves the most semantically relevant conversation examples
 * for a given customer message using pgvector cosine similarity.
 *
 * @param customerMessage - The current customer message to match against
 * @param workspaceId - The workspace to search examples in
 * @param supabase - Supabase client with service role privileges
 * @param topK - Number of examples to retrieve (default: 4)
 * @returns Array of relevant examples, or [] on failure
 */
export async function getRelevantExamples(
  customerMessage: string,
  workspaceId: string,
  supabase: SupabaseClient,
  topK: number = 4
): Promise<RetrievedExample[]> {
  try {
    if (!customerMessage || !customerMessage.trim()) {
      return [];
    }

    // Step 1: Embed the customer message
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const embeddingResponse = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: customerMessage,
    });

    const queryEmbedding = embeddingResponse.data[0].embedding;

    // Step 2: Call the Supabase RPC function for cosine similarity search
    const { data, error } = await supabase.rpc('match_conversation_examples', {
      query_embedding: JSON.stringify(queryEmbedding),
      target_workspace_id: workspaceId,
      match_count: topK,
    });

    if (error) {
      console.error(`[SEMANTIC EXAMPLES] RPC error:`, error.message);
      return [];
    }

    if (!data || data.length === 0) {
      console.log(`[SEMANTIC EXAMPLES] No matching examples found for workspace ${workspaceId}`);
      return [];
    }

    const results: RetrievedExample[] = data.map((row: any) => ({
      customer: row.customer_text,
      agent: row.agent_text,
      type: row.type || 'faq',
    }));

    console.log(`[SEMANTIC EXAMPLES] Retrieved ${results.length} examples (similarities: ${data.map((r: any) => r.similarity?.toFixed(3)).join(', ')})`);

    return results;
  } catch (error: any) {
    // Graceful fallback: return empty array so the agent works without examples
    console.error(`[SEMANTIC EXAMPLES] Retrieval failed (falling back to no examples):`, error.message || error);
    return [];
  }
}
