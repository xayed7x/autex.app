/**
 * Food-Specific AI Agent (FAQ/Bible Mode)
 *
 * Dedicated agent for Food/Cake businesses.
 * Strictly follows Conversation Examples (The Bible).
 * Silent on all unknown queries.
 */

import { AgentInput, AgentOutput } from '../shared/types';
import { runAgentLoop } from '../shared/base-runner';
import OpenAI from 'openai';
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
// HELPERS
// ============================================

/**
 * Builds a context-enriched intent summary for more accurate vector retrieval.
 */
async function buildIntentSummary(
  currentMessage: string,
  memorySummary: string | null,
  recentMessages: any[]
): Promise<string> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  
  // Take the last 4 messages from recentMessages (fresh context)
  const last4 = recentMessages.slice(-4);
  const formattedHistory = last4.map(m => `${m.role === 'user' ? 'Customer' : 'Bot'}: ${typeof m.content === 'string' ? m.content : '[Media]'}`).join('\n');

  const systemPrompt = `
You are an intent classifier for a Bangladeshi e-commerce chatbot. 
You must think step by step before concluding. Structure your response 
EXACTLY like this:

MEMORY: [what the summary tells you about this customer]
RECENT CONVERSATION: [what the last messages show is happening]
CURRENT MESSAGE: [what the customer just said]
REASONING: [how memory + conversation + current message combine to reveal intent]
INTENT: [one sentence — the actual intent]
`.trim();

  const userPrompt = `
=== CONVERSATION SUMMARY ===
${memorySummary || 'No previous summary'}

=== LAST 4 MESSAGES ===
${formattedHistory}

=== CURRENT MESSAGE ===
${currentMessage}

What is the customer's actual intent?
`.trim();

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 200,
      temperature: 0,
    });
    
    const rawOutput = completion.choices[0].message.content || '';

    console.log('\n========================================')
    console.log('[INTENT CLASSIFIER] Full Reasoning:')
    console.log('----------------------------------------')
    console.log('INPUT — Memory Summary:\n', memorySummary ?? 'None')
    console.log('----------------------------------------')
    console.log('INPUT — Last 4 Messages:\n', 
      recentMessages.slice(-4).map(m => `${m.role}: ${typeof m.content === 'string' ? m.content : '[Media]'}`).join('\n')
    )
    console.log('----------------------------------------')
    console.log('INPUT — Current Message:\n', currentMessage)
    console.log('----------------------------------------')
    console.log('AI REASONING OUTPUT:\n', rawOutput)
    console.log('========================================\n')

    const intentLine = rawOutput.split('\n').find(l => l.startsWith('INTENT:'))
    const intentSummary = intentLine 
      ? intentLine.replace('INTENT:', '').trim() 
      : rawOutput

    return intentSummary;
  } catch (error) {
    console.error('[FOOD AGENT] Intent summary failed, falling back to raw message:', error);
    return currentMessage;
  }
}

// ============================================
// PROMPT BUILDER
// ============================================

function buildFoodSystemPrompt(input: AgentInput, intentSummary: string, relevantExamples?: RetrievedExample[]): string {
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
4. **HARD POST-ORDER LOCK**: You are PHYSICALLY FORBIDDEN from calling search_products if the intent involves an EXISTING or CONFIRMED order (e.g., asking for a preview, photo of their cake, or order update). This tool is for NEW discovery ONLY.
5. UI search (\`sendCard: true\`) -> Text MUST be EXACTLY: "পছন্দ হয়েছে? এখনই 🛍️ ‘অর্ডার করব 🛒’ বাটনে ক্লিক করে অর্ডার করুন!"
6. Silent search (\`sendCard: false\`) -> Text MUST be "".
7. SMART INTENT DETECTION: Use the conversation history and current message to determine if the customer has a GENUINE intent to browse or see product designs. 
   - **YES (Show Cards)**: If they ask for "photos", "designs", "options", "more", or "what do you have?".
   - **NO (Don't Show Cards)**: If they are only asking about accessories (balloons, candles), delivery logistics, or price lists without an explicit request to SEE the items. 
   Always prioritize answering the customer's specific question using the Bible before deciding to trigger a product search.

[STRICT NO-PRICE RULE]
1. You are PHYSICALLY FORBIDDEN from stating any numbers related to price, cost, or money.
2. If the customer asks "How much?", "Price?", or any variation:
   - If it is a GENERAL question (e.g., "What are your prices?"): Say "কেকের দাম ফ্লেভার ও ডিজাইনের উপর নির্ভর করে 😊 আপনি আপনার পছন্দের ডিজাইন বা কত পাউন্ডের কেক চাচ্ছেন তা জানালে আমি সঠিক দাম জানিয়ে দিতে পারব।"
   - If it is a SPECIFIC question (about a specific cake, design, or photo): Stay SILENT "".
3. This rule OVERRIDES all Bible examples. If a Bible example contains a price, you MUST strip the price or stay silent.
`.trim();

  let imageRecognitionBlock = '';
  if (input.imageRecognitionResult?.recognitionResult?.success) {
    const match = input.imageRecognitionResult.recognitionResult;
    const flavor = match.flavor || (match.flavors && match.flavors.length > 0 ? match.flavors[0] : (match.product_attributes?.flavor || 'N/A'));
    imageRecognitionBlock = `\n[SYSTEM: IMAGE RECOGNITION RESULT]
Match Found: ${match.productName}
Flavor: ${flavor}

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
These are the ONLY pre-approved answers. Match the customer's intent to these examples and use the agent's response VERBATIM. ⚠️ STRIP ALL PRICES FROM RESPONSES.

${activeExamples.map(ex => `Customer: ${ex.customer}\nAgent Response: ${ex.agent}`).join('\n\n')}`
    : '';

  const identityBlock = getIdentityBlock(settings, categoryBlocks.identity);
  
  const thinkingBlock = `
[BLOCK 2 - THINKING PROTOCOL]
You MUST perform this internal cognitive process inside [THINK]...[/THINK] tags BEFORE every response.

[PRE-COMPUTED INTENT]
"${intentSummary}"

0. **STATUS & INTENT AUDIT (CRITICAL)**:
   - Does the [PRE-COMPUTED INTENT] indicate that this is an EXISTING/PAST order inquiry? 
   - Keywords to look for: "ordered", "placed order", "confirmed", "my cake", "preview", "delivery date of order".
   - If YES → You are in **POST-ORDER MODE**. Skip all sales tools. Proceed directly to **TIER 4 (Handover)**.

1. **TIER 0 — TOOL DECISION**:
   (Skip this if in POST-ORDER MODE)
   Before checking Bible or Business Context, decide if a tool is needed.
   Use the pre-computed intent to answer these questions:

   A) Does the customer want to DISCOVER or SEE products for the first time?
      → call search_products with sendCard: true

   B) Does the customer want DETAILS about a product already shown?
      (flavor, ingredients, size, weight of a specific product)
      → call search_products with sendCard: false

   C) Does the customer want to ORDER or CONFIRM something?
      → Use order flow tools (add_to_cart, save_order etc.)

   D) Is the customer asking about their EXISTING order, delivery, payment, or any post-order topic?
      → **POST-ORDER MODE**. Proceed to TIER 4.

2. **RESPONSE DECISION — Follow this order strictly**:

   TIER -1 — PRICE CHECK:
   (Skip this if in POST-ORDER MODE)
   Does the intent involve asking for a price?
   - If YES and GENERAL (no specific cake) → Use the general price script.
   - If YES and SPECIFIC (about a design/photo/progress) → SILENCE "".
   - If NO → Proceed to Tier 1.

   TIER 1 — BIBLE CHECK:
   (Skip this if in POST-ORDER MODE)
   Look at the conversation examples provided above.
   Is there an example where the customer intent matches what this customer is asking RIGHT NOW (based on your intent analysis)?
   If YES → respond following that example's style and content (⚠️ STRIP ALL PRICES).

   TIER 2 — BUSINESS CONTEXT CHECK:
   (Skip this if in POST-ORDER MODE)
   Does it contain information that directly answers what the customer is asking?
   If YES → answer naturally using that information. Do not mention "according to our business context." Just answer as Meem would.

   TIER 3 — SILENCE fallback:
   (Skip this if in POST-ORDER MODE)
   If neither Bible nor Business Context has relevant information → return empty string "".

   TIER 4 — HANDOVER (POST-ORDER ONLY):
   If in **POST-ORDER MODE**:
   - 1. CALL \`flag_for_review\` immediately (Reason: Post-Order Inquiry).
   - 2. Your response MUST be ABSOLUTELY SILENT "". Do not say "Okay" or "Wait".

3. **RULE AUDIT**:
   - Check [CORE CONSTRAINTS] and [CATEGORY RULES] for any hard blocks.

4. **FINAL DECISION**: 
   - Determine the final response (verbatim example, fact-based answer, or silence).
[/THINK]
`.trim();

  const supremeOverride = `
[FINAL SUPREME OVERRIDE]
1. You are a passive FAQ agent. 
2. If the Bible (Examples) doesn't have an answer, stay SILENT "".
3. NEVER provide price numbers.
4. Never trigger order flows or ask for customer data.
`.trim();

  const sections = [
    identityBlock,
    supremeOverride,
    imageRecognitionBlock,
    coreConstraints,
    categoryBlocks.rules,
    thinkingBlock,
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

    // Build context-enriched intent summary before retrieval
    const intentSummary = await buildIntentSummary(
      input.messageText,
      input.memorySummary,
      input.conversationHistory
    );
    console.log('[FOOD AGENT] Intent Summary for retrieval:', intentSummary);

    relevantExamples = await getRelevantExamples(
      intentSummary,
      input.workspaceId,
      supabase,
      4
    );

    const systemPrompt = buildFoodSystemPrompt(input, intentSummary, relevantExamples);
    const tools = getToolsForCategory('food');
    
    return await runAgentLoop(input, systemPrompt, tools);
  } catch (error: any) {
    console.error(`[FOOD AGENT] Bible retrieval failed:`, error.message);
    const systemPrompt = buildFoodSystemPrompt(input, input.messageText, []);
    const tools = getToolsForCategory('food');
    return await runAgentLoop(input, systemPrompt, tools);
  }
}
