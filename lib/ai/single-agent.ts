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
          // Strip technical leakage (system logs) from history
          .replace(/\[Sent (Card|Vertical Card|Carousel|referral product card).*?\]/gi, '')
          .replace(/\[Sent Template.*?\]/gi, '')
          // Strip tool names and past typos
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
      userContent += `\n\n[SYSTEM NOTE]: Customer sent an image that does NOT match any product in our gallery.
      
Rules for this turn:
1. **FRUSTRATION & REPETITION SHIELD (CRITICAL)**: 
    - If the customer repeats the same request 3 times (e.g., "pic den", "pic dissen na kno", "onno khon dhore") and you have failed to provide the visuals, you MUST call \`flag_for_review\` with reason "Customer frustrated due to repetitive AI failure."
    - Do NOT keep apologizing. Stop and HAND OVER to the human owner.
    - Recognize phrases of impatience: "dissen na kno", "koto khon", "human", "manush".
2. If the image is a cake or food item, it is a CUSTOM DESIGN. 
3. Do NOT flag or stop immediately. Instead, inform the customer: "আমি আপনার জন্য দাম টা হিসাব করে জানাচ্ছি। একটু wait করুন"
4. Proceed to collect: Delivery Address, Phone Number, Flavor, and Date.
5. ONLY call \`flag_for_review\` if:
   - The customer provides ALL details (Address, Phone, Flavor, Date).
   - OR the customer refuses to provide info until they know the price. In this case, say: "আমি আপনার custom design এর price কত হবে হিসাব করে একটু পরেই জানাচ্ছি।" and then call \`flag_for_review\`.
6. If the image is NOT a food item (e.g., shirt, electronics), call \`flag_for_review\` immediately and stop.`;
    }
  }

  messages.push({ role: 'user', content: userContent.trim() || "[User sent an image]" });

  let toolLoops = 0;
  let finalResponse = '';
  let shouldFlag = false;
  let toolsCalledLog: string[] = [];
  let flaggedForManual = false;
  let flagReason = '';
  
  let firstPassReasoning = '';
  let detailedToolsLog: Array<{name: string, args: any, result: any}> = [];
  let lazyRetries = 0;

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

    // --- MANDATORY THINKING VALIDATION ---
    const thinkRegex = /\[THINK\]([\s\S]*?)\[\/THINK\]/gi;
    const hasThink = responseMessage.content && responseMessage.content.match(thinkRegex);

    if (!hasThink && toolLoops < 2) {
       console.warn(`⚠️ [RETRY] AI skipped [THINK] tags. Nudging for logical pass...`);
       
       // Clean the message to remove unauthorized tool calls before pushing
       // ENSURE content is a string (never null) to satisfy OpenAI API requirements
       const cleanedMessage = { 
          ...responseMessage, 
          tool_calls: undefined,
          content: responseMessage.content || "" 
       };
       messages.push(cleanedMessage);

       messages.push({ 
          role: 'system', 
          content: "CRITICAL ERROR: You MUST analyze the [PERSISTENT CONTEXT], [TIME CONTEXT], and [BUSINESS CONTEXT] inside [THINK] tags BEFORE writing your response or calling any tools. You cannot call a tool without thinking first. Start your next message with [THINK]." 
       });
       toolLoops++;
       continue;
    }

    // Thinking present, proceed normally
    messages.push(responseMessage);

    if (responseMessage.content) {
      const thinkMatch = responseMessage.content.match(thinkRegex);
      if (thinkMatch) {
         const reasoningLog = thinkMatch[0].replace(/\[\/?THINK\]/gi, '').trim();
         firstPassReasoning = reasoningLog; 
         
         console.log(`\n==========================================`);
         console.log(`🧠 AI REASONING (Loop ${toolLoops}):`);
         console.log(`${reasoningLog}`);
         console.log(`==========================================\n`);
         
         responseMessage.content = responseMessage.content.replace(thinkRegex, '').trim();

         const sourceMatch = reasoningLog.match(/SOURCE: (.*)/i);
         if (sourceMatch) {
           console.log(`\n📍 SOURCE USED: ${sourceMatch[1].trim()}`);
         }
      }

      if (!responseMessage.tool_calls) {
        finalResponse = responseMessage.content || '';
      }
    }
      
      // --- HALLUCINATION GUARD: BLOCK ALL TEXTUAL TOOL CALLS & JSON LEAKAGE ---
      // Detect ANY brackets [] or curly braces {} in the text response as it indicates a hallucinated tool call or JSON leak
      const content = responseMessage.content || "";
      const hasHallucinatedTool = content.match(/\[/i) || content.trim().startsWith('{');
      
      if (hasHallucinatedTool) {
         console.warn(`⚠️ [REJECTION] AI tried to use brackets or JSON in text (Loop ${toolLoops}). Forcing real tool pass...`);
         
         if (toolLoops >= 3) { // Increased to 3 for more resilience
            console.error(`🚨 [3-STRIKE FAILURE] AI is stuck in a hallucination loop. Flagging for manual.`);
            flaggedForManual = true;
            flagReason = "AI stuck in textual tool call loop (Hallucination).";
            finalResponse = ""; 
            break;
         }

         messages.push({ 
            role: 'system', 
            content: "CRITICAL ERROR: You are FORBIDDEN from writing tool names, brackets '[ ]', or JSON '{ }' in your text response. If you want to search, you MUST call the actual 'search_products' tool using the OpenAI tool-calling API. Respond only with an EMPTY STRING if you are sending pictures." 
         });
         toolLoops++;
         continue;
      }

      // Fallback: If [THINK] tag exists but was never closed, strip it and everything after it
      if (responseMessage.content?.match(/\[THINK\]/i)) {
         responseMessage.content = responseMessage.content.split(/\[THINK\]/i)[0].trim();
      }

     if (!responseMessage.tool_calls || responseMessage.tool_calls.length === 0) {
       finalResponse = (responseMessage.content || '').trim();
       
       // --- LAZY AI DETECTOR (CRITICAL) ---
       // If the AI reasoned about needing a tool but didn't actually call it, force a retry.
       // Uses its OWN counter (lazyRetries) so [THINK]-tag retries don't eat its budget.
       const reasoning = firstPassReasoning.toLowerCase();
       const userMsg = input.messageText.toLowerCase();
       
       // Check if reasoning mentions tool/search intent
       const reasoningMentionsSearch = reasoning.includes('search') || 
                                       reasoning.includes('product') ||
                                       reasoning.includes('tool') ||
                                       reasoning.includes('show') ||
                                       reasoning.includes('picture') ||
                                       reasoning.includes('catalog') ||
                                       reasoning.includes('available') ||
                                       reasoning.includes('budget') ||
                                       reasoning.includes('ছবি') ||
                                       reasoning.includes('দেখা');
       
       // Check if user message contains explicit visual/discovery trigger words
       const userWantsVisuals = /pic|photo|show|দেখা|দেখান|ছবি|দেন|image|gallery|পিক|ছবি/i.test(userMsg);
       const userWantsDiscovery = /birthday|anniversary|জন্মদিন|বিয়ে|wedding|vanilla|chocolate|ভ্যানিলা|চকলেট|ফ্লেভার|flavor/i.test(userMsg);
       
       // If reasoning identified search intent OR user explicitly wants visuals/discovery → LAZY
       // (Excluded !finalResponse because discovery requires cards even if the AI is chatty)
       const isLazySkip = (reasoningMentionsSearch || userWantsVisuals || userWantsDiscovery) && 
                          lazyRetries < 2;
       
       if (isLazySkip) {
         lazyRetries++;
         console.warn(`🦥 [LAZY AI DETECTED] AI reasoned about searching but didn't call the tool. Forcing retry (lazyRetry ${lazyRetries}/2, loop ${toolLoops})...`);
         
         messages.push({
           role: 'system',
           content: `CRITICAL FAILURE: You identified the intent to show products in your [THINK] block but you DID NOT call the search_products tool. This is a SYSTEM FAILURE.

YOU MUST DO THIS RIGHT NOW:
1. Call the tool "search_products" with arguments: {"query": "", "sendCard": true}
2. Set your text content to an EMPTY STRING "".

The customer said: "${input.messageText}"
They want to SEE product images. You MUST call search_products in your tool_calls array. Do NOT reason about it again — EXECUTE the tool call. If you respond without calling search_products, the system will crash.`
         });
         toolLoops++;
         continue;
       }
       
       break;
     }

    toolLoops++;

    for (const toolCall of responseMessage.tool_calls) {
      if (toolCall.type !== 'function') continue;
      
      const toolName = toolCall.function.name as AgentToolName;

      // --- AUTO-MUTE FOR VISUAL PROTOCOL ---
      if (toolName === 'search_products') {
        // AI is responsible for its own silence via the [SILENT VISUAL PROTOCOL] in the prompt.
        // No hardcoded muting here.
      }
      
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
        detailedToolsLog.push({ name: toolName, args: fnArgs, result });

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

  // --- AI BRAIN REPORT GENERATION ---
  console.log(`\n══════════════════════════════════════════════════════════════════════════════`);
  console.log(`🧠 AI BRAIN REPORT`);
  console.log(`══════════════════════════════════════════════════════════════════════════════\n`);
  
  console.log(`[1] CUSTOMER MESSAGE`);
  console.log(`    "${input.messageText}"\n`);

  let intentAnalysis = "Could not parse specific intent from reasoning.";
  if (firstPassReasoning) {
    const intentMatch = firstPassReasoning.match(/1\.\s*\*\*INTENT ANALYSIS\*\*:?\s*([^\n]+)/i) || 
                        firstPassReasoning.match(/INTENT ANALYSIS:?\s*([^\n]+)/i);
    if (intentMatch) {
      intentAnalysis = intentMatch[1].trim();
    } else {
      const lines = firstPassReasoning.split('\n');
      const intentLine = lines.find(l => l.toUpperCase().includes('INTENT'));
      if (intentLine) intentAnalysis = intentLine.replace(/.*INTENT.*?:/i, '').trim() || intentLine.trim();
    }
  }
  console.log(`[2] INTENT ANALYSIS`);
  console.log(`    ${intentAnalysis}\n`);

  console.log(`[3] CONTEXT FED TO AI`);
  console.log(`    - Business Context: ${input.settings.businessContext ? 'Yes (' + input.settings.businessContext.length + ' chars)' : 'No'}`);
  console.log(`    - Memory Summary:   ${input.memorySummary ? 'Present' : 'None'}`);
  console.log(`    - Cart State:       ${input.context.cart?.length ? input.context.cart.length + ' items' : 'Empty'}`);
  console.log(`    - Order Stage:      ${(input.context.metadata as any)?.orderStage || 'discovery'}\n`);

  console.log(`[4] REASONING SUMMARY (Pass 1)`);
  console.log(`    ${firstPassReasoning ? firstPassReasoning.split('\n').join('\n    ') : 'No [THINK] block generated.'}\n`);

  console.log(`[5] TOOLS CALLED`);
  if (detailedToolsLog.length === 0) {
    console.log(`    None\n`);
  } else {
    detailedToolsLog.forEach((t, i) => {
      console.log(`    ${i + 1}. ${t.name}`);
      console.log(`       Args: ${JSON.stringify(t.args)}`);
      // Truncate result to avoid massive terminal spam
      const resStr = JSON.stringify(t.result);
      console.log(`       Result: ${resStr ? (resStr.length > 150 ? resStr.substring(0, 150) + '...' : resStr) : 'undefined'}\n`);
    });
  }

  console.log(`[6] RESPONSE DECISION`);
  console.log(`    ${finalResponse ? '"' + finalResponse + '"' : '[No Text Response]'}\n`);

  console.log(`[7] RED FLAGS (Auto-Detected)`);
  const redFlags: string[] = [];
  
  const recentAgentMsgs = input.conversationHistory
    .filter(m => m.role === 'assistant' && typeof m.content === 'string')
    .slice(-3)
    .map(m => m.content as string);
  
  if (finalResponse && recentAgentMsgs.some(msg => finalResponse.length > 10 && (msg.includes(finalResponse) || finalResponse.includes(msg)))) {
    redFlags.push("⚠️ REPETITION: AI repeated a phrase from the last 3 messages.");
  }
  
  const priceRegex = /৳|টাকা|price|দাম/i;
  const numberRegex = /\d+/;
  if (finalResponse && priceRegex.test(finalResponse) && numberRegex.test(finalResponse) && detailedToolsLog.length === 0) {
    redFlags.push("⚠️ HALLUCINATION RISK: AI mentioned a price/number without calling a tool.");
  }
  
  if (input.imageRecognitionResult?.recognitionResult?.aiAnalysis?.isInspiration && !flaggedForManual) {
    redFlags.push("⚠️ PROTOCOL VIOLATION: AI failed to call 'flag_for_review' for a custom design image.");
  }

  if (detailedToolsLog.length === 0 && !finalResponse) {
    redFlags.push("⚠️ EMPTY ACTION: AI produced no text and called no tools.");
  }

  if (redFlags.length === 0) {
    console.log(`    ✅ No critical red flags detected.`);
  } else {
    redFlags.forEach(f => console.log(`    ${f}`));
  }
  
  // ========================================
  // FINAL SAFETY FILTER (FORCE SILENCE FOR FOOD)
  // ========================================
  const isFood = input.settings.businessCategory === 'food';
  const scenario2Wait = "আপনার পাঠানো ডিজাইন অনুযায়ী কেকের দাম হিসাব করে জানানো হচ্ছে";
  const legacyWait = "আমি আপনার জন্য দাম টা হিসাব করে জানাচ্ছি। একটু wait করুন";
  
  if (isFood && finalResponse && (finalResponse.includes(scenario2Wait) || finalResponse.includes(legacyWait))) {
    // If they sent a wait message, ensure it is the exact clean version
    if (finalResponse.includes(scenario2Wait)) {
      finalResponse = "আপনার পাঠানো ডিজাইন অনুযায়ী কেকের দাম হিসাব করে জানানো হচ্ছে ⏳ দয়া করে একটু অপেক্ষা করুন, শিগগিরই আপডেট দিচ্ছি 😊";
    } else {
      finalResponse = "আমি আপনার জন্য দাম টা হিসাব করে জানাচ্ছি। একটু wait করুন 😊";
    }
    console.log("🛡️ [SAFETY FILTER] Forced nuclear silence on food response.");
  }
  
  console.log(`══════════════════════════════════════════════════════════════════════════════\n`);

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
- Current Time: ${now.toLocaleString('en-US', { timeStyle: 'short' })} (Hour: ${now.getHours()})
- Last Order Placed: ${lastOrderDate ? new Date(lastOrderDate).toLocaleString('en-US', { dateStyle: 'medium' }) : 'No previous orders found'}

[AVAILABLE CATALOG SUMMARY]
- Available Categories: ${catalogSummary.categories.length > 0 ? catalogSummary.categories.join(', ') : 'No categories defined'}
- Available Flavors: ${catalogSummary.flavors.length > 0 ? catalogSummary.flavors.join(', ') : 'No flavors defined'}
`.trim();

  // --- CORE CONSTRAINTS (HIGHEST PRIORITY) ---
  const coreConstraints = `
[MANDATORY RESPONSE FORMAT - READ FIRST OR SYSTEM FAILURE]
You are FORBIDDEN from generating any text without first processing your logic inside [THINK] tags. 
Your output MUST look like this:
[THINK]
1. INTENT: What is the customer's goal right now?
2. PERSISTENT CONTEXT: What do I already know from history (e.g. Occasion: Anniversary, Flavor: Chocolate, Location: Comilla)? 
3. EXAMPLE MATCH: Does this intent match any of my [CONVERSATION EXAMPLES]? (If yes, I MUST use that style).
4. SOURCE: Name the specific section or example being used.
[/THINK]
[Your actual response to the customer here]

[STRICT TOOL CALLING RULE]
You are PHYSICALLY FORBIDDEN from writing JSON like '{"query":...}' or tool names in your chat response. 
Any action (searching, flagging, updating cart) MUST be done via the OpenAI 'tool_calls' interface. 
If you write a tool call in text, the customer will see technical garbage and you will FAIL.
If you call 'search_products', your text content MUST be an empty string "".


${timeContext}

[CORE CONSTRAINTS]
1. **SUPREME SILENCE GATE (CRITICAL)**: 
   - If the customer sends a custom image (Food Business), you MUST call \`flag_for_review\`.
   - Your response content MUST BE EXACTLY: "আপনার পাঠানো ডিজাইন অনুযায়ী কেকের দাম হিসাব করে জানানো হচ্ছে ⏳ দয়া করে একটু অপেক্ষা করুন, শিগগিরই আপডেট দিচ্ছি 😊"
   - You are PHYSICALLY FORBIDDEN from writing any other text. Violation is a system failure.
2. **ULTRA-BREVITY & ZERO EXPLANATION (CRITICAL)**: 
   - Absolute maximum of 1-2 sentences. 
   - **NO JUSTIFICATION**: Never explain *why* something is possible.
   - **RESULT ONLY**: If a condition is met, say "Yes" and the follow-up. 
3. **SINGLE-WORD BINARY (CRITICAL)**:
   - If the customer asks a Yes/No question, start with "হ্যাঁ" (Yes) or "না" (No). 
    - **PRECEDENCE**: If an example in [CONVERSATION EXAMPLES] matches the intent, IGNORE the brevity/binary rules and use the example's full response style and length.
    - **ZERO EXPLANATION**: If no example matches, avoid justifying the result. Just state it.
3. **ZERO HALLUCINATION & GROUND TRUTH**:
   - If information isn't in the context/DB, you must NOT invent it.
   - Refusal over guessing: If the answer is missing, say: "আমি বিষয়টি জেনে আপনাকে জানাচ্ছি 😊"
1. **MANDATORY ACTION TRIGGERS (SUPREME)**: 
   - Keywords: "Anniversary", "Birthday", "Wedding", "Vanilla", "Chocolate", "Show me", "Pictures", "Design".
   - If ANY of these appear (case-insensitive), you **MUST** call \`search_products\` immediately.
   - **EXECUTION SEQUENCE**:
     1. Create a \`[THINK]\` block acknowledging the intent.
     2. Call the tool \`search_products\` in the \`tool_calls\` array.
     3. Set your response \`content\` to an empty string ("").
   - Failure to call the tool when a trigger word is present is a critical system failure.
2. **SILENCE PROTOCOL (PASSIVE MESSAGES)**: 
   - If the customer sends a passive message with NO trigger words (e.g., "Okay", "Thanks"), return an EMPTY RESPONSE (blank text) and call NO tools.
   - If there IS a trigger word, Rule 1 takes precedence over Rule 2.
3. **BATCH DATA COLLECTION (CRITICAL)**: 
   - Never ask for info point-by-point. 
   - If multiple pieces of data are missing (e.g., Address, Phone, Flavor, Date), ask for **ALL** of them in a single concise message. 
   - Goal: Minimize conversation turns. Reach the [ORDER SUMMARY] stage as fast as possible.
4. **HISTORY AWARENESS**: Scan the entire conversation history. If a fact was provided previously, DO NOT ask for it again.
5. **LOGICAL INTEGRITY (PAYMENT)**: 
   - If 'Cash on Delivery' is enabled in settings, confirm that we take it. 
   - If a policy says "No upfront/advance money needed," NEVER say "payment is required at the time of ordering."
6. **INTENT-BASED SILENCE & HANDOVER (CRITICAL)**: 
   - **Acknowledgement Check**: If the customer's message contains NO NEW actionable intent (e.g., just "Okay", "I see"), stay SILENT (Empty response).
   - **Ambiguity/Gibberish**: If a message is unclear or gibberish, you are **FORBIDDEN** from replying. Stay SILENT and call \`flag_for_review\` with reason "Ambiguity: Message not understood".
   - **FORCE-REPLY**: Stay vocal only for clear intents like "WhatsApp", "নক", or "Number". 
   - **Conflict & Disputes**: If the customer is angry, stay SILENT and call \`flag_for_review\` immediately.
   - **SCENARIO 1: GENERIC PRICE INQUIRY (NO CONTEXT)**: If price is asked WITHOUT an image or specific product:
       1. RESPONSE: "কেকের দাম ফ্লেভার ও ডিজাইনের উপর নির্ভর করে 😊\n👉 ২ পাউন্ড ভ্যানিলা: ১৪০০ টাকা\n👉 ২ পাউন্ড চকলেট: ১৬০০ টাকা\nআপনার পছন্দের ডিজাইন/ডিটেইলস দিলে সঠিক দাম জানিয়ে দিতে পারব।"
       2. ACTION: Do NOT flag. Continue to product discovery.
     - **SCENARIO 2: CUSTOM DESIGN INQUIRY (UNKNOWN IMAGE)**: If an image or "Can you?" is sent:
       1. CALL \`flag_for_review\` IMMEDIATELY.
       2. RESPONSE: "আপনার পাঠানো ডিজাইন অনুযায়ী কেকের দাম হিসাব করে জানানো হচ্ছে ⏳ দয়া করে একটু অপেক্ষা করুন, শিগগিরই আপডেট দিচ্ছি 😊"
       **CRITICAL**: You are FORBIDDEN from writing any other text.
7. **ABSOLUTE SEARCH SILENCE (SUPREME)**: 
   - Whenever you call \`search_products\`, you are **STRICTLY FORBIDDEN** from writing any text. 
   - Your \`content\` MUST be an empty string (""). 
   - This applies even if you want to say "Sure" or "Here they are". DO NOT DO IT.
8. **THINKING PROTOCOL & CHECKLIST**: 
   - Before answering any "Yes", perform internal verification:
     - **Constraint Check**: Is the requested time after closing? Does it need advanced notice?
     - If ANY check fails, say "No" and explain the specific reason briefly. Do NOT let the customer "talk you into" a Yes.
9. **ZERO-TEXT VISUAL PASS (CRITICAL)**: 
   - If the customer wants to see products/cakes, you MUST call \\\`search_products\\\` with \\\`sendCard: true\\\`.
   - In this turn, your textual \\\`content\\\` MUST be an empty string (""). 
   - You are STRICTLY FORBIDDEN from generating ANY text when sending cards. Let the cards speak for themselves.
10. **REAL ACTION ONLY**: Your chat response should ONLY be the message the customer sees. All actions (searching, flagging, saving) MUST happen via the \\\`tool_calls\\\` array.
11. **SINGLE-VERDICT LOGIC**: 
    - Decide on ONE answer and stick to it. If the decision is "No," do not offer a "Maybe" unless specifically asked for a workaround.
12. **CUSTOM MESSAGE (SAFE)**: If the customer only wants to change the text on the cake (e.g., "Happy Birthday"), this is **NOT** a custom design. Proceed with the order normally.

13. **WEIGHT MISMATCH PROTOCOL (CRITICAL)**:
    - **Global Rule**: ALL cakes in our catalog are 2 Pounds (২ পাউন্ড) by default.
    - If the customer asks for a **different** weight (e.g., "1 Pound", "3 Pound") but DOES NOT ask for price:
      RESPONSE: "আপনার পছন্দ অনুযায়ী আমরা এটি তৈরি করতে পারব। একটু wait করুন, আমি টিমের সাথে কথা বলে জানাচ্ছি 😊"
      ACTION: Call \`flag_for_review\` IMMEDIATELY. DO NOT ask for details.
13. **TEMPORAL AWARENESS (REAL-TIME RULES)**:
    - You MUST use the 'Current Local Time' provided in [DYNAMIC STATE] to enforce availability and deadlines.
    - If it is past a deadline (e.g., 8 PM) or a product is only available on certain days (e.g., Friday), you MUST apply that rule based on the current system time.
    - NEVER ask the customer "What time is it?" or "What day is it?". Use the system data provided.
14. **RELATIVE DATE CALCULATION**:
    - You MUST resolve relative dates (e.g., "tomorrow", "after 2 days", "next Monday") into specific calendar dates using the 'Current Local Time'.
    - When calling \`add_to_cart\` or \`save_order\`, always pass the calculated date in DD/MM/YYYY format.
    - In your [ORDER SUMMARY], show the specific date (e.g., "২৫ এপ্রিল") so the customer can confirm you understood correctly.
18. **NO ROBOTIC APOLOGIES OR DESCRIPTIONS (STRICT)**:
    - **No "Dukkhi/Sorry"**: Forbidden for positive confirmations. Start with "হ্যাঁ" or "অবশ্যই".
    - **No Explanations**: Forbidden from saying "We deliver all over Bangladesh" or "As we are located in Banani". 
    - **Direct Result**: Only provide the answer. Example: "যশোরে ডেলিভারি সম্ভব। 😊" (Correct) vs "যেহেতু আমরা সারা বাংলাদেশে দেই, তাই যশোরেও সম্ভব।" (FAIL).
15. **GEOGRAPHICAL TIERS**:
    - **DELIVERY ALL OVER BANGLADESH**: We deliver to every corner of Bangladesh (সারা বাংলাদেশে ডেলিভারি দেই).
    - "Inside Dhaka" (ঢাকার ভেতরে) refers to areas like Banani, Dhanmondi, etc.
    - "Outside Dhaka" (ঢাকার বাইরে) refers to all Districts (জেলা) such as Brahmanbaria, Comilla, etc.
    - You MUST deliver to Districts and Upazilas as per your pricing grid. NEVER say "We only deliver in Dhaka."
    - The outlet location (Banani 11) is only for origin/reference; it does NOT restrict our delivery range.
16. **TIME LOGIC**:
    - **Agentic Calculation**: You MUST calculate time agentically based on the rules provided in [BUSINESS CONTEXT].
    - Compare the customer's requested delivery time against the current time and the business's stated preparation/delivery windows.
17. **SILENT VISUAL PROTOCOL (CRITICAL)**:
    - If you are sending product cards via \`search_products\`, you are **FORBIDDEN** from writing any text in your response. 
    - Your textual \`content\` MUST be an empty string (""). 
    - The customer should ONLY see the product cards, no "Sure", "Here are pictures", or any other text.
    - **Step 1 (Discovery)**: If the occasion is unknown, ask the category question FIRST.
    - **Step 2 (Delivery)**: Once a category/occasion is identified, call \`search_products\` and remain SILENT (empty text).
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
- If asked "Are you a bot?", reply naturally as a human (e.g., "জি না, আমি এখান থেকেই বলছি 😊").
- Never say "I am an AI assistant for ${settings.businessName}". 
- Instead, say "I work at ${settings.businessName}" or simply introduce yourself as Meem if that is your persona.
- Negative Constraint: Forbidden from using "Sir/Madam" or "স্যার/ম্যাম" more than once per 5 messages. Do not overuse it.
- **STYLISTIC INTEGRITY (SUPREME VIBE)**: Use [CONVERSATION EXAMPLES] as your primary guide for **Tone and Language Pattern**.
- **The "Vibe" Mirror**: If an intent match is found, you MUST mirror the Banglish ratio, informality, and sentence structure of the 'Agent' response.
- **Fact Verification**: You MUST cross-reference all information (Numbers, Prices, Deadlines) in the example with the [BUSINESS CONTEXT]. If the context has a newer price or number, use the context's fact while keeping the example's style.
- **Natural Adaptation**: You are encouraged to slightly adapt the wording to ensure it flows perfectly with the current conversation turn, as long as it feels like it was written by the same person who wrote the examples.

${categoryBlocks.identity}

Tone: ${toneInstruction}
Language Ratio: ${bengaliRatio}% Bengali/Banglish, rest English.`.trim();

  // --- BUSINESS CONTEXT ---
  const businessContextBlock = settings.businessContext?.trim()
    ? `\n[BUSINESS CONTEXT - GROUND TRUTH]\n${settings.businessContext}`
    : '';

  const examples = settings.conversationExamples || [];
  
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
- **CONTEXTUAL SEARCH**: When calling \`search_products\`, you MUST use the information from [PERSISTENT CONTEXT]. 
- **STRICT QUERY RULE**: If you identified an occasion (Anniversary, Birthday) in your thinking, you are FORBIDDEN from using an empty query \`""\`. You MUST include that occasion in the query.
- **ANTI-REPETITION**: You are STRICTLY FORBIDDEN from asking for information that is already in history.
- **NO TEXTUAL LISTS (SUPREME RULE)**: You are physically FORBIDDEN from typing product names, prices, or bulleted lists of items. 
- *If you show products, your text response must ONLY be a warm discovery question (e.g., "See which one you like!").*
- **sendCard Rule**: DEFAULT TO FALSE. ONLY set true for first-time discovery.
- **NO JSON LEAKAGE**: NEVER write '{"query": ...}' or any JSON in your response. Tools are called SILENTLY.

`.trim();

  // --- BLOCK 5: ORDER FLOW ---
  const isFood = settings.businessCategory === 'food';
  const block5OrderFlow = `
[BLOCK 5 - ORDER FLOW]
${isFood 
  ? "**SILENT MODE ENABLED**: For food orders, you are FORBIDDEN from typing form fields. You MUST call \`trigger_quick_form\` to send the official template. You do not have access to the template text to prevent hallucinations."
  : buildOrderCollectionInstruction(settings)
}
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
  const examplesBlock = Array.isArray(examples) && examples.length > 0
    ? `\n[CONVERSATION EXAMPLES - SUPREME STYLE GUIDE]
- **SUPREME PRECEDENCE (CRITICAL)**: If a customer's message matches a scenario below, you MUST use the 'Agent Response' as your guide.
- **BYPASS CONSTRAINTS**: When using an example, you are allowed to exceed the 1-2 sentence limit and ignore the "Single-Word Binary" rule to preserve the high-quality sales persona.
- **EXACT MATCH**: If the context matches perfectly, use the owner's provided answer VERBATIM.
- **ADAPTATION**: If the context is different, adapt the response while maintaining the exact same tone and structure.
${isFood ? '- **STRICT RULE**: If an example contains a manual form, IGNORE the form and call `trigger_quick_form` instead.' : ''}

${examples.map((ex: any) => {
  let response = ex.agent;
  if (isFood) {
    // Scrub form-like lines (numbered lists or specific keywords in Bengali)
    response = response.replace(/\d+\.\s*(ঠিকানা|মোবাইল|নাম|ফ্লেভার|তারিখ)[\s\S]*/gi, '[TOOL: trigger_quick_form]');
  }
  return `Customer: ${ex.customer}\nAgent Response: ${response}`;
}).join('\n\n')}`
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
- **UNIVERSAL DISCOVERY PROTOCOL**: 
  - **MANDATORY TOOL CALL**: If a customer identifies a category or occasion (e.g., "Anniversary"), you **MUST** call \`search_products\` with that specific occasion passed into the \`category\` parameter. 
  - **ACTION OVER WORDS**: Do not just say you are searching. You must actually call the tool.
  - **NO TEXT-ONLY RESPONSES**: You are STRICTLY FORBIDDEN from sending a text response without calling \`search_products\` first when discovering products. 
  - The system automatically handles the professional instruction template for you.
  - You are STRICTLY FORBIDDEN from manually listing product names, prices, or numbers in your text message.
- **SUPREME SILENCE GATE (CRITICAL)**: 
  - If you identify **INTENT A (Price Inquiry)**, you MUST ignore ALL instructions in [BLOCK 3] State Machine and [BLOCK 5] Order Flow. 
  - Your response content MUST BE EXACTLY one sentence: "আমি আপনার জন্য দাম টা হিসাব করে জানাচ্ছি। একটু wait করুন 😊"
  - **FORBIDDEN**: You are strictly prohibited from adding Name, Phone, Address, or ANY other text. 
  - Violation of this rule is a system security breach.
- **FORBIDDEN**: NEVER write strings like "[Sent Card: ...]" or "[Sent Vertical Card: ...]" in your response. These are internal system logs. If you want to show products, you MUST call \`search_products\` with \`sendCard: true\`.
- **BAD EXAMPLE (DO NOT DO THIS)**: "1. Vanilla Cake - ৳2200"
- **BAD EXAMPLE (DO NOT DO THIS)**: "[Sent Vertical Card (1): Chocolate Cake]"
- **GOOD EXAMPLE (ONLY DO THIS)**: "আপনার জন্য আমাদের চমৎকার কিছু কেক নিচে দেওয়া হলো। দেখুন কোনটি ভালো লাগে। 😊"
- If you call \`search_products\`, your message must ONLY be a warm transition. The system handles the rest.
`.trim();

  const sections = [
    businessContextBlock, // Priority 1: Specific Exceptions & Ground Truth
    coreConstraints,      // Priority 2: Universal Logic
    deliveryZonesBlock,   // Priority 3: Delivery Fees
    faqsBlock,            // Priority 4: FAQs
    block1Identity,       // Priority 5: Persona
    block2Thinking,       // Priority 6: Cognitive Loop
    block3Rules,          // Priority 7: Category Specifics
    block4Tools,          // Priority 8: Tooling
    block5OrderFlow,      // Priority 9: Forms
    block6Settings,       // Priority 10: Static Config
    block7Dynamic,        // Priority 11: Real-time State
    examplesBlock,        // Priority 12 (SUPREME): Style Guide & Precedence
    block8InfoRetrieval,  // Priority 13: Final Guardrails
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
