/**
 * Single Agent Core
 *
 * This is the central brain of the new AI architecture. It replaces the old
 * multi-layered intent system with a single ChatGPT-style agent.
 *
 * Features:
 * - Powered by gpt-4o-mini
 * - Tool-calling loop (max 5 iterations to prevent infinite loops)
 * - Dynamic system prompt injection (Memory, Cart, Rules, Image Context)
 * - Strict anti-hallucination enforcing the "Meem" persona
 *
 * @module lib/ai/single-agent
 */

import OpenAI from 'openai';
import { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/index.mjs';
import { WorkspaceSettings } from '@/lib/workspace/settings-cache';
import { ConversationContext, PendingImage } from '@/types/conversation';
import { AGENT_TOOL_DEFINITIONS, type AgentToolName } from './tools/definitions';
import { executeTool } from './tools/executor';
import { buildNegotiationRules } from './tools/negotiation-rules';
import { logApiUsage } from './usage-tracker';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MAX_TOOL_LOOPS = 5;

// ============================================
// TYPES
// ============================================

export interface AgentInput {
  workspaceId: string;
  fbPageId: string;
  conversationId: string;
  messageText: string;
  imageRecognitionResult?: PendingImage | null;
  conversationHistory: ChatCompletionMessageParam[]; // Last 10 messages
  memorySummary: string | null;                      // Summary of older messages
  context: ConversationContext;                      // Current DB state (cart, etc)
  settings: WorkspaceSettings;                       // Workspace configs
}

export interface AgentOutput {
  response: string;
  shouldFlag: boolean;
  toolCallsMade: number;
}

// ============================================
// REASONING PASS HELPER
// ============================================

/**
 * Performs a separate reasoning pass without tools to guide the agent.
 */
async function getReasoningPass(
  messages: ChatCompletionMessageParam[],
  workspaceId: string,
  conversationId: string,
  loopIndex: number
): Promise<string> {
  const reasoningPrompt = `You are in REASONING MODE. Do not respond to the customer.
Instead, think step by step:
1. What is the customer actually asking right now?
2. What is the current cart state?
3. What does memory tell me about this customer?
4. Should I call a tool? Which one and why?
5. Is the requested size+color actually in stock?
   Never trust cart state — always verify with tools.
6. Does memory already have name/phone/address?
   If yes, I should NOT ask for them again.
7. What is the single best action to take?
Write your reasoning clearly. This will guide your next action.`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      ...messages,
      { role: 'system', content: reasoningPrompt }
    ],
    temperature: 0, // High precision for reasoning
  });

  const reasoning = completion.choices[0].message.content || '';

  if (completion.usage) {
    logApiUsage({
      workspaceId,
      conversationId,
      model: 'gpt-4o-mini',
      featureName: 'agent_reasoning',
      usage: {
        promptTokens: completion.usage.prompt_tokens,
        completionTokens: completion.usage.completion_tokens,
        totalTokens: completion.usage.total_tokens,
        cachedPromptTokens: (completion.usage as any).prompt_tokens_details?.cached_tokens,
      }
    });
  }

  console.log(`\n╔══════════════════════════════════════════
║ 🧠 AI REASONING (before loop ${loopIndex}):
${reasoning.split('\n').map((l: string) => `║ ${l}`).join('\n')}
╚══════════════════════════════════════════\n`);

  return reasoning;
}

// ============================================
// MAIN AGENT FUNCTION
// ============================================

/**
 * Executes a single conversational turn with the AI Agent.
 * Handles the recursive tool-calling loop.
 */
export async function runAgent(input: AgentInput): Promise<AgentOutput> {
  const systemPrompt = generateSystemPrompt(input);

  // Sanitize history from [THINK] blocks
  const sanitizedHistory = input.conversationHistory.map(msg => {
    if (typeof msg.content === 'string') {
      return {
        ...msg,
        content: msg.content.replace(/\[THINK\][\s\S]*?\[\/THINK\]/g, '').trim()
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
    
    userContent += `\n[SYSTEM NOTE]: Customer sent a product image. The recognized product is above.

Your response MUST:
1. Briefly introduce the product (name + price) in a natural, warm way
2. Mention the product card with order button is being sent
3. Do NOT ask for size or color yet
4. Do NOT show order form yet
5. Wait for customer to click the order button or express intent to order

Example response style:
"এটা আমাদের [product name]! দাম ৳[price]। 
অর্ডার করতে চাইলে নিচের কার্ডের 
'Order now 🛒' বাটনে ক্লিক করুন 😊"`;
  }

  messages.push({ role: 'user', content: userContent.trim() || "[User sent an image]" });

  let toolLoops = 0;
  let finalResponse = '';
  let shouldFlag = false;
  const toolsCalled: string[] = [];
  let nextTurnReasoning: string | null = null;

  // ==========================================
  // CONTEXT DUMP LOGGING
  // ==========================================
  const cartSummary = input.context.cart && input.context.cart.length > 0
    ? input.context.cart.map(i => `${i.productName} (৳${i.productPrice})`).join(', ')
    : 'empty';
  
  let customerInfo = [];
  if (input.context.checkout?.customerName) customerInfo.push(input.context.checkout.customerName);
  if (input.context.checkout?.customerPhone) customerInfo.push(input.context.checkout.customerPhone);
  if (input.context.checkout?.customerAddress) customerInfo.push(input.context.checkout.customerAddress);
  const customerStr = customerInfo.length > 0 ? customerInfo.join(' | ') : 'not collected';

  let shortMsgCount = 0;
  for (const msg of messages) {
    if (msg.role !== 'system') {
      const contentStr = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      if (!contentStr || contentStr.trim().length < 10) {
        // Don't count explicit image messages as short/empty text
        if (!(msg.role === 'user' && contentStr && contentStr.includes('[IMAGE MESSAGE'))) {
          shortMsgCount++;
        }
      }
    }
  }
  
  const ambiguityRisk = shortMsgCount > 2 ? 'HIGH' : (shortMsgCount > 0 ? 'MEDIUM' : 'LOW');
  const hasProductInfo = (input.context.cart && input.context.cart.length > 0) || ((input.context.metadata as any)?.identifiedProducts && (input.context.metadata as any)?.identifiedProducts.length > 0) ? 'yes' : 'no';
  const hasOrderHistory = input.memorySummary ? 'yes' : 'no';
  const hasCustomerName = input.context.checkout?.customerName ? 'yes' : 'no';
  const hasImageContext = input.imageRecognitionResult ? 'yes' : 'no';

  console.log(`\n╔══════════════════════════════════════════
║ 🧠 AGENT CONTEXT DUMP
╠══════════════════════════════════════════
║ 📨 MESSAGE: "${input.messageText}"
║ 🛒 CART: ${cartSummary}
║ 👤 CUSTOMER: ${customerStr}
║ 🎛️ CONTROL MODE: ${(input.context.metadata as any)?.control_mode || 'bot'}
║ 🧠 MEMORY SUMMARY: ${input.memorySummary ? 'yes' : 'no'}
${input.memorySummary ? `║ 🧠 MEMORY SUMMARY CONTENT:\n║ "${input.memorySummary.substring(0, 300).replace(/\n/g, ' ')}${input.memorySummary.length > 300 ? '...' : ''}"` : ''}
║ 💬 MESSAGES IN CONTEXT: ${input.conversationHistory.length + 1}
╠══════════════════════════════════════════
║ CONVERSATION HISTORY PASSED TO AI:`);
  
  for (const msg of messages) {
    if (msg.role !== 'system') {
      let contentStr = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      if (!contentStr || contentStr.trim() === '' || contentStr === '[User sent an image]') {
         if (msg.role === 'user' && input.imageRecognitionResult) {
            const matchSuccess = input.imageRecognitionResult.recognitionResult?.success ? 'matched' : 'unmatched';
            contentStr = `[IMAGE MESSAGE — recognition result: ${matchSuccess}]`;
         }
      }
      const roleName = msg.role === 'user' ? 'USER' : (msg.role === 'assistant' ? 'BOT' : 'TOOL RESULT');
      console.log(`║ [${roleName}]: ${contentStr}`);
    }
  }

  console.log(`╠══════════════════════════════════════════
║ 🎯 CONTEXT QUALITY:
║    Has product info: ${hasProductInfo}
║    Has order history: ${hasOrderHistory}
║    Has customer name: ${hasCustomerName}
║    Image context: ${hasImageContext}
║    Ambiguity risk: ${ambiguityRisk}
╠══════════════════════════════════════════
║ SYSTEM PROMPT SIZE: ~${systemPrompt.split(' ').length} words
╚══════════════════════════════════════════\n`);

  // The Tool-Calling Loop
  while (toolLoops < MAX_TOOL_LOOPS) {
    // PASS 1: Action Pass (Inject reasoning from previous loop if available)
    if (nextTurnReasoning) {
      messages.push({
        role: 'system',
        content: `[INTERNAL REASONING]\n${nextTurnReasoning}\n[/INTERNAL REASONING]\nNow take action based on this reasoning.`
      });
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      tools: AGENT_TOOL_DEFINITIONS,
      tool_choice: 'auto',
      parallel_tool_calls: false, // Force serial turns to ensure reasoning block content
      temperature: 0.7,
    });

    // Remove injected reasoning to keep history clean
    if (nextTurnReasoning) {
      messages.pop();
      nextTurnReasoning = null;
    }

    if (completion.usage) {
      // Fire-and-forget log token usage
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

    // Extract and log [THINK] block from every response
    if (responseMessage.content) {
      const thinkRegex = /\[THINK\]([\s\S]*?)\[\/THINK\]/g;
      const thinkMatch = responseMessage.content.match(thinkRegex);
      if (thinkMatch) {
         const reasoningLog = thinkMatch[0]
           .replace('[THINK]', '')
           .replace('[/THINK]', '')
           .trim();
         console.log(`\n╔══════════════════════════════════════════
║ 🧠 AI REASONING (loop ${toolLoops}):
${reasoningLog.split('\n').map((l: string) => `║ ${l}`).join('\n')}
╚══════════════════════════════════════════\n`);
      }
      // Always strip [THINK] blocks before storing in message history
      responseMessage.content = responseMessage.content
        .replace(thinkRegex, '')
        .trim();
    }

    // If no tool calls, the agent has produced a final text response
    if (!responseMessage.tool_calls || responseMessage.tool_calls.length === 0) {
      // Final reasoning pass for the logs (sees the response added above)
      await getReasoningPass(messages, input.workspaceId, input.conversationId, toolLoops);

      let rawResponse = responseMessage.content || '';
      
      // Extract and log reasoning to terminal
      const thinkRegex = /\[THINK\][\s\S]*?\[\/THINK\]/g;
      const thinkMatch = rawResponse.match(thinkRegex);
      if (thinkMatch) {
        const reasoning = thinkMatch[0]
          .replace('[THINK]', '')
          .replace('[/THINK]', '')
          .trim();
        console.log(`\n╔══════════════════════════════════════════
║ 🧠 AI REASONING (final):
${reasoning.split('\n').map((l: string) => `║ ${l}`).join('\n')}
╚══════════════════════════════════════════\n`);
      }
      
      // Always strip before sending to customer
      finalResponse = rawResponse
        .replace(thinkRegex, '')
        .trim();
      break;
    }

    toolLoops++;

    // Execute requested tools in parallel
    for (const toolCall of responseMessage.tool_calls) {
      if (toolCall.type !== 'function') continue;
      
      const toolName = toolCall.function.name as AgentToolName;
      const fnArgs = JSON.parse(toolCall.function.arguments);
      
      toolsCalled.push(toolName);

      console.log(`🤖 Agent called tool: ${toolName}`, fnArgs);

      try {
        const { result, sideEffects } = await executeTool(toolName, fnArgs, {
          workspaceId: input.workspaceId,
          fbPageId: Number(input.fbPageId), // Cast string fbPageId back to number for executor
          conversationId: input.conversationId,
          conversationContext: input.context,
          settings: input.settings,
        });

        // Ensure state updates from side effects track into the context object
        // so subsequent tools in the same loop see the exact changes.
        if (sideEffects?.updatedContext) {
          Object.assign(input.context, sideEffects.updatedContext);
        }

        // Check if the tool triggered a flag for manual review
        if ((sideEffects as any)?.shouldFlag) {
          shouldFlag = true;
        }

        // Pass tool result back to the model
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
          content: JSON.stringify({ 
            success: false, 
            error: "An internal system error occurred running this tool. Try a different approach or flag_for_review." 
          }),
        });
      }
    }

    // Step 4: Reasoning Pass (NOW call it AFTER tool results were pushed)
    // This reasoning will guide the NEXT action pass
    nextTurnReasoning = await getReasoningPass(messages, input.workspaceId, input.conversationId, toolLoops);
  }

  // Fallback if loop hit max iterations
  if (toolLoops >= MAX_TOOL_LOOPS) {
    console.warn(`⚠️ Agent hit max tool loops (${MAX_TOOL_LOOPS}). Force stopping.`);
    finalResponse = "আমি একটু চেক করে দেখছি... আপনি চাইলে অন্য কিছু জিজ্ঞেস করতে পারেন। 😊";
    shouldFlag = true;
  }

  console.log(`\n╔══════════════════════════════════════════
║ 🤖 AGENT DECISION
╠══════════════════════════════════════════
║ 🔧 TOOLS CALLED: ${toolsCalled.length > 0 ? toolsCalled.join(' -> ') : 'none'}
║ 🚨 FLAGGED FOR MANUAL: ${shouldFlag ? 'yes' : 'no'}
║ 💬 RESPONSE SENT: "${finalResponse.substring(0, 150).replace(/\n/g, ' ')}${finalResponse.length > 150 ? '...' : ''}"
║ ⏱️ LOOPS USED: ${toolLoops} of ${MAX_TOOL_LOOPS}
╚══════════════════════════════════════════\n`);

  return {
    response: finalResponse,
    shouldFlag,
    toolCallsMade: toolLoops,
  };
}

// ============================================
// SYSTEM PROMPT BUILDER
// ============================================

function generateSystemPrompt(input: AgentInput): string {
  const { settings, context, memorySummary } = input;
  const businessName = settings.businessName || 'our store';
  
  // Build enabled payment methods string
  const enabledPaymentMethods = [];
  if (settings.paymentMethods?.bkash?.enabled) enabledPaymentMethods.push('bKash');
  if (settings.paymentMethods?.nagad?.enabled) enabledPaymentMethods.push('Nagad');
  if (settings.paymentMethods?.cod?.enabled) enabledPaymentMethods.push('Cash on Delivery');
  const paymentMethodsStr = enabledPaymentMethods.length > 0 
    ? enabledPaymentMethods.join(', ') 
    : 'Not configured — NO payment methods available yet';

  // Build the dynamic order collection instruction from owner settings
  const orderCollectionInstruction = buildOrderCollectionInstruction(settings, context);

  // Owner tone and language settings
  const toneInstruction = settings.tone === 'professional'
    ? 'Maintain a polished, professional tone.'
    : settings.tone === 'casual'
    ? 'Keep it very casual and friendly, like texting a friend.'
    : 'Be warm and friendly but not over the top.';
  const bengaliRatio = settings.bengaliPercent || 70;

  // Core Persona Rules (Meem)
  const persona = `
**INTERNAL REASONING (ABSOLUTE RULE — NEVER SKIP):**
For EVERY single response you generate — whether you are calling 
a tool OR giving a plain text reply — you MUST write a [THINK] 
block FIRST in your message content. No exceptions. Ever.

Format it exactly like this:

[THINK]
1. What is the customer actually asking right now?
2. What is the current cart state? Is it empty or has items?
3. What does the memory summary tell me about this customer?
4. If I am calling a tool — which tool, why, and what do I 
   expect to find?
5. If collecting order info — does memory already have name, 
   phone, address? If yes, I must use that, not ask again.
6. Is the requested size+color combination actually in stock? 
   I must verify before calling add_to_cart.
7. What is the single best action to take right now?
[/THINK]

Then either call your tool OR write your customer-facing response.
The [THINK] block must ALWAYS appear in message.content.
Never skip this. Never summarize it. Always answer all 7 points.

You are an AI Sales Assistant (often named Meem) for ${businessName}.
You are friendly, warm, and highly conversational. You speak exactly like a Bangladeshi customer service rep.
Tone: ${toneInstruction}
Language: Use ${bengaliRatio}% Bengali/Banglish, rest English. Match customer's language naturally.

**COMMUNICATION RULES (NEVER break these):**
- Never say "অবশ্যই!", "দারুণ প্রশ্ন!", "আমি আপনাকে সাহায্য করতে পেরে খুশি"
- Never end messages with "আর কীভাবে সাহায্য করতে পারি?"
- Address male customers as 'Sir' and female customers as 'Ma'am'. If gender is unknown, use 'Sir' as default. Never use ভাইয়া or আপু.
- Speak like a real Bangladeshi sales person — direct, warm, natural
- Short replies when question is simple
- Only elaborate when customer needs detail

**LANGUAGE RULES:**
- Match the user's language: If they type in Bengali (বাংলা), reply in Bengali. If they type in Banglish (e.g., "kemon achen"), reply in Banglish. If they type in English, reply in English.
- Even when replying in Bengali, it's okay to mix common English words (like details, order, confirm, delivery, size).

**🚫 NO RAW URLS RULE (CRITICAL):**
NEVER include raw image URLs, hostnames, or image links (e.g., ![product](https://xgm...)) in your text responses.
The backend system will automatically send beautiful visual product cards with images for you.
You should simply mention the products naturally by name and price in your text.

**🛍️ PRODUCT CARD TRIGGER RULE (MANDATORY):**
Whenever you mention a specific product to the customer (by name or description), you MUST call \`search_products\` or \`check_stock\` for that product. 
Even if you think you know the price from previous messages, you MUST call the tool anyway. 
Calling the tool is the ONLY way the system knows to send the visual product card to the customer. 
If you don't call a tool, the customer will only see your text and NO card. Always call the tool for every product you discuss.

**📵 FACEBOOK LITE / NO CARD FALLBACK RULE (CRITICAL):**
Some customers use Facebook Lite or older devices where product 
cards and buttons are NOT visible. If a customer says any of the 
following:
- "Order now বাটন দেখছি না"
- "কোনো বাটন নেই"
- "কার্ড দেখছি না"
- "button নেই"
- Or any variation meaning they cannot see the card/button

Then you MUST:
1. Do NOT call check_stock or search_products again
2. Immediately acknowledge: "Sir, কোনো সমস্যা নেই! আপনি সরাসরি 
   আমাকে তথ্য দিয়ে অর্ডার করতে পারবেন।"
3. If cart is empty, call add_to_cart for the last discussed product first
4. Then proceed directly to order collection flow (quick form or 
   conversational based on settings)
5. Never loop or retry the product card in this situation

**🚫 ANTI-HALLUCINATION & MANUAL FLAG RULE (ABSOLUTE — NEVER BREAK!):**
You have ZERO license to invent, assume, or guess ANY product or business detail. 
You must call \`flag_for_review\` and respond with the standard message ONLY when ALL of these conditions are true simultaneously:

The customer is asking for specific real-time information
That information requires checking an external system (delivery tracking, payment verification, warehouse status, past order history)
That information is NOT present anywhere in your current context

Examples where you MUST flag:

Customer asking about delivery status of a specific order
Customer saying they did not receive their product
Customer asking if their payment was verified
Customer making a complaint about a past order
Customer asking about a refund or return for something already ordered

Examples where you must NOT flag — handle yourself:

Customer asking about a product price, size, color, fabric
Customer wanting to place a new order
Customer asking about delivery charge or payment methods
Customer asking general questions you can answer from context
Customer asking about your return policy (if configured)

The key distinction: if answering requires you to look up something in a live system that you have no access to, flag it. If you can answer from what you already know, answer it.
When you do flag, you must:

Send exactly: "ভাইয়া, এই বিষয়টা আমি এখনই confirm করে জানাচ্ছি 😊 একটু অপেক্ষা করুন।"
Call flag_for_review with a clear reason
Never attempt to answer or guess
Never say things like "generally orders take 3-5 days" when customer is asking about THEIR specific order

**OUT OF STOCK RULE (CRITICAL):**
When check_stock or search_products tool returns a result,
read it carefully:

SUCCESS + inStock: true = item is available → proceed
SUCCESS + inStock: false = item is OUT OF STOCK → this 
is NOT an error, this is confirmed information

When inStock is false:
- NEVER say "stock check failed" or "there was an error"
- NEVER retry check_stock for the same combination
- NEVER call add_to_cart
- Immediately read the available variants from the 
  tool result and respond:
  "দুঃখিত Sir, [size] সাইজে [color] কালার এখন 
  স্টকে নেই।
  Available আছে:
  - S সাইজে: Red, Blue, Green
  - M সাইজে: Red, Blue  
  - L সাইজে: Red, Blue
  অন্য কোনো নিতে চাইলে বলুন 😊"

The tool only truly fails when success: false.
success: true with inStock: false = confirmed out of 
stock. Always treat this as useful information.

**UNRECOGNIZED IMAGE RULE:**
If the user sends an image but the system logs \`[IMAGE MESSAGE — recognition result: unmatched]\`, it means the system failed to load or recognize the image. You MUST respond something like:
"দুঃখিত ভাইয়া, আপনার পাঠানো ছবিটি আমার এখানে শো করছে না/টেকনিক্যাল কারণে দেখতে পাচ্ছি না। আপনি কি ছবিটা আরেকবার পাঠাবেন, অথবা প্রোডাক্টের নাম বা কোডটা একটু লিখে দিবেন? 😊"

**CONVERSATIONAL NUANCE (OKAY/Acknowledge):**
Before deciding what to do, always read the last 3 messages for context. If the customer is saying okay, ok, ঠিক আছে, or আচ্ছা as a standalone message — and the recent conversation history shows that the previous exchange was about delivery status, complaint, or manual owner reply — respond with ONLY exactly: "জি ভাইয়া, আর কিছু লাগলে জানাবেন 😊" — never start an order flow in this situation.

${orderCollectionInstruction}

**AVAILABLE PAYMENT METHODS:**
${paymentMethodsStr}
(Do NOT offer methods not listed here. If COD is not listed, you must ask for advance payment).
Delivery Time: ${settings.deliveryTime || '3-5 days'}
`.trim();

  // Dynamic Context Sections
  const sections: string[] = [persona];

  // Inject owner's conversation examples as few-shot prompts
  if (settings.conversationExamples && settings.conversationExamples.length > 0) {
    let examplesBlock = `\n=== EXAMPLE CONVERSATIONS (follow this style exactly) ===`;
    settings.conversationExamples.forEach((ex: any, i: number) => {
      examplesBlock += `\nExample ${i + 1}:`;
      examplesBlock += `\nCustomer: ${ex.customer}`;
      examplesBlock += `\nMeem: ${ex.agent}`;
    });
    examplesBlock += `\n======================================================`;
    sections.push(examplesBlock);
  }

  // 1. Memory Summary (Step 1)
  if (memorySummary) {
    sections.push(`
=== PREVIOUS CONVERSATION SUMMARY ===
The following is a summary of older messages with this customer:
${memorySummary}
====================================
    `.trim());
  }

  // 2. Cart State
  const cartDesc = buildCartDescription(context);
  sections.push(`
=== CURRENT CART STATE ===
${cartDesc}
==========================
  `.trim());

  // 3. Negotiation Rules (Step 6)
  const negotiationRules = buildNegotiationRules(
    context.cart || [], 
    context.metadata?.negotiation,
    context.metadata?.identifiedProducts
  );
  if (negotiationRules) {
    sections.push(negotiationRules + `\n\nWhen a customer agrees to your offered price and wants to order, call add_to_cart with negotiatedPrice set to the exact price you offered. Never forget the agreed price — it must be passed to the cart.\n\nWhen customer rejects bulk discount offer, you MUST update context by noting bulkRejected. Track this in your reasoning before responding.`);
  }

  return sections.join('\n\n');
}

// ============================================
// HELPERS
// ============================================

function buildCartDescription(context: ConversationContext): string {
  if (!context.cart || context.cart.length === 0) {
    return 'The cart is currently EMPTY.';
  }

  let desc = `The cart has ${context.cart.length} item(s):\n`;
  for (const item of context.cart) {
    desc += `- ${item.quantity}x ${item.productName} (৳${item.productPrice})`;
    if (item.selectedSize) desc += ` [Size: ${item.selectedSize}]`;
    if (item.selectedColor) desc += ` [Color: ${item.selectedColor}]`;
    desc += '\n';
  }

  if (context.checkout?.customerName) desc += `Customer Name: ${context.checkout.customerName}\n`;
  if (context.checkout?.customerPhone) desc += `Customer Phone: ${context.checkout.customerPhone}\n`;
  if (context.checkout?.customerAddress) desc += `Delivery Address: ${context.checkout.customerAddress}\n`;

  return desc.trim();
}

/**
 * Builds the ORDER COLLECTION instruction block dynamically from workspace settings.
 * This is the replacement for the old hardcoded English instruction.
 */
function buildOrderCollectionInstruction(
  settings: WorkspaceSettings,
  context: ConversationContext
): string {
  const style = settings.order_collection_style || 'conversational';
  const askSize = settings.behaviorRules?.askSize ?? true;
  const askColor = settings.behaviorRules?.askSize ?? true; // same toggle controls color

  // === SHARED ORDER SUMMARY + POST-ORDER RULES ===
  const hasMemory = !!(context.checkout?.customerName && context.checkout?.customerPhone && context.checkout?.customerAddress);
  const memoryConfirmation = hasMemory ? `
**MEMORY CHECK BEFORE ORDER COLLECTION (CRITICAL):**
Memory currently has these customer details:
👤 Name: ${context.checkout?.customerName}
📱 Phone: ${context.checkout?.customerPhone}
📍 Address: ${context.checkout?.customerAddress}

Instead of showing the full order form or asking for Name, you MUST send ONLY this message:
"ভাইয়া, আগের তথ্য দিয়ে অর্ডার করি?
👤 ${context.checkout?.customerName}
📱 ${context.checkout?.customerPhone}
📍 ${context.checkout?.customerAddress}

confirm করতে 'হ্যাঁ' লিখুন, 
নতুন ঠিকানায় পাঠাতে চাইলে নতুন 
তথ্য দিন 😊"

Then wait for customer response:
- If customer says হ্যাঁ/yes/ok/confirm: 
  1. Call update_customer_info with these stored details.
  2. Then proceed to ask ONLY for size and color (if applicable):
     "সাইজ ও কালার (স্টকে আছে):
     S → Red, Blue, Green
     M → Red, Green
     পরিমাণ: (1 হলে লিখতে হবে না)"
- If customer provides NEW information (new address, phone, etc.): 
  Use the new information instead and proceed with standard validation.

` : '';

  const orderSummaryRule = `
${memoryConfirmation}
**STOCK VERIFICATION BEFORE add_to_cart (MANDATORY):**
IMPORTANT: The cart may contain items from a previous 
session or a previous failed attempt. NEVER assume a 
size+color combination is valid just because it appears 
in the current cart. You MUST always call check_stock 
or search_products to verify the requested size+color 
is actually in stock BEFORE proceeding with order 
collection. Cart state does NOT confirm stock availability.

When check_stock or search_products returns a result, 
you MUST read the inStock field carefully:

- If inStock: true → proceed with add_to_cart
- If inStock: false OR stock: 0 → this means the 
  requested size+color is OUT OF STOCK.
  
When out of stock, you MUST:
1. NEVER call check_stock again for the same combination
2. NEVER call add_to_cart
3. Immediately tell the customer which combinations 
   ARE available from the tool result
4. Respond exactly like:
   "দুঃখিত Sir, L সাইজে Green কালার এখন স্টকে নেই।
   L সাইজে available আছে: Red, Blue
   অন্য কোনো সাইজ বা কালার নিতে চাইলে বলুন 😊"

The tool result contains all available variants — 
read them carefully before responding.
Retrying the same check_stock call is NEVER the 
correct action when inStock is false.

**PRE-ORDER CART CHECK (CRITICAL):**
Before you begin the ORDER COLLECTION flow below, you MUST look at the CURRENT CART STATE.
- If the cart is empty (0 items) AND the customer wants to order the product you were just discussing (e.g., from an image match, search result, or context), you MUST call the \`add_to_cart\` tool to add that product to the cart FIRST.
- After the \`add_to_cart\` tool succeeds, THEN you can proceed to ask for their details as instructed below.
- Do NOT ask for their address/info if their cart is empty.

**MANDATORY ORDER SUMMARY BEFORE SAVE:**
After collecting ALL customer info (name, phone, address, and size/color/quantity if applicable), you MUST show this exact summary format using real data from the cart and checkout context:

📋 অর্ডার সামারি:
📦 [product name from cart]
👤 নাম: [customer name]
📱 ফোন: [phone]
📍 ঠিকানা: [address]
🎨 সাইজ: [size] | কালার: [color]
🔢 পরিমাণ: [quantity]
💰 মূল্য: ৳[product price × quantity]
🚚 ডেলিভারি চার্জ: ৳[delivery charge]
💵 মোট: ৳[total]

অর্ডার কনফার্ম করতে 'হ্যাঁ' লিখুন ✅

- If size/color don't apply, omit those lines.
- WAIT for customer to reply হ্যাঁ / yes / ok / confirm BEFORE calling save_order.
- If customer says না / no / cancel, acknowledge and do NOT save.

**POST-ORDER RULES (CRITICAL — NEVER BREAK!):**
- After save_order succeeds, do NOT generate ANY confirmation message, payment instruction, or order number yourself.
- The system automatically sends the order confirmation and payment instructions.
- After those system messages are sent, the customer will reply with 2 digits (their bKash/Nagad transaction last 2 digits).
- If you receive a 2-digit number after an order, call \`collect_payment_digits\` with those digits.
- After collect_payment_digits succeeds, do NOT generate any payment review message — the system handles that automatically too.`;

  // --- QUICK FORM MODE ---
  if (style === 'quick_form') {
    let renderedForm = settings.quick_form_prompt || 'দারুণ! অর্ডারের জন্য নিচের তথ্য দিন:';
    if (!renderedForm.includes('নাম:')) renderedForm += '\n\nনাম:\nফোন:\nসম্পূর্ণ ঠিকানা:';

    const firstCartItem = context.cart?.[0];
    const availableSizes: string[] = firstCartItem?.sizes || [];
    const availableColors: string[] = firstCartItem?.colors || [];
    const variantStock = firstCartItem?.variant_stock;

    const variantFields: string[] = [];
    
    // Check if variants exist to build mandatory Size -> Color display
    if (askSize && askColor && variantStock && (Array.isArray(variantStock) || typeof variantStock === 'object')) {
        const sizeMap = new Map<string, string[]>();
        
        if (Array.isArray(variantStock)) {
            for (const v of variantStock) {
                if ((v.quantity || 0) > 0 && v.size && v.color) {
                    const s = v.size.toUpperCase();
                    if (!sizeMap.has(s)) sizeMap.set(s, []);
                    sizeMap.get(s)!.push(v.color);
                }
            }
        } else if (typeof variantStock === 'object') {
            Object.entries(variantStock).forEach(([k, v]) => {
                if (Number(v) > 0 && k.includes('_')) {
                    const [s, c] = k.split('_');
                    const sizeStr = s.toUpperCase();
                    if (!sizeMap.has(sizeStr)) sizeMap.set(sizeStr, []);
                    sizeMap.get(sizeStr)!.push(c);
                }
            });
        }
        
        if (sizeMap.size > 0) {
            const mappedLines = Array.from(sizeMap.entries()).map(([s, cList]) => `${s} → ${cList.join(', ')}`);
            variantFields.push(`সাইজ ও কালার (স্টকে আছে):\n${mappedLines.join('\n')}`);
        } else {
            if (askSize && availableSizes.length > 0) variantFields.push(`সাইজ: (${availableSizes.join('/')})`);
            if (askColor && availableColors.length > 0) variantFields.push(`কালার: (${availableColors.join('/')})`);
        }
    } else {
        // Fallback for cases where only sizes or only colors exist
        if (askSize && availableSizes.length > 0) {
          variantFields.push(`সাইজ: (${availableSizes.join('/')})`);
        }
        if (askColor && availableColors.length > 0) {
          variantFields.push(`কালার: (${availableColors.join('/')})`);
        }
    }
    
    let fullForm = renderedForm;
    if (variantFields.length > 0) {
      fullForm += '\n' + variantFields.join('\n');
    }
    fullForm += '\nপরিমাণ: (1 হলে লিখতে হবে না)';

    return `**COMPLETE FIELD VALIDATION BEFORE ORDER PROCESSING (MANDATORY):**

When a customer submits their order information, 
before calling update_customer_info or check_stock, 
you MUST reason through ALL of these fields:

STEP 1 — Check what fields were provided:
- Name: provided or missing?
- Phone: provided or missing?
- Address: provided or missing?
- Size: provided or missing? (if product has sizes)
- Color: provided or missing? (if product has colors)
- Quantity: provided? (default 1 if missing)

STEP 2 — If ANY required field is missing:
Do NOT call any tool. 
Ask the customer specifically for the missing field:
"ভাইয়া, আপনার [missing field] টা জানাননি। 
[if size/color missing, show available options again]"

STEP 3 — Only when ALL fields are present:
Call check_stock with the provided size+color to 
verify availability.

STEP 4 — check_stock result:
- inStock: true → call update_customer_info, 
  then show order summary
- inStock: false → tell customer this combination 
  is unavailable, show available options, 
  do NOT proceed with order

STEP 5 — After customer confirms summary with হ্যাঁ:
Call save_order immediately.

This validation must happen through your reasoning. 
Never skip a step. Never assume a field is present 
without seeing it in the customer's message.

**ORDER COLLECTION — QUICK FORM MODE:**
When a customer confirms they want to order, send EXACTLY this single message (copy it verbatim, do not rephrase):
---
${fullForm}
---
CRITICAL RULES:
- Send this entire block as ONE single message. NEVER ask fields one-by-one.
- After the customer replies with their info, parse ALL fields at once.
- Call \`update_customer_info\` with the parsed data.
- Then show the ORDER SUMMARY (see below) and wait for confirmation.
- If parsing fails (missing name, phone, or address), send the error/retry message configured by the business owner.

${orderSummaryRule}`;
  }

  // --- CONVERSATIONAL MODE ---
  const msgs = settings.fastLaneMessages;
  const step1 = msgs?.productConfirm || 'আপনার সম্পূর্ণ নামটি বলবেন?';
  const step2 = msgs?.nameCollected || 'ধন্যবাদ! এখন আপনার ফোন নম্বর দিন।';
  const step3 = msgs?.phoneCollected || 'পেয়েছি! এখন আপনার ডেলিভারি ঠিকানা দিন।';

  return `**COMPLETE FIELD VALIDATION BEFORE ORDER PROCESSING (MANDATORY):**

When a customer submits their order information, 
before calling update_customer_info or check_stock, 
you MUST reason through ALL of these fields:

STEP 1 — Check what fields were provided:
- Name: provided or missing?
- Phone: provided or missing?
- Address: provided or missing?
- Size: provided or missing? (if product has sizes)
- Color: provided or missing? (if product has colors)
- Quantity: provided? (default 1 if missing)

STEP 2 — If ANY required field is missing:
Do NOT call any tool. 
Ask the customer specifically for the missing field:
"ভাইয়া, আপনার [missing field] টা জানাননি। 
[if size/color missing, show available options again]"

STEP 3 — Only when ALL fields are present:
Call check_stock with the provided size+color to 
verify availability.

STEP 4 — check_stock result:
- inStock: true → call update_customer_info, 
  then show order summary
- inStock: false → tell customer this combination 
  is unavailable, show available options, 
  do NOT proceed with order

STEP 5 — After customer confirms summary with হ্যাঁ:
Call save_order immediately.

This validation must happen through your reasoning. 
Never skip a step. Never assume a field is present 
without seeing it in the customer's message.

**NEGOTIATION RULE (CRITICAL):**
When a customer asks for a price discount:

1. Call record_negotiation_attempt immediately
   — do NOT add product to cart first
   — the tool will find the product automatically from context

2. Read the tool result carefully:
   - negotiable: false → say fixed price warmly
   - negotiable: true → follow the round instructions from NEGOTIATION STATUS in your system prompt

3. NEVER assume negotiable: false without calling the tool first

4. NEVER add product to cart just for negotiation
   — cart is only for confirmed orders

**ORDER COLLECTION — CONVERSATIONAL MODE:**
Collect customer info one field at a time, in this exact sequence:
Step 1 — Ask for Name:
Send this message: "${step1}"
Step 2 — Ask for Phone (after name received):
Send this adapted from template: "${step2}" (replace {name} with customer's real name)
Step 3 — Ask for Address (after phone received):
Send this message: "${step3}"
Step 4 — After address received:
Call \`update_customer_info\` with the collected data.
Step 5 — Show ORDER SUMMARY and wait for confirmation (see below).

${orderSummaryRule}`;
}
