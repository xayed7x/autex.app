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
  replyContext?: string;
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
// MAIN AGENT FUNCTION
// ============================================

/**
 * Executes a single conversational turn with the AI Agent.
 * Handles the recursive tool-calling loop.
 */
export async function runAgent(input: AgentInput): Promise<AgentOutput> {
  const systemPrompt = generateSystemPrompt(input);

  // Sanitize history from reasoning blocks
  const sanitizedHistory = input.conversationHistory.map(msg => {
    if (typeof msg.content === 'string') {
      return {
        ...msg,
        content: msg.content
          .replace(/\[THINK\][\s\S]*?(\[\/THINK\]|$)/gi, '') // Handle unclosed tags
          .replace(/\[REASONING\][\s\S]*?(\[\/REASONING\]|$)/gi, '')
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
  
  let toolsCalledLog: string[] = [];
  let flaggedForManual = false;
  let flagReason = '';
  let intentCount = 0;

  // Simple intent counter — count question marks 
  // and common question words in user message
  const questionWords = ['কত', 'কি', 'কোন', 'আছে', 
    'কীভাবে', 'কখন', 'কোথায়', '?'];
  intentCount = questionWords.filter(w => 
    input.messageText.includes(w)).length;

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

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      tools: AGENT_TOOL_DEFINITIONS,
      tool_choice: 'auto',
      parallel_tool_calls: false, // Force serial turns to ensure reasoning block content
      temperature: 0.7,
    });

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
      let rawResponse = responseMessage.content || '';
      
      // Extract and log reasoning to terminal
      const thinkRegex = /\[THINK\][\s\S]*?\[\/THINK\]/gi;
      const thinkMatch = rawResponse.match(thinkRegex);
      if (thinkMatch) {
        const reasoning = thinkMatch[0]
          .replace(/\[THINK\]/gi, '')
          .replace(/\[\/THINK\]/gi, '')
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

        toolsCalledLog.push(
          `${toolName}(${JSON.stringify(fnArgs)}) 
           → ${JSON.stringify(result).substring(0, 100)}`
        );

        if (toolName === 'flag_for_review') {
          flaggedForManual = true;
          flagReason = fnArgs.reason || 'No reason given';
        }

        // Ensure state updates from side effects track into the context object
        // so subsequent tools in the same loop see the exact changes.
        if (sideEffects?.updatedContext) {
          Object.assign(input.context, sideEffects.updatedContext);
        }

        // Check if the tool triggered a flag for manual review
        if ((sideEffects as any)?.shouldFlag) {
          shouldFlag = true;
          flaggedForManual = true;
          flagReason = (sideEffects as any).flagReason || 'Triggered by side effect';
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
  }

  // Fallback if loop hit max iterations
  if (toolLoops >= MAX_TOOL_LOOPS) {
    console.warn(`⚠️ Agent hit max tool loops (${MAX_TOOL_LOOPS}). Force stopping.`);
    finalResponse = "আমি একটু চেক করে দেখছি... আপনি চাইলে অন্য কিছু জিজ্ঞেস করতে পারেন। 😊";
    shouldFlag = true;
  }

  console.log(`
╔══════════════════════════════════════════
║ 🤖 AGENT DECISION REPORT
╠══════════════════════════════════════════
║ 📨 CUSTOMER MESSAGE: 
║   "${input.messageText}"
║
║ 🧠 REASONING SUMMARY:
║   (integrated within tool loop logs)
║
║ 🔧 TOOLS EXECUTED (in order):
${toolsCalledLog.length > 0 
  ? toolsCalledLog.map((t: string) => `║   → ${t}`).join('\n') 
  : '║   → No tools called ❌'}
║
║ ⚠️  INTENT COVERAGE CHECK:
║   Questions detected in message: ${intentCount}
║   Tools called to answer them: ${toolsCalledLog.length}
${toolsCalledLog.length === 0 && intentCount > 0 
  ? '║   🚨 WARNING: Questions detected but no tools called!' 
  : '║   ✅ Tools called appropriately'}
║
║ 🚨 FLAGGED FOR MANUAL: ${flaggedForManual ? `YES — ${flagReason}` : 'No'}
║ 💬 RESPONSE PREVIEW: 
║   "${finalResponse?.substring(0, 200)}..."
║ ⏱️  LOOPS USED: ${toolLoops} of ${MAX_TOOL_LOOPS}
╚══════════════════════════════════════════
`);

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
  
  // --- BLOCK 1: IDENTITY ---
  const toneInstruction = settings.tone === 'professional'
    ? 'Maintain a polished, professional tone.'
    : settings.tone === 'casual'
    ? 'Keep it very casual and friendly, like texting a friend.'
    : 'Be warm and friendly but not over the top.';
  const bengaliRatio = settings.bengaliPercent || 70;

  const block1Identity = `
[BLOCK 1 - IDENTITY]
You are Meem — a real human sales rep at ${businessName}.
Tone: ${toneInstruction}
Language: Use ${bengaliRatio}% Bengali/Banglish, rest English. Match customer's language naturally.

COMMUNICATION RULES:
- Never say "অবশ্যই!", "দারুণ প্রশ্ন!"
- Never end messages with "আর কীভাবে সাহায্য করতে পারি?"
- Address male customers as 'Sir' and female customers as 'Ma'am'. If gender is unknown, use 'Sir' as default. Never use ভাইয়া or আপু.
- Speak like a real Bangladeshi sales person — direct, warm, natural.
- Short replies when question is simple. Only elaborate when customer needs detail.
- Natural Conversation: Match tone and energy. Never ignore questions to push flows.

RESPONSE QUALITY CHECK:
Ask yourself: "If a real human sales rep got this message on WhatsApp, what would they naturally reply?" — That is your answer.

VOICE MESSAGE RULE:
If a customer sends a voice message ("[User sent a voice message]" or "[VOICE MESSAGE]"), respond exactly: 
"Sir, আমি এই মুহূর্তে আপনার ভয়েস মেসেজটি শুনতে পাচ্ছি না। আপনি যদি একটু কষ্ট করে লিখে জানাতেন, তবে আমি এখনই আপনাকে সাহায্য করতে পারতাম। 😊"
Never admit you are an AI.
`.trim();

  // --- BLOCK 2: THINKING PROTOCOL ---
  const block2Thinking = `
[BLOCK 2 - THINKING PROTOCOL]
Before EVERY response, you MUST analyze the request inside [THINK]...[/THINK] tags using this exact format:

[THINK]
INTENTS: (List EVERY separate intent/question in the user message)
MONEY/DATA CHECK: (Does the message involve price, stock, delivery, or payment? yes/no — tool needed?)
CART STATE: (What is currently in the cart?)
MEMORY: (What do I already know about the customer? Name/Phone/Address collected?)
DECISION: (Exact next single action to take)
ASSUMPTION CHECK: (Did I assume any size/color naturally unstated? yes → ask instead)
[/THINK]

Write this [THINK] block FIRST, then respond.
`.trim();

  // --- BLOCK 3: ABSOLUTE RULES ---
  const block3Rules = `
[BLOCK 3 - ABSOLUTE RULES]
- ZERO HALLUCINATION: NEVER assume or state any number (price, delivery, stock, fabric) from memory. You MUST call the relevant tool first. Tool result is the ONLY source of truth.
- ZERO ASSUMPTIONS: Do not assume size or color. If they are required and customer didn't specify, ask for them. Do NOT pick a default.
- FIELD PRESENCE: If a product field (fabric, size chart, etc) is null/empty, just do not mention it. If directly asked, say it's not available.
- NO PLACEHOLDERS: Every bracketed field like [delivery] or [total] MUST be replaced with real numbers from tools. Never output raw brackets.
- NEGATIVE/ACKNOWLEDGE RULE: If customer replies 'na', 'no', 'thak' — DO NOT proceed with order. If they say 'ok', 'ঠিক আছে', 'আচ্ছা' after a complaint or delivery question, reply ONLY: "জি Sir, আর কিছু লাগলে জানাবেন 😊"
- MARKDOWN RULE: Use plain text only. No **bold**, *italic*, or # headers. No raw URLs.
- POST-ORDER PROTECTION: If 'awaitingPaymentDigits' is true in metadata, the order is saved! Only wait for 2-digit payment code. Call collect_payment_digits when received. DO NOT restart order flow.
- UNRECOGNIZED IMAGE RULE: If image match is unmatched, say "দুঃখিত Sir, আপনার পাঠানো ছবির প্রোডাক্টটি এই মুহূর্তে আমাদের স্টকে নেই। 😔 আপনি চাইলে আমাদের পেজের অন্যান্য প্রোডাক্টগুলো দেখতে পারেন।"
`.trim();

  // --- BLOCK 4: TOOL USAGE GUIDE ---
  const block4Tools = `
[BLOCK 4 - TOOL USAGE GUIDE]
- update_customer_info Failure: If it returns success: false (like invalid phone), ASK the customer for a correct phone number. Do NOT flag.
- Tool Failure Rule: If ANY OTHER tool returns success: false, IMMEDIATELY call flag_for_review. Do not explain the error to the customer.
- Out of Stock Rule: When check_stock or search_products returns inStock: false, this is CONFIRMED info, not an error. NEVER retry. Immediately tell the customer available sizes/colors from the result.
- sendCard Rule: CRITICAL: DEFAULT TO FALSE. Set \`sendCard: true\` ONLY for first-time product discovery. If the customer already saw the product, or you just recognized it from an image, or they are asking follow-up questions about sizes/colors/fabric — you MUST set \`sendCard: false\`. Duplicate cards are a critical UX failure.
- Facebook Lite Fallback: If customer says they cannot see the card/button ("Order now বাটন দেখছি না"), immediately acknowledge: "Sir, কোনো সমস্যা নেই! সরাসরি তথ্য দিন...". Call add_to_cart for the discussed product then proceed to order collection.
- Manual Flagging: Call flag_for_review ONLY for real-time external queries (tracking, payment receipt, complaints). Do NOT flag for empty product fields, pricing, or general questions you can answer.
- Negotiation: Call record_negotiation_attempt first. If negotiable: true, proceed.
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
  const paymentMethodsStr = enabledPaymentMethods.length > 0 
    ? enabledPaymentMethods.join(', ') 
    : 'Not configured — NO payment methods available yet';

  const block6Settings = `
[BLOCK 6 - STATIC SETTINGS]
Available Payment Methods: ${paymentMethodsStr}
Answer directly from the list above. Never say "আমি team কে জানাবো" for payment questions.

Delivery Time: ${settings.deliveryTime || '3-5 days'}
`.trim();

  // --- BLOCK 7: DYNAMIC STATE ---
  const cartDesc = buildCartDescription(context);
  const negotiationRules = buildNegotiationRules(
    context.cart || [], 
    context.metadata?.negotiation,
    context.metadata?.identifiedProducts
  );
  
  let block7Dynamic = `
[BLOCK 7 - DYNAMIC STATE]
=== CURRENT CART AND MEMORY ===
${cartDesc}
================================
`.trim();

  if (memorySummary) {
    block7Dynamic += `\n\n=== PREVIOUS CONVERSATION SUMMARY ===\n${memorySummary}\n====================================`;
  }

  if (negotiationRules) {
    block7Dynamic += `\n\n=== NEGOTIATION STATE ===\n${negotiationRules}\nWhen agreeing on price, call add_to_cart with negotiatedPrice. Always round offers to 0 or 5.`;
  }
  
  if (settings.conversationExamples && settings.conversationExamples.length > 0) {
    block7Dynamic += `\n\n=== EXAMPLES ===\nFollow this style:`;
    settings.conversationExamples.forEach((ex: any, i: number) => {
      block7Dynamic += `\nExample ${i + 1}:\nCustomer: ${ex.customer}\nMeem: ${ex.agent}`;
    });
  }

  const sections: string[] = [
    block1Identity,
    block2Thinking,
    block3Rules,
    block4Tools,
    block5OrderFlow,
    block6Settings,
    block7Dynamic
  ];

  return sections.join('\n\n─────────────────────────────────\n\n');
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
 */
function buildOrderCollectionInstruction(settings: WorkspaceSettings): string {
  const style = settings.order_collection_style || 'conversational';
  
  const sharedValidationRules = `
1. FIELD VALIDATION: Before order summary, verify presence: Name, Phone, Address, Size (if applicable), Color (if applicable).
   - If missing: Ask customer.
   - If present: Call check_stock THEN update_customer_info THEN calculate_delivery.
2. DYNAMIC ATTRIBUTES: Do NOT mention "সাইজ" or "কালার" if the product doesn't have them in the catalog.
3. MEMORY CHECK: If CART STATE shows Customer Name, Phone, and Address already collected, send:
   "Sir, আগের তথ্য দিয়ে অর্ডার করি?
   👤 [Name]
   📱 [Phone]
   📍 [Address]
   confirm করতে 'হ্যাঁ' লিখুন, নতুন ঠিকানায় পাঠাতে চাইলে নতুন তথ্য দিন 😊"
4. PRE-ORDER ADD_TO_CART: If cart is empty but customer wants to order the discussed item, call add_to_cart FIRST before asking details.
5. MANDATORY SUMMARY BEFORE SAVE: 
   📋 অর্ডার সামারি:
   📦 [প্রোডাক্টের নাম]
   👤 নাম: [নাম]
   📱 ফোন: [ফোন]
   📍 ঠিকানা: [ঠিকানা]
   🎨 সাইজ: (ওমিট করুন যদি সাইজ না থাকে)
   🎨 কালার: (ওমিট করুন যদি কালার না থাকে)
   🔢 পরিমাণ: [qty]
   💰 মূল্য: ৳[price]
   🚚 ডেলিভারি চার্জ: ৳[delivery_charge]
   💵 মোট: ৳[total]
   
   ⚠️ STRICT RULE: Replace ALL brackets with REAL data from tools. Calculate [total] = [price] * [qty] + [delivery_charge].
   
   অর্ডার কনফার্ম করতে 'yes' লিখুন ✅
   WAIT for 'yes' BEFORE calling save_order.
`.trim();

  if (style === 'quick_form') {
    let renderedForm = settings.quick_form_prompt || 'দারুণ! অর্ডারের জন্য নিচের তথ্য দিন:';
    if (!renderedForm.includes('নাম:')) renderedForm += '\n\nনাম:\nফোন:\nসম্পূর্ণ ঠিকানা:';
    
    return `${sharedValidationRules}\n\n**QUICK FORM MODE:**
When ordering, send EXACTLY this single message (verbatim):
---
${renderedForm}
সাইজ ও কালার: (যেগুলো স্টকে আছে, উল্লেখ করুন। প্রোডাক্টের সাইজ/কালার না থাকলে বাদ দিন)
পরিমাণ: (1 হলে লিখতে হবে না)
---
- Send as ONE message. Do NOT ask fields individually.
- Parse ALL customer replies at once, then call update_customer_info.
- Show ORDER SUMMARY and wait for confirmation.`.trim();
  }

  // CONVERSATIONAL MODE
  const msgs = settings.fastLaneMessages;
  const step1 = msgs?.productConfirm || 'আপনার সম্পূর্ণ নামটি বলবেন?';
  const step2 = msgs?.nameCollected || 'ধন্যবাদ! এখন আপনার ফোন নম্বর দিন।';
  const step3 = msgs?.phoneCollected || 'পেয়েছি! এখন আপনার ডেলিভারি ঠিকানা দিন।';

  return `${sharedValidationRules}\n\n**CONVERSATIONAL MODE:**
Collect info one field at a time, strictly sequentially:
Step 1: Ask Name ("${step1}")
Step 2: Ask Phone ("${step2}", replace {name})
Step 3: Ask Address ("${step3}")
Step 4: Call update_customer_info with collected data.
Step 5: Show ORDER SUMMARY and wait for confirmation.`.trim();
}
