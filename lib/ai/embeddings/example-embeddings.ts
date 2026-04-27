/**
 * Example Embeddings — Generation & Storage
 *
 * When a workspace owner saves conversation examples, this module:
 * 1. Deletes existing embeddings for the workspace
 * 2. Generates embeddings for each example's customer text via OpenAI
 * 3. Stores them in conversation_example_embeddings for runtime retrieval
 *
 * Non-blocking: errors are logged but never thrown to avoid breaking
 * the settings save flow.
 */

import OpenAI from 'openai';
import { SupabaseClient } from '@supabase/supabase-js';

const EMBEDDING_MODEL = 'text-embedding-3-small';

interface ConversationExample {
  customer: string;
  agent: string;
  type?: 'faq' | 'flow';
}

/**
 * Generates and stores vector embeddings for all conversation examples
 * in a workspace. Replaces any existing embeddings (full refresh).
 *
 * @param workspaceId - The workspace to generate embeddings for
 * @param examples - Array of conversation examples from workspace_settings
 * @param supabase - Supabase client with service role privileges
 */
export async function generateAndStoreExampleEmbeddings(
  workspaceId: string,
  examples: ConversationExample[],
  supabase: SupabaseClient
): Promise<void> {
  try {
    if (!examples || examples.length === 0) {
      console.log(`[EMBEDDINGS] No examples to embed for workspace ${workspaceId}`);
      // Still delete existing embeddings in case all examples were removed
      await supabase
        .from('conversation_example_embeddings')
        .delete()
        .eq('workspace_id', workspaceId);
      return;
    }

    console.log(`[EMBEDDINGS] Generating embeddings for ${examples.length} examples (workspace: ${workspaceId})`);

    // Step 1: Delete existing embeddings for this workspace
    const { error: deleteError } = await supabase
      .from('conversation_example_embeddings')
      .delete()
      .eq('workspace_id', workspaceId);

    if (deleteError) {
      console.error(`[EMBEDDINGS] Failed to delete existing embeddings:`, deleteError.message);
      return;
    }

    // Step 2: Generate embeddings via OpenAI in a single batch call
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const customerTexts = examples.map(ex => ex.customer);

    const embeddingResponse = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: customerTexts,
    });

    // Step 3: Prepare rows for insertion
    const rows = embeddingResponse.data.map((item, index) => ({
      workspace_id: workspaceId,
      example_index: index,
      customer_text: examples[index].customer,
      agent_text: examples[index].agent,
      type: examples[index].type || 'faq',
      embedding: JSON.stringify(item.embedding),
    }));

    // Step 4: Insert all rows
    const { error: insertError } = await supabase
      .from('conversation_example_embeddings')
      .insert(rows);

    if (insertError) {
      console.error(`[EMBEDDINGS] Failed to insert embeddings:`, insertError.message);
      return;
    }

    console.log(`[EMBEDDINGS] ✅ Successfully stored ${rows.length} embeddings for workspace ${workspaceId}`);
  } catch (error: any) {
    // Non-blocking: log and swallow — settings save must not fail because of embeddings
    console.error(`[EMBEDDINGS] Error generating embeddings:`, error.message || error);
  }
}
