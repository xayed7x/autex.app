/**
 * Clothing-Specific AI Agent
 *
 * Dedicated agent for Clothing/Retail businesses.
 * Hardcoded with size/color logic, negotiation rules, and image recognition context.
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
import { buildNegotiationRules } from '../tools/negotiation-rules';
import { getRelevantExamples, RetrievedExample } from '../embeddings/example-retrieval';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';

// ============================================
// PROMPT BUILDER
// ============================================

function buildClothingSystemPrompt(input: AgentInput, relevantExamples?: RetrievedExample[]): string {
  const { settings, context, memorySummary, currentTime, lastOrderDate } = input;
  const categoryBlocks = getCategoryPromptBlocks('general'); // Use 'general' which is the clothing default

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
- Day After Tomorrow: ${dayAfter.setDate(now.getDate() + 2), dayAfter.toLocaleString('en-US', { weekday: 'long' })}
- Current Time: ${now.toLocaleString('en-US', { timeStyle: 'short' })} (Hour: ${now.getHours()})
- Last Order Placed: ${lastOrderDate ? new Date(lastOrderDate).toLocaleString('en-US', { dateStyle: 'medium' }) : 'No previous orders found'}
`.trim();

  // --- CORE CONSTRAINTS (CLOTHING VERSION) ---
  const coreConstraints = `
${timeContext}

[STRICT CONTEXT ADHERENCE - NO GUESSING]
- **DO NOT BE PROACTIVE**: Never offer information or rules for products that the customer has NOT mentioned. 
- **STAY IN YOUR LANE**: If you don't have enough info, call flag_for_review. DO NOT guess a reason or a date.

[Your actual response to the customer here]

[STRICT TOOL CALLING RULE]
You are PHYSICALLY FORBIDDEN from writing JSON like '{"query":...}' or tool names in your chat response. 
Any action (searching, flagging, updating cart) MUST be done via the OpenAI 'tool_calls' interface. 
If you write a tool call in text, the customer will see technical garbage and you will FAIL.
If you call 'search_products', your text content MUST be an empty string "".


[CORE CONSTRAINTS]
1. **ULTRA-BREVITY & ZERO EXPLANATION (CRITICAL)**: 
   - Absolute maximum of 1-2 sentences. 
   - **NO ROBOTIC APOLOGIES**: You are STRICTLY FORBIDDEN from starting factual answers with "Sorry" or "দুঃখিত". Be direct and confident.
2. **SINGLE-WORD BINARY (CRITICAL)**:
   - If the customer asks a Yes/No question, start with "হ্যাঁ" (Yes) or "না" (No). 
3. **BATCH DATA COLLECTION (CRITICAL)**: 
   - Never ask for info point-by-point. 
   - If multiple pieces of data are missing (e.g., Size, Color, Address, Phone), ask for **ALL** of them in a single concise message. 
   - Goal: Reach the [ORDER SUMMARY] stage as fast as possible.
4. **SILENCE PROTOCOL**: 
   - If the customer sends a passive message (e.g., "Okay", "Thanks", "I see") with no new actionable intent, your response content MUST be an empty string (""). 
`.trim();

  // --- IMAGE RECOGNITION CONTEXT (CLOTHING ONLY) ---
  let imageRecognitionBlock = '';
  if (input.imageRecognitionResult?.recognitionResult?.success) {
    const match = input.imageRecognitionResult.recognitionResult;
    imageRecognitionBlock = `
[SYSTEM: IMAGE RECOGNITION RESULT]
Product: ${match.productName}
Price: ৳${match.productPrice}
`.trim();
    
    if (match.variantStock && Array.isArray(match.variantStock)) {
      const sizeMap = new Map<string, string[]>();
      for (const v of match.variantStock) {
        if ((v.quantity || 0) > 0 && v.size && v.color) {
          const s = v.size.toUpperCase();
          if (!sizeMap.has(s)) sizeMap.set(s, []);
          sizeMap.get(s)!.push(v.color);
        }
      }
      if (sizeMap.size > 0) {
        imageRecognitionBlock += `\nAvailable Stock (size → colors):\n`;
        sizeMap.forEach((colors, size) => {
          imageRecognitionBlock += `  ${size} → ${colors.join(', ')} ✅\n`;
        });
      }
    }
  }

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

${faqExamples.map(ex => `Customer: ${ex.customer}\nAgent Response: ${ex.agent}`).join('\n\n')}`
    : '';

  const flowExamplesBlock = flowExamples.length > 0
    ? `\n[FLOW EXAMPLES — TOOL REQUIRED]
These show product/order handling.
Always call the appropriate tool first. Never simulate tool output.

${flowExamples.map(ex => `Customer: ${ex.customer}\nAgent Response: ${ex.agent}`).join('\n\n')}`
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

  // --- BLOCK 3: CLOTHING RULES ---
  const block3Rules = `
[BLOCK 3 - CATEGORY SPECIFIC RULES: CLOTHING]
${categoryBlocks.rules}
${categoryBlocks.stateMachine || ''}
`.trim();

  // --- BLOCK 7: DYNAMIC STATE (CLOTHING) ---
  const cartDesc = context.cart?.length 
    ? context.cart.map(item => `- ${item.quantity}x ${item.productName} (৳${item.productPrice})`).join('\n')
    : 'EMPTY';
  
  const negotiationRules = buildNegotiationRules(
    context.cart || [], 
    context.metadata?.negotiation,
    context.metadata?.identifiedProducts
  );

  let block7Dynamic = `\n[BLOCK 7 - DYNAMIC STATE]\n=== CURRENT CART ===\n${cartDesc}\n====================`.trim();

  const meta = context.metadata as any;
  if (meta?.activeProductId) {
    const attrs = meta.activeProductAttributes || {};
    const attrLines = [
      attrs.fabric ? `Fabric: ${attrs.fabric}` : null,
      attrs.fitType ? `Fit: ${attrs.fitType}` : null,
      attrs.brand ? `Brand: ${attrs.brand}` : null,
    ].filter(Boolean).join(', ');
    
    block7Dynamic += `\n\n=== ACTIVE PRODUCT ===\nName: ${meta.activeProductName}\nPrice: ৳${meta.activeProductPrice}\n${attrLines}`;
  }

  if (memorySummary) {
    block7Dynamic += `\n\n=== PREVIOUS CONVERSATION SUMMARY ===\n${memorySummary}`;
  }

  if (negotiationRules) {
    block7Dynamic += `\n\n=== NEGOTIATION STATE ===\n${negotiationRules}`;
  }

  const sections = [
    imageRecognitionBlock,
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
 * Main Entry Point for Clothing Agent
 */
export async function runClothingAgent(input: AgentInput): Promise<AgentOutput> {
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
    console.error(`[CLOTHING AGENT] Semantic retrieval failed, falling back to static examples:`, error.message);
  }

  const systemPrompt = buildClothingSystemPrompt(input, relevantExamples);
  const tools = getToolsForCategory('general'); // Tools for clothing
  
  return runAgentLoop(input, systemPrompt, tools);
}
