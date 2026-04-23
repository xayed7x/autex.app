/**
 * Single Agent Core
 *
 * This is the central brain of the new AI architecture. It replaces the old
 * multi-layered intent system with a single ChatGPT-style agent.
 *
 * Features:
 * - Powered by gpt-4o-mini
 * - Tool-calling loop (max 10 iterations to prevent infinite loops)
 * - Dynamic system prompt injection (Memory, Cart, Rules, Image Context)
 * - Strict anti-hallucination enforcing the "Meem" persona
 *
 * @module lib/ai/single-agent
 */

import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/index.mjs';
import { WorkspaceSettings } from '@/lib/workspace/settings-cache';
import { getToolsForCategory, type AgentToolName } from './tools/definitions';
import { executeTool } from './tools/executor';
import { buildNegotiationRules } from './tools/negotiation-rules';
import { logApiUsage } from './usage-tracker';
import { getCategoryPromptBlocks } from './prompts';
import { buildOrderCollectionInstruction } from './prompts/order-flow';
import { ConversationContext, PendingImage } from '@/types/conversation';
import { getCatalogSummary } from '@/lib/db/products';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MAX_TOOL_LOOPS = 10;

// ============================================
// TYPES
// ============================================

export interface AgentInput {
  workspaceId: string;
  fbPageId: string;
  conversationId: string;
  messageText: string;
  customerPsid: string;
  replyContext?: string;
  imageRecognitionResult?: PendingImage | null;
  conversationHistory: ChatCompletionMessageParam[]; // Last 10 messages
  memorySummary: string | null;                      // Summary of older messages
  context: ConversationContext;                      // Current DB state (cart, etc)
  settings: WorkspaceSettings;                       // Workspace configs
  currentTime?: string;                              // Current server time (ISO)
  lastOrderDate?: string | null;                     // When the last order was placed
}

export interface AgentOutput {
  response: string;
  shouldFlag: boolean;
  flagReason?: string;
  toolsCalled: string[];
  toolCallsMade: number;
}

// ============================================
// MAIN AGENT FUNCTION
// ============================================

/**
 * Executes a single conversational turn with the AI Agent.
 * Handles the recursive tool-calling loop.
 */
export async function runAgent(input: AgentInput): Promise<AgentOutput> {
  const catalogSummary = await getCatalogSummary(input.workspaceId);
  const systemPrompt = generateSystemPrompt(input, catalogSummary);

  // Sanitize history from reasoning blocks
  const sanitizedHistory = input.conversationHistory.map(msg => {
    if (typeof msg.content === 'string') {
      return {
        ...msg,
        content: msg.content
          .replace(/\[THINK\][\s\S]*?(\[\/THINK\]|$)/gi, '') // Handle unclosed tags
          .replace(/\[REASONING\][\s\S]*?(\[\/REASONING\]|$)/gi, '')
          // Strip technical leakage and past typos from history
          .replace(/flag_for_review/gi, '')
          .replace(/add_to_cart/gi, '')
          .replace(/search_products/gi, '')
          .replace(/🔍 আমি এই বিষয়টি পর্যালোচনা করতে.*/gi, '') // Hallucination 1
          .replace(/.*ককত হবে.*/gi, '') // Hallucination 2 (Typo)
          .trim()
      };
    }
    return msg;
  });

  // Initialize message sequence for this turn (ensure current message isn't duplicated)
  const previousHistory = [...sanitizedHistory];
  if (
    previousHistory.length > 0 && 
    previousHistory[previousHistory.length - 1].role === 'user' && 
    previousHistory[previousHistory.length - 1].content === input.messageText
  ) {
    previousHistory.pop();
  }

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...previousHistory,
  ];

  // Append current user message (handling potential image context)
  let userContent = input.messageText;
  
  // Add Reply Context if available
  if (input.replyContext) {
    userContent = `${input.replyContext}\n\n${userContent}`;
  }
  
  if (input.imageRecognitionResult?.recognitionResult?.success) {
    const match = input.imageRecognitionResult.recognitionResult;
    userContent += `\n\n[SYSTEM: IMAGE RECOGNITION RESULT]\n`;
    userContent += `Product: ${match.productName}\n`;
    userContent += `Price: ৳${match.productPrice}\n`;
    
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
        userContent += `Available Stock (size → colors):\n`;
        sizeMap.forEach((colors, size) => {
          userContent += `  ${size} → ${colors.join(', ')} ✅\n`;
        });
      }
    } else {
      if (match.sizes?.length) {
        userContent += `Available Sizes: ${match.sizes.join(', ')}\n`;
      }
      if (match.colors?.length) {
        userContent += `Available Colors: ${match.colors.join(', ')}\n`;
      }
    }
    
    if (match.description) {
      const truncatedDesc = match.description.length > 150 ? match.description.substring(0, 150) + '...' : match.description;
      userContent += `Description: ${truncatedDesc}\n`;
    }
    
    if (match.product_attributes) {
      const attrs = match.product_attributes;
      const attrLines = [
        attrs.fabric ? `Fabric: ${attrs.fabric}` : null,
        attrs.fitType ? `Fit: ${attrs.fitType}` : null,
        attrs.occasion ? `Occasion: ${attrs.occasion}` : null,
        attrs.brand ? `Brand: ${attrs.brand}` : null,
      ].filter(Boolean).join(', ');
      if (attrLines) userContent += `Details: ${attrLines}\n`;
    }
    
    userContent += `\n[SYSTEM NOTE]: Customer sent a product image. The recognized product is above.

Your response MUST:
1. Briefly introduce the product (name + price) in a natural, warm way
2. Mention the product card with order button is being sent
3. Use the above description/details to answer any questions in the same message
4. Do NOT ask for size or color yet
5. Wait for customer to click the order button or express intent to order

Example response style:
"এটা আমাদের [product name]! দাম ৳[price]। 
অর্ডার করতে চাইলে নিচের কার্ডের 
'Order now 🛒' বাটনে ক্লিক করুন 😊"`;
  } else if (input.imageRecognitionResult?.recognitionResult?.aiAnalysis) {
    const ai = input.imageRecognitionResult.recognitionResult.aiAnalysis;
    const isInspiration = input.imageRecognitionResult.recognitionResult.isInspiration;
    
    userContent += `\n\n[SYSTEM: IMAGE CONTENT (NO GALLERY MATCH)]\n`;
    userContent += `Visual Category: ${ai.category || 'unknown'}\n`;
    userContent += `Description Keywords: ${ai.visual_description_keywords?.join(', ') || 'none'}\n`;
    userContent += `Color/Material: ${ai.color || 'n/a'} / ${ai.material || 'n/a'}\n`;
    
    if (ai.category?.toLowerCase() === 'food' || ai.visual_description_keywords?.some(k => k.toLowerCase().includes('cake'))) {
      userContent += `Tag: Potential Custom Design (Food)\n`;
    } else {
      userContent += `Tag: Unrelated Item (Non-Food)\n`;
    }
    
    if (isInspiration) {
      userContent += `[SYSTEM NOTE]: Customer sent an image that does NOT match any product in our gallery.
      
Rules for this turn:
1. If the image is a cake or food item, it is a CUSTOM DESIGN. You MUST call \`flag_for_review\` immediately.
2. If the image is NOT a food item (e.g., shirt, list, electronics), it is an UNRELATED ITEM. You MUST call \`flag_for_review\` immediately.
3. You are STRICTLY FORBIDDEN from generating any text response yourself. Call the tool and STOP.`;
    }
  }

  messages.push({ role: 'user', content: userContent.trim() || "[User sent an image]" });

  let toolLoops = 0;
  let finalResponse = '';
  let shouldFlag = false;
  let toolsCalledLog: string[] = [];
  let flaggedForManual = false;
  let flagReason = '';

  // The Tool-Calling Loop
  while (toolLoops < MAX_TOOL_LOOPS) {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      tools: getToolsForCategory(input.settings.businessCategory || 'general'),
      tool_choice: 'auto',
      parallel_tool_calls: false,
      temperature: 0.7,
    });

    if (completion.usage) {
      logApiUsage({
        workspaceId: input.workspaceId,
        conversationId: input.conversationId,
        model: 'gpt-4o-mini',
        featureName: 'agent_response',
        usage: {
          promptTokens: completion.usage.prompt_tokens,
          completionTokens: completion.usage.completion_tokens,
          totalTokens: completion.usage.total_tokens,
          cachedPromptTokens: (completion.usage as any).prompt_tokens_details?.cached_tokens,
        }
      });
    }

    const responseMessage = completion.choices[0].message;
    messages.push(responseMessage);

    // AI Reasoning Logging (Internal)
    if (responseMessage.content) {
      const thinkRegex = /\[THINK\]([\s\S]*?)\[\/THINK\]/gi;
      const thinkMatch = responseMessage.content.match(thinkRegex);
      
      if (thinkMatch) {
         const reasoningLog = thinkMatch[0].replace(/\[\/?THINK\]/gi, '').trim();
         console.log(`\n==========================================`);
         console.log(`🧠 AI REASONING (Loop ${toolLoops}):`);
         console.log(`${reasoningLog}`);
         console.log(`==========================================\n`);
         
         // Strip [THINK] blocks before storing in message history
         responseMessage.content = responseMessage.content.replace(thinkRegex, '').trim();
      } else {
         console.log(`\n⚠️ [WARNING] AI did not use [THINK] tags. RAW OUTPUT:`);
         console.log(`"${responseMessage.content}"\n`);
      }
      
      // Fallback: If [THINK] tag exists but was never closed, strip it and everything after it
      if (responseMessage.content.match(/\[THINK\]/i)) {
         responseMessage.content = responseMessage.content.split(/\[THINK\]/i)[0].trim();
      }
    }

    if (!responseMessage.tool_calls || responseMessage.tool_calls.length === 0) {
      finalResponse = (responseMessage.content || '').trim();
      break;
    }

    toolLoops++;

    for (const toolCall of responseMessage.tool_calls) {
      if (toolCall.type !== 'function') continue;
      
      const toolName = toolCall.function.name as AgentToolName;
      const fnArgs = JSON.parse(toolCall.function.arguments);
      
      console.log(`🤖 Tool Call: ${toolName}`, fnArgs);

      try {
        const { result, sideEffects } = await executeTool(toolName, fnArgs, {
          workspaceId: input.workspaceId,
          fbPageId: Number(input.fbPageId),
          conversationId: input.conversationId,
          conversationContext: input.context,
          settings: input.settings,
          customerPsid: input.customerPsid,
        });

        toolsCalledLog.push(`${toolName}(${JSON.stringify(fnArgs)})`);

        if (toolName === 'flag_for_review') {
          flaggedForManual = true;
          flagReason = fnArgs.reason || 'Manual Flag';
          
          // CAPTURE SYSTEM AUTO-RESPONSE: If the tool provides a message, 
          // use it and STOP the agent from generating its own text.
          if ((result as any).autoResponse) {
            finalResponse = (result as any).autoResponse;
            toolLoops = MAX_TOOL_LOOPS; // Force exit from loop
          }
        }

        if (sideEffects?.updatedContext) {
          Object.assign(input.context, sideEffects.updatedContext);
        }

        if ((sideEffects as any)?.shouldFlag) {
          shouldFlag = true;
          flaggedForManual = true;
          flagReason = (sideEffects as any).flagReason || 'Triggered by side effect';
        }

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      } catch (error: any) {
        console.error(`❌ Tool execution failed: ${toolName}`, error);
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify({ success: false, error: "Internal tool error." }),
        });
      }
    }
  }

  return {
    response: finalResponse,
    shouldFlag: shouldFlag || flaggedForManual,
    flagReason: flagReason || undefined,
    toolsCalled: toolsCalledLog,
    toolCallsMade: toolLoops,
  };
}

// ============================================
// SYSTEM PROMPT BUILDER
// ============================================

function generateSystemPrompt(
  input: AgentInput, 
  catalogSummary: { categories: string[], flavors: string[] }
): string {
  const { settings, context, memorySummary, currentTime, lastOrderDate } = input;
  const categoryBlocks = getCategoryPromptBlocks(settings.businessCategory || 'general');
  
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
- Current Time: ${now.toLocaleString('en-US', { timeStyle: 'short' })}
- Last Order Placed: ${lastOrderDate ? new Date(lastOrderDate).toLocaleString('en-US', { dateStyle: 'medium' }) : 'No previous orders found'}

[AVAILABLE CATALOG SUMMARY]
- Available Categories: ${catalogSummary.categories.length > 0 ? catalogSummary.categories.join(', ') : 'No categories defined'}
- Available Flavors: ${catalogSummary.flavors.length > 0 ? catalogSummary.flavors.join(', ') : 'No flavors defined'}
- RULE: When suggesting categories or flavors, you MUST ONLY mention the items listed above.
`.trim();

  // --- CORE CONSTRAINTS (HIGHEST PRIORITY) ---
  const coreConstraints = `
${timeContext}

[CORE CONSTRAINTS - READ FIRST]
1. **LOGICAL INTEGRITY (PAYMENT)**: 
   - If 'Cash on Delivery' is enabled in settings, you MUST confirm to the customer that we take it. 
   - If a policy says "No upfront/advance money needed," you MUST NEVER say "payment is required at the time of ordering."
   - Linguistically: "আমরা cash on delivery নেই" means "We TAKE cash on delivery". Treat it as a 'YES'.
2. **SILENCE PROTOCOL (REDUCE NOISE)**: 
   - If the customer sends a passive message (e.g., "Okay", "Thanks", "👍"), you MUST return an EMPTY RESPONSE (blank text).
   - EXCEPTION: If you just asked a question, process their answer normally.
3. **HISTORY AWARENESS**: Scan the entire conversation history. If a fact was provided previously, DO NOT ask for it again.
4. **THINKING PROTOCOL & CHECKLIST**: 
   - Before answering any "Yes" to a request, you MUST perform:
     - **STEP 1 — CATEGORY IDENTIFICATION**: Identify if the user is asking about Food/Cakes, Retail, or General Info.
     - **STEP 2 — CONSTRAINT CHECK (MANDATORY)**: Before saying "Yes" to any delivery or product request, you MUST check:
       1. **Closing Hours**: Is the requested time after the closing time in \`[BUSINESS CONTEXT]\` (e.g., 10 PM)?
       2. **Notice Period**: Does the product need advanced notice (e.g., 48h for Gluten-free, 3 days for Theme Cakes)?
       3. **Availability Rules**: Is the item/flavor restricted to a specific day?
       - If ANY check fails, you MUST say "No" and explain the specific reason. 
       - **STRICT RULE**: Do NOT let the customer "talk you into" a Yes if a rule is violated.
     - **STEP 3 — HISTORY SCOUTING**: Check if the customer already provided Phone, Address, or Flavor earlier in the chat.
     - **STEP 4 — RESPONSE DRAFTING**: Draft a response that follows the "No Numbered Lists" and "Bangla/English" rules.
5. **FORBIDDEN TERMINOLOGY**: NEVER use internal tool names like "flag_for_review", "add_to_cart", etc. Use of these words is a critical failure.
6. **NO NUMBERED LISTS**: NEVER output a numbered list (1., 2., 3., etc.).
`.trim();

  // --- BLOCK 1: IDENTITY ---
  const toneInstruction = settings.tone === 'professional'
    ? 'Maintain a polished, professional tone.'
    : settings.tone === 'casual'
    ? 'Keep it very casual and friendly, like texting a friend.'
    : 'Be warm and friendly but not over the top.';
  const bengaliRatio = settings.bengaliPercent || 70;

  const block1Identity = `
[BLOCK 1 - IDENTITY: HUMAN SALES REPRESENTATIVE]
- You are representing: ${settings.businessName || 'the store'}.
- Your role: Human Sales Representative.
- STRICT RULE: NEVER admit you are an AI, bot, virtual assistant, or automated system. 
- If asked "Are you a bot?", reply naturally as a human (e.g., "জি না Sir, আমি এখান থেকেই বলছি 😊").
- Never say "I am an AI assistant for ${settings.businessName}". 
- Instead, say "I work at ${settings.businessName}" or simply introduce yourself as Meem if that is your persona.

${categoryBlocks.identity}

Tone: ${toneInstruction}
Language Ratio: ${bengaliRatio}% Bengali/Banglish, rest English.`.trim();

  // --- BUSINESS CONTEXT ---
  const businessContextBlock = settings.businessContext?.trim()
    ? `\n[BUSINESS CONTEXT - GROUND TRUTH]\n${settings.businessContext}`
    : '';
  
  console.log(`🤖 [PROMPT_DEBUG] Business Context Length: ${settings.businessContext?.length || 0}`);
  if (settings.businessContext) {
    console.log(`🤖 [PROMPT_DEBUG] Business Context Preview: ${settings.businessContext.substring(0, 50)}...`);
  }

  // --- DELIVERY ZONES ---
  const deliveryZones = (settings as any).deliveryZones;
  const deliveryZonesBlock = Array.isArray(deliveryZones) && deliveryZones.length > 0
    ? `\n[DELIVERY ZONES]\nAvailable delivery zones:\n${deliveryZones.map((z: any) => `- ${z.label}: ৳${z.amount}`).join('\n')}`
    : '';

  // --- BLOCK 2: THINKING PROTOCOL ---
  const block2Thinking = `
[BLOCK 2 - THINKING PROTOCOL]
Before EVERY response, you MUST perform this internal cognitive process inside [THINK]...[/THINK] tags. 
CRITICAL: If you fail to wrap your thoughts in [THINK] tags, the system will crash.
1. **INTENT ANALYSIS**: What is the customer specifically asking for or trying to do? (e.g., requesting a specific delivery time, asking about a location, ordering a specific flavor).
2. **CONTEXT RETRIEVAL**: Carefully scan the \`[BUSINESS CONTEXT]\` and \`[BUSINESS POLICIES]\` for ANY rules that apply to this specific intent.
3. **CONSTRAINT EVALUATION**:
   - Compare the customer's request against the retrieved rules.
   - **TIME LOGIC (CRITICAL)**: If a rule is an "Ordering Deadline" (e.g., "Orders after 8 PM"), you MUST compare that deadline to the CURRENT TIME in \`[TIME CONTEXT]\`. If the current time is BEFORE the deadline, that rule DOES NOT APPLY and cannot be used as an excuse.
   - Does the request violate ANY rule? (e.g., delivery time is past closing, insufficient notice given, location not served).
   - *If a rule is violated, you MUST politely refuse the request ("No") and explain the exact reason based on the context. NEVER let the customer "argue" you into breaking a rule.*
4. **HISTORY SCOUTING**: Scan the entire history. What do we ALREADY know? (Phone, Address, Flavor, etc.)
5. **MISSING INFO**: What do we still need to collect to complete the order?
6. **DECISION**: What is the most natural next step toward the goal?
   - *STRICT RULE*: Do not ask for info already provided in the history.
`.trim();

  // --- BLOCK 3: ABSOLUTE RULES ---
  const block3Rules = `${categoryBlocks.rules}\n\n${categoryBlocks.stateMachine || ''}`.trim();

  // --- BLOCK 4: TOOL USAGE GUIDE ---
  const block4Tools = `
[BLOCK 4 - TOOL USAGE GUIDE]
- update_customer_info Failure: Ask the customer for correct information. Do NOT flag.
- Tool Failure Rule: Call flag_for_review.
- sendCard Rule: DEFAULT TO FALSE. ONLY set true for first-time discovery.
- UNIVERSAL DISCOVERY PROTOCOL: 
  - When searching/showing products, you MUST only show them visually via tool results.
  - The system automatically handles the professional instruction template for you.
  - You are STRICTLY FORBIDDEN from manually listing product names, prices, or numbers in your text message.
`.trim();

  // --- BLOCK 5: ORDER FLOW ---
  const block5OrderFlow = `
[BLOCK 5 - ORDER FLOW]
${buildOrderCollectionInstruction(settings)}
`.trim();

  // --- BLOCK 6: STATIC SETTINGS ---
  const enabledPaymentMethods = [];
  if (settings.paymentMethods?.bkash?.enabled) enabledPaymentMethods.push('bKash');
  if (settings.paymentMethods?.nagad?.enabled) enabledPaymentMethods.push('Nagad');
  if (settings.paymentMethods?.cod?.enabled) enabledPaymentMethods.push('Cash on Delivery');
  
  let block6Settings = `
[BLOCK 6 - STATIC SETTINGS]
Available Payment Methods: ${enabledPaymentMethods.join(', ') || 'Not configured'}
Delivery Time: ${settings.deliveryTime || '3-5 days'}

[BUSINESS POLICIES]
- Delivery Charges: Inside Dhaka: ৳${settings.deliveryCharges?.insideDhaka || 60}, Outside Dhaka: ৳${settings.deliveryCharges?.outsideDhaka || 120}
- Delivery Info: ${settings.fastLaneMessages?.deliveryInfo || 'Standard delivery fees apply.'}
- Return Policy: ${settings.returnPolicy || settings.fastLaneMessages?.returnPolicy || 'Items can be returned if damaged.'}
- Payment Instructions: ${settings.paymentMessage || settings.fastLaneMessages?.paymentInfo || 'We accept bKash and Nagad.'}`;

  // --- CUSTOM FAQs ---
  const faqs = settings.customFaqs;
  const faqsBlock = Array.isArray(faqs) && faqs.length > 0
    ? `\n[CUSTOM FAQs - FREQUENTLY ASKED QUESTIONS]\n${faqs.map((f: any) => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n')}`
    : '';

  // --- CONVERSATION EXAMPLES (Few-Shot Learning) ---
  const examples = settings.conversationExamples;
  const examplesBlock = Array.isArray(examples) && examples.length > 0
    ? `\n[CONVERSATION EXAMPLES - FOLLOW THIS STYLE]\n${examples.map((ex: any) => `Scenario: ${ex.scenario || 'General'}\nCustomer: ${ex.customer}\nAgent Response: ${ex.agent}`).join('\n\n')}`
    : '';

  // --- BLOCK 7: DYNAMIC STATE ---
  const cartDesc = buildCartDescription(context);
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

  // --- BLOCK 8: INFORMATION RETRIEVAL RULES ---
  const block8InfoRetrieval = `
[BLOCK 8 - INFORMATION RETRIEVAL RULES]
- **SUPREME GROUND TRUTH**: The [BUSINESS CONTEXT] contains SPECIFIC EXCEPTIONS and CUSTOM RULES. 
- **PRIORITY RULE**: If a rule in [BUSINESS CONTEXT] contradicts a general setting (e.g., Delivery Time or Payment), you MUST follow the [BUSINESS CONTEXT] rule.
- **FLAVOR RULES**: If a specific flavor rule exists in [BUSINESS CONTEXT] (e.g., Gluten-Free), you are allowed to discuss it even if it is not in the standard catalog.
- **PAYMENT POLICY**:
  - If "Cash on Delivery" is listed in [BLOCK 6] -> Available Payment Methods, it IS available. 
  - If the customer asks "Do you take COD?", and it's enabled in Block 6, your answer is always "YES". 
  - Ignore any text in "Payment Instructions" that contradicts the "Available Payment Methods" list.
- **DELIVERY QUESTIONS**: Use info from [BUSINESS POLICIES] -> Delivery Info, [BLOCK 6] -> Delivery Time, and check for exceptions in [BUSINESS CONTEXT].
- **PAYMENT QUESTIONS**: Use info from [BUSINESS POLICIES] -> Payment Instructions, [BLOCK 6] -> Available Payment Methods, and check for exceptions in [BUSINESS CONTEXT].
`.trim();

  const sections = [
    businessContextBlock, // Priority 1: Specific Exceptions & Ground Truth
    coreConstraints,      // Priority 2: Universal Logic
    deliveryZonesBlock,   // Priority 3: Delivery Fees
    block1Identity,       // Priority 4: Persona
    block2Thinking,
    block3Rules,
    block4Tools,
    block5OrderFlow,
    block6Settings,
    faqsBlock,
    examplesBlock,
    block8InfoRetrieval,
    block7Dynamic
  ];

  return sections.filter(Boolean).join('\n\n─────────────────────────────────\n\n');
}

// ============================================
// HELPERS
// ============================================

function buildCartDescription(context: ConversationContext): string {
  if (!context.cart || context.cart.length === 0) return 'EMPTY';
  return context.cart.map(item => `- ${item.quantity}x ${item.productName} (৳${item.productPrice})`).join('\n');
}
