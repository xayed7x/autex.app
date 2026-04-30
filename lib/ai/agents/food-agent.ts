/**
 * Food-Specific AI Agent (FAQ/Bible Mode)
 *
 * Dedicated agent for Food/Cake businesses.
 * Strictly follows Conversation Examples (The Bible).
 * Silent on all unknown queries.
 */

import { AgentInput, AgentOutput } from '../shared/types';
import { runAgentLoop } from '../shared/base-runner';
import {
  getIdentityBlock,
  getThinkingBlock,
  getToolUsageBlock,
  getStaticSettingsBlock,
  getInfoRetrievalBlock
} from '../shared/prompt-blocks';
import { getToolsForCategory } from '../tools/definitions';
import { getCategoryPromptBlocks } from '../prompts';
import { getRelevantExamples, RetrievedExample } from '../embeddings/example-retrieval';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';

// ============================================
// PROMPT BUILDER
// ============================================

function buildFoodSystemPrompt(input: AgentInput, relevantExamples?: RetrievedExample[]): string {
  const { settings, context, memorySummary } = input;
  const categoryBlocks = getCategoryPromptBlocks('food');

  // --- CORE CONSTRAINTS ---
  const coreConstraints = `
[ALREADY ANSWERED RULE (highest priority)]
1. IDENTICAL REPETITION: If the customer asks the EXACT SAME question you just answered, return EMPTY (stay silent).
2. SPECIFICITY EXCEPTION: If a customer previously asked a general question (e.g., "price?") and now asks a SPECIFIC question (e.g., "price for this design?" or "price for 2lb?"), this is NOT a repetition. You MUST answer if it matches an example in the Bible.
3. PRODUCT DISCOVERY EXCEPTION: This rule NEVER applies to requests for designs, photos, or "show more" queries. Always fulfill these requests using search_products.
4. BIBLE MATCH PRIORITY: If the current query has a matching example in the Bible that addresses a NEW specific detail or a NEW intent, respond with that answer. One answer per unique topic/detail is required.

[STRICT CONTEXT ADHERENCE - THE BIBLE]
1. **THE BIBLE**: The [CONVERSATION EXAMPLES] block contains the only valid answers.
2. **SILENCE PROTOCOL**: If the customer asks something NOT covered in the examples, respond with an empty string "". 
3. **NO GUESSING**: Do not use business context or FAQs to create new answers. Only mirror the style and content of the examples.
4. **NO PROACTIVITY**: Do not ask follow-up questions or offer assistance.

[STRICT SILENCE CHECKLIST]
Before you respond, run this checklist:
- Is this a request for photos/designs? -> Call search_products + use mandatory CTA text.
- Is there a matching Example in the Bible? -> Use that agent response.
- Did the customer send an image without text? -> Stay silent "".
- Is it a personal or general question (not in Bible)? -> Stay silent "".
- If none of the above matches -> STAY SILENT "".

[SEARCH_PRODUCTS & SHOW MORE RULES]
1. If the customer asks for pictures, designs, or options, call search_products with sendCard: true.
2. PAGINATION: If the customer asks to see MORE ("আরো দেখান", "show more", "আরো ডিজাইন"), call search_products and INCREASE the 'offset' parameter (e.g., set offset to 20 or 50 based on previous results) to show new designs.
3. REPETITION ALLOWED: If no new designs are available, you are allowed to repeat previous designs. NEVER stay silent when designs are explicitly requested.
4. UI search (\`sendCard: true\`) -> Text MUST be EXACTLY: "পছন্দ হয়েছে? এখনই 🛍️ ‘Order Now’ বাটনে ক্লিক করে অর্ডার করুন!"
5. Silent search (\`sendCard: false\`) -> Text MUST be "".
`.trim();

  // --- IMAGE RECOGNITION CONTEXT ---
  let imageRecognitionBlock = '';
  if (input.imageRecognitionResult?.recognitionResult?.success) {
    const match = input.imageRecognitionResult.recognitionResult;
    imageRecognitionBlock = `\n[SYSTEM: IMAGE RECOGNITION RESULT]
Match Found: ${match.productName} (৳${match.productPrice})
Flavor: ${match.product_attributes?.flavor || 'N/A'}

INSTRUCTION: Customer sent a photo of this product. If the Bible (Examples) has a response for recognized images, use it. Otherwise, stay silent "".
`.trim();
  }

  // --- BUSINESS CONTEXT (READ-ONLY) ---
  const businessContextBlock = settings.businessContext?.trim()
    ? `\n[BUSINESS CONTEXT]\n${settings.businessContext}`
    : '';

  // --- CONVERSATION EXAMPLES (THE BIBLE) ---
  const activeExamples = (relevantExamples && relevantExamples.length > 0)
    ? relevantExamples
    : (settings.conversationExamples || []).map((ex: any) => ({
        customer: ex.customer,
        agent: ex.agent,
      }));

  const examplesBlock = activeExamples.length > 0
    ? `\n[CONVERSATION EXAMPLES — THE BIBLE]
These are the ONLY pre-approved answers. Match the customer's intent to these examples and use the agent's response VERBATIM.

${activeExamples.map(ex => `Customer: ${ex.customer}\nAgent Response: ${ex.agent}`).join('\n\n')}`
    : '';

  const identityBlock = getIdentityBlock(settings, categoryBlocks.identity);
  
  const supremeOverride = `
[FINAL SUPREME OVERRIDE]
1. You are a passive FAQ agent. 
2. If the Bible (Examples) doesn't have an answer, stay SILENT "".
3. Never trigger order flows or ask for customer data.
`.trim();

  const sections = [
    identityBlock,
    supremeOverride,
    imageRecognitionBlock,
    coreConstraints,
    categoryBlocks.rules,
    getThinkingBlock(),
    businessContextBlock,
    examplesBlock,
    getToolUsageBlock(),
    getStaticSettingsBlock(settings),
    memorySummary ? `\n[PREVIOUS SUMMARY]\n${memorySummary}` : '',
    getInfoRetrievalBlock(),
  ];

  return sections.filter(Boolean).join('\n\n─────────────────────────────────\n\n');
}

/**
 * Main Entry Point for Food Agent
 */
export async function runFoodAgent(input: AgentInput): Promise<AgentOutput> {
  let relevantExamples: RetrievedExample[] | undefined;
  try {
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    relevantExamples = await getRelevantExamples(
      input.messageText,
      input.workspaceId,
      supabase,
      4
    );
  } catch (error: any) {
    console.error(`[FOOD AGENT] Bible retrieval failed:`, error.message);
  }

  const systemPrompt = buildFoodSystemPrompt(input, relevantExamples);
  const tools = getToolsForCategory('food');
  
  return await runAgentLoop(input, systemPrompt, tools);
}
