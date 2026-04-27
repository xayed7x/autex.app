/**
 * Food-Specific AI Agent
 *
 * Dedicated agent for Food/Cake businesses.
 * Hardcoded with food-specific logic, wait messages, and form scrubbing.
 */

import { AgentInput, AgentOutput } from '../shared/types';
import { runAgentLoop } from '../shared/base-runner';
import {
  getIdentityBlock,
  getThinkingBlock,
  getToolUsageBlock,
  getOrderFlowBlock,
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
  const { settings, context, memorySummary, currentTime, lastOrderDate } = input;
  const categoryBlocks = getCategoryPromptBlocks('food');

  // --- TIME CONTEXT ---
  const now = currentTime ? new Date(currentTime) : new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const dayAfter = new Date(now);
  dayAfter.setDate(now.getDate() + 2);

  const timeContext = `
[TIME CONTEXT]
- Today: ${now.toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
- Tomorrow: ${tomorrow.toLocaleString('en-US', { weekday: 'long' })}
- Day After Tomorrow: ${dayAfter.toLocaleString('en-US', { weekday: 'long' })}
- Current Time: ${now.toLocaleString('en-US', { timeStyle: 'short' })} (Hour: ${now.getHours()})
- Last Order Placed: ${lastOrderDate ? new Date(lastOrderDate).toLocaleString('en-US', { dateStyle: 'medium' }) : 'No previous orders found'}
`.trim();

  // --- CORE CONSTRAINTS (FOOD VERSION) ---
  const coreConstraints = `
${timeContext}

[STRICT CONTEXT ADHERENCE - NO GUESSING]
- **DO NOT BE PROACTIVE**: Never offer information or rules for products that the customer has NOT mentioned. 
- **NO PRODUCT LEAKS**: If a customer is ordering a custom design (image), you are FORBIDDEN from mentioning catalog items (like Red Velvet) or their specific rules.
- **STAY IN YOUR LANE**: If you don't have enough info, call flag_for_review. DO NOT guess a reason or a date.

[Your actual response to the customer here]

[STRICT TOOL CALLING RULE]
You are PHYSICALLY FORBIDDEN from writing JSON like '{"query":...}' or tool names in your chat response. 
Any action (searching, flagging, updating cart) MUST be done via the OpenAI 'tool_calls' interface. 
If you call 'search_products', your text content MUST be an empty string "".


[CORE CONSTRAINTS]
1. **STATE-AWARE HANDOVER GATE (CRITICAL)**: 
   - If the customer sends a custom image or describes a bespoke design (Scenario 2), you MUST call \`flag_for_review\`.
   - **HISTORY SCAN**: Check if you or the system already sent the wait message ("আপনার পাঠানো ডিজাইন অনুযায়ী...") in the last 2 bot messages.
   - **RELEVANCE CHECK**: 
     - If the wait message was NOT sent: Include it.
      - If the wait message WAS already sent:
        - If the customer asks for the **PRICE** again (e.g., "dam koto", "price?"): Stay SILENT (empty string). You already told them you are calculating it.
        - If the customer asks a **NEW/DIFFERENT** question (e.g., "Delivery charge koto?", "Shop kothay?", "Stock ase?"): ANSWER it directly based on the [BUSINESS CONTEXT].
        - If the customer only sent passive text (e.g., "okay", "thanks"): Stay SILENT (empty string).
   - You are NO LONGER restricted to only the wait message; you must be helpful while remaining silent on the final price calculation.
2. **ULTRA-BREVITY & ZERO EXPLANATION (CRITICAL)**: 
   - Absolute maximum of 1-2 sentences. 
   - **NO ROBOTIC APOLOGIES**: You are STRICTLY FORBIDDEN from starting factual answers (Address, Price, Policy) with "Sorry" or "দুঃখিত". Be direct and confident.
3. **SINGLE-WORD BINARY (CRITICAL)**:
   - If the customer asks a Yes/No question, start with "হ্যাঁ" (Yes) or "না" (No). 
4. **SCENARIO 1: GENERIC PRICE INQUIRY (NO ACTIVE CUSTOM DESIGN)**:
    - **TRIGGER**: ONLY trigger if:
      1. The customer asks about price/flavors.
      2. AND there is NO image in the current turn.
      3. AND the [MEMORY SUMMARY] has NO mention of a sent image, design, or custom product.
    - **TOOL CALL RULE**: When calling \`search_products\` under Scenario 1:
       - Set \`sendCard: false\` — you are retrieving price/flavor info only.
       - NEVER set \`sendCard: true\` unless the customer used words like 'দেখান', 'দেখতে চাই', 'ছবি দিন', 'design দেখান', 'options দেখান'.
       - If customer asked a question (price, delivery, availability) → sendCard: false, always.
    - **FORBIDDEN**: If an image was EVER sent (check [MEMORY SUMMARY]), you are FORBIDDEN from using this generic response.
    - **RESPONSE**: “কেকের দাম ফ্লেভার ও ডিজাইনের উপর নির্ভর করে 😊\n👉 ২ পাউন্ড ভ্যানিলা: ১৪০০ টাকা\n👉 ২ পাউন্ড চকলেট: ১৬০০ টাকা\nআপনার পছন্দের ডিজাইন/ডিটেইলস দিলে সঠিক দাম জানিয়ে দিতে পারব।”

5. **SCENARIO 2: CUSTOM DESIGN INQUIRY (IMAGE SENT OR PENDING)**:
    - **TRIGGER**: Trigger if an image was sent THIS turn **OR** if the [MEMORY SUMMARY] mentions a previous design/image.
    - **PRODUCT ISOLATION (STRICT)**: You are **FORBIDDEN** from assuming the customer is ordering a named product from your catalog (e.g., Red Velvet Cheesecake) just because they sent an image. 
    - **OWNER AUTHORITY**: If the Assistant (Bot or Owner) has ALREADY sent a price (e.g., "২২০০ টাকা"), this is the FINAL price. 
    - **PRICE PROHIBITION (ABSOLUTE)**: You are PHYSICALLY FORBIDDEN from calculating, estimating, or stating ANY price for a custom design yourself. You do NOT have access to custom pricing. If the customer asks 'price koto hobe?' before the owner has responded: Stay SILENT or say 'হিসাব করা হচ্ছে, একটু অপেক্ষা করুন 😊' — nothing more.
    - **TOOL CALL RULE**: Never call \`search_products\` during a custom design conversation. 
       Customer is ordering custom — catalog cards are irrelevant and confusing.
    - **Wait Message**: ONLY send the "Price is being calculated" message if the Assistant has not given a price yet.
6. **WEIGHT & AVAILABILITY PROTOCOL (CRITICAL)**:
    - **CATALOG DEFAULT**: Our standard catalog cakes are listed with a default weight. This is a display default ONLY.
    - **ABSOLUTE PROHIBITION**: You are PHYSICALLY FORBIDDEN from stating any weight limitation to the customer. 
      NEVER say: "আমাদের ২ পাউন্ডের কম/বেশি নেই", "এই সাইজ নেই", or ANY sentence implying a product does not exist in a certain weight.
      You do NOT know what weights are available. Only the owner knows.
    - If the customer asks for ANY specific weight (e.g., "1 Pound", "3 Pound", "half pound"):
      RESPONSE: "আপনার পছন্দ অনুযায়ী তৈরি করা যাবে ইনশাআল্লাহ 😊 একটু wait করুন, আমি চেক করে জানাচ্ছি।"
      ACTION: Call \`flag_for_review\` IMMEDIATELY with reason: "Customer requested custom weight: [state the weight they asked for]"
    - If the customer asks about price for a specific weight:
      RESPONSE: Same wait message above.
      ACTION: Call \`flag_for_review\` IMMEDIATELY.
7. **SILENCE PROTOCOL**: 
   - If the customer sends a passive message (e.g., "Okay", "Thanks", "I see") with no new actionable intent, your response content MUST be an empty string (""). 
`.trim();

  // --- BUSINESS CONTEXT ---
  const businessContextBlock = settings.businessContext?.trim()
    ? `\n[BUSINESS CONTEXT - GROUND TRUTH]\n${settings.businessContext}`
    : '';

  // --- CONVERSATION EXAMPLES (Semantic Retrieval with FAQ/Flow Split) ---
  const activeExamples = (relevantExamples && relevantExamples.length > 0)
    ? relevantExamples
    : (settings.conversationExamples || []).map((ex: any) => ({
        customer: ex.customer,
        agent: ex.agent,
        type: ex.type || 'faq',
      }));

  const faqExamples = activeExamples.filter(e => e.type === 'faq');
  const flowExamples = activeExamples.filter(e => e.type === 'flow');

  const faqExamplesBlock = faqExamples.length > 0
    ? `\n[FAQ EXAMPLES — DIRECT ANSWER]
These are direct answers to business questions.
If customer message matches → answer directly. No tool needed.
- **SUPREME PRECEDENCE (CRITICAL)**: If a customer's message matches a scenario below, you MUST use the 'Agent Response' as your guide.
- **EXACT MATCH (VERBATIM)**: If the customer's message matches an example below, you MUST use the owner's provided answer EXACTLY.
- **STRICT RULE**: If an example contains a manual form, IGNORE the form and call \`trigger_quick_form\` instead.

${faqExamples.map(ex => {
  let response = ex.agent;
  // Scrub form-like lines (numbered lists or specific keywords in Bengali)
  response = response.replace(/\d+\.\s*(ঠিকানা|মোবাইল|নাম|ফ্লেভার|তারিখ|সময়|ডেলিভারি সময়)[\s\S]*/gi, '[TOOL: trigger_quick_form]');
  return `Customer: ${ex.customer}\nAgent Response: ${response}`;
}).join('\n\n')}`
    : '';

  const flowExamplesBlock = flowExamples.length > 0
    ? `\n[FLOW EXAMPLES — TOOL REQUIRED]
These show product/order handling.
Always call the appropriate tool first. Never simulate tool output.

${flowExamples.map(ex => {
  let response = ex.agent;
  response = response.replace(/\d+\.\s*(ঠিকানা|মোবাইল|নাম|ফ্লেভার|তারিখ|সময়|ডেলিভারি সময়)[\s\S]*/gi, '[TOOL: trigger_quick_form]');
  return `Customer: ${ex.customer}\nAgent Response: ${response}`;
}).join('\n\n')}`
    : '';

  // --- DELIVERY ZONES ---
  const deliveryZones = (settings as any).deliveryZones;
  const deliveryZonesBlock = Array.isArray(deliveryZones) && deliveryZones.length > 0
    ? `\n[DELIVERY ZONES]\nAvailable delivery zones:\n${deliveryZones.map((z: any) => `- ${z.label}: ৳${z.amount}`).join('\n')}`
    : '';

  // --- CUSTOM FAQs ---
  const faqs = settings.customFaqs;
  const faqsBlock = Array.isArray(faqs) && faqs.length > 0
    ? `\n[CUSTOM FAQs - FREQUENTLY ASKED QUESTIONS]\n${faqs.map((f: any) => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n')}`
    : '';

  // --- BLOCK 3: FOOD RULES ---
  const block3Rules = `
[BLOCK 3 - CATEGORY SPECIFIC RULES: FOOD/CAKE]
${categoryBlocks.rules}
${categoryBlocks.stateMachine || ''}
`.trim();

  // --- BLOCK 7: DYNAMIC STATE (FOOD) ---
  const cartDesc = context.cart?.length 
    ? context.cart.map(item => `- ${item.quantity}x ${item.productName} (৳${item.productPrice})`).join('\n')
    : 'EMPTY';
  
  let block7Dynamic = `\n[BLOCK 7 - DYNAMIC STATE]\n=== CURRENT CART ===\n${cartDesc}\n====================`.trim();

  const meta = context.metadata as any;
  if (meta?.activeProductId) {
    block7Dynamic += `\n\n=== ACTIVE PRODUCT ===\nName: ${meta.activeProductName}\nPrice: ৳${meta.activeProductPrice}`;
  }

  if (memorySummary) {
    block7Dynamic += `\n\n=== PREVIOUS CONVERSATION SUMMARY ===\n${memorySummary}`;
  }

  const sections = [
    businessContextBlock,
    faqExamplesBlock,
    coreConstraints,
    deliveryZonesBlock,
    faqsBlock,
    getIdentityBlock(settings, categoryBlocks.identity),
    getThinkingBlock(),
    block3Rules,
    getToolUsageBlock(),
    flowExamplesBlock,
    getOrderFlowBlock(settings),
    getStaticSettingsBlock(settings),
    block7Dynamic,
    getInfoRetrievalBlock(),
  ];

  return sections.filter(Boolean).join('\n\n─────────────────────────────────\n\n');
}

/**
 * Main Entry Point for Food Agent
 */
export async function runFoodAgent(input: AgentInput): Promise<AgentOutput> {
  // Fetch semantically relevant examples via pgvector
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
    console.error(`[FOOD AGENT] Semantic retrieval failed, falling back to static examples:`, error.message);
  }

  const systemPrompt = buildFoodSystemPrompt(input, relevantExamples);
  const tools = getToolsForCategory('food');
  
  const result = await runAgentLoop(input, systemPrompt, tools);

  // --- FOOD-SPECIFIC SAFETY FILTER ---
  const scenario2Wait = "আপনার পাঠানো ডিজাইন অনুযায়ী কেকের দাম হিসাব করে জানানো হচ্ছে";
  const legacyWait = "আমি আপনার জন্য দাম টা হিসাব করে জানাচ্ছি। একটু wait করুন";
  
  if (result.response && (result.response.includes(scenario2Wait) || result.response.includes(legacyWait))) {
    const cleanWait = "আপনার পাঠানো ডিজাইন অনুযায়ী কেকের দাম হিসাব করে জানানো হচ্ছে ⏳ দয়া করে একটু অপেক্ষা করুন, শিগগিরই আপডেট দিচ্ছি 😊";
    const cleanLegacy = "আমি আপনার জন্য দাম টা হিসাব করে জানাচ্ছি। একটু wait করুন 😊";
    
    if (result.response.includes(scenario2Wait)) {
      result.response = result.response.replace(/আপনার পাঠানো ডিজাইন অনুযায়ী.*?😊/g, cleanWait);
      if (!result.response.includes(cleanWait)) result.response = result.response.replace(scenario2Wait, cleanWait);
    } else if (result.response.includes(legacyWait)) {
      result.response = result.response.replace(legacyWait, cleanLegacy);
    }
  }

  return result;
}
