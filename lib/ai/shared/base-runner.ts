/**
 * Shared Base Runner for AI Agent Tool Loop
 */

import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/index.mjs';
import { AgentInput, AgentOutput } from './types';
import { executeTool } from '../tools/executor';
import { logApiUsage } from '../usage-tracker';
import { type AgentToolName } from '../tools/definitions';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MAX_TOOL_LOOPS = 10;

/**
 * Executes the core tool-calling loop and reasoning pass.
 */
export async function runAgentLoop(
  input: AgentInput,
  systemPrompt: string,
  tools: any[]
): Promise<AgentOutput> {
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...input.conversationHistory,
  ];

  // Append current user message (handling potential image context)
  let userContent = input.messageText;
  if (input.replyContext) {
    userContent = `${input.replyContext}\n\n${userContent}`;
  }
  
  // (Note: Recognition context is already handled by caller in single-agent.ts logic)
  messages.push({ role: 'user', content: userContent.trim() || "[User sent an image]" });

  let toolLoops = 0;
  let finalResponse = '';
  let shouldFlag = false;
  let toolsCalledLog: string[] = [];
  let flaggedForManual = false;
  let flagReason = '';
  let shouldTriggerQuickForm = false;
  
  let firstPassReasoning = '';
  let detailedToolsLog: Array<{name: string, args: any, result: any}> = [];
  let lazyRetries = 0;

  while (toolLoops < MAX_TOOL_LOOPS) {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      tools: tools,
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

    let responseMessage = completion.choices[0].message;

    // --- MANDATORY THINKING VALIDATION ---
    const thinkRegex = /\[THINK\]([\s\S]*?)\[\/THINK\]/gi;
    const hasThink = responseMessage.content && responseMessage.content.match(thinkRegex);

    if (!hasThink && toolLoops < 2) {
       console.warn(`⚠️ [RETRY] AI skipped [THINK] tags. Nudging for logical pass...`);
       const cleanedMessage = { ...responseMessage, tool_calls: undefined, content: responseMessage.content || "" };
       messages.push(cleanedMessage);
       messages.push({ role: 'system', content: "CRITICAL: You MUST use [THINK]...[/THINK] tags to analyze the situation BEFORE your final response." });
       toolLoops++;
       continue;
    }

    messages.push(responseMessage);

    if (responseMessage.content) {
      const thinkMatch = responseMessage.content.match(thinkRegex);
      if (thinkMatch) {
         const reasoningLog = thinkMatch[0].replace(/\[\/?THINK\]/gi, '').trim();
         firstPassReasoning = reasoningLog; 
         responseMessage.content = responseMessage.content.replace(thinkRegex, '').trim();
      }
      if (!responseMessage.tool_calls) {
        finalResponse = responseMessage.content || '';
      }
    }
      
    if (responseMessage.content && (responseMessage.content.match(/\[/i) || responseMessage.content.trim().startsWith('{'))) {
         if (toolLoops >= 3) {
            flaggedForManual = true;
            flagReason = "AI stuck in textual tool call loop (Hallucination).";
            break;
         }
         responseMessage.tool_calls = undefined;
         messages.push({ role: 'system', content: "CRITICAL ERROR: You are FORBIDDEN from writing tool names, brackets '[ ]', or JSON '{ }' in your text response." });
         toolLoops++;
         continue;
    }

    if (!responseMessage.tool_calls || responseMessage.tool_calls.length === 0) {
        // ========================================
        // 🚀 LAZY TOOL DETECTOR (SUPREME INTENT GUARD)
        // ========================================
        // If no tools were called, check if the reasoning intended to call one.
        if (firstPassReasoning && lazyRetries < 1) {
          const intentCheck = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            max_tokens: 100,
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'system',
                content: `Analyze the following AI reasoning and extract the intended tool call. 
                Return JSON: { "should_call_tool": boolean, "tool_name": "search_products" | "calculate_delivery" | "save_order" | null }
                Set should_call_tool: true ONLY if the reasoning explicitly says it will call the tool.`
              },
              { role: 'user', content: firstPassReasoning }
            ]
          });

          const intent = JSON.parse(intentCheck.choices[0].message.content || '{}');
          
          if (intent.should_call_tool && intent.tool_name) {
            console.log(`🛡️ [LAZY DETECTOR] AI intended to call ${intent.tool_name} but skipped. Forcing retry...`);
            lazyRetries++;
            
            // Force the specific tool call in the next completion
            const retryCompletion = await openai.chat.completions.create({
              model: 'gpt-4o-mini',
              messages: messages.slice(0, -1), // Remove the lazy response
              tools: tools,
              tool_choice: { type: 'function', function: { name: intent.tool_name } },
              temperature: 0.1, // Low temperature for precision
            });

            // Log usage for retry
            if (retryCompletion.usage) {
              logApiUsage({
                workspaceId: input.workspaceId,
                conversationId: input.conversationId,
                model: 'gpt-4o-mini',
                featureName: 'agent_response', // Still part of response generation
                usage: {
                  promptTokens: retryCompletion.usage.prompt_tokens,
                  completionTokens: retryCompletion.usage.completion_tokens,
                  totalTokens: retryCompletion.usage.total_tokens,
                  cachedPromptTokens: (retryCompletion.usage as any).prompt_tokens_details?.cached_tokens,
                }
              });
            }

            const retryMessage = retryCompletion.choices[0].message;
            if (retryMessage.tool_calls && retryMessage.tool_calls.length > 0) {
              console.log(`✅ [LAZY DETECTOR] Retry successful. Tool call captured.`);
              // Replace the lazy response with the forced tool call in history
              messages.pop(); 
              messages.push(retryMessage);
              
              // CRITICAL FIX: Overwrite responseMessage so the loop proceeds to execute the tools
              responseMessage = retryMessage;
            } else {
              finalResponse = (responseMessage.content || '').trim();
              break;
            }
          } else {
            finalResponse = (responseMessage.content || '').trim();
            break;
          }
        } else {
          finalResponse = (responseMessage.content || '').trim();
          break;
        }
    }

    toolLoops++;

    for (const toolCall of responseMessage.tool_calls) {
      if (toolCall.type !== 'function') continue;
      const toolName = toolCall.function.name as AgentToolName;
      const fnArgs = JSON.parse(toolCall.function.arguments);
      
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
          if ((result as any).autoResponse) {
            finalResponse = (result as any).autoResponse;
            toolLoops = MAX_TOOL_LOOPS;
          }
        }

        if (sideEffects?.shouldTriggerQuickForm) {
          shouldTriggerQuickForm = true;
        }

        if (sideEffects?.shouldFlag) {
          flaggedForManual = true;
          if (sideEffects.flagReason) flagReason = sideEffects.flagReason;
        }

        if (sideEffects?.updatedContext) {
          Object.assign(input.context, sideEffects.updatedContext);
        }

        messages.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify(result) });
      } catch (error: any) {
        messages.push({ role: 'tool', tool_call_id: toolCall.id, content: JSON.stringify({ success: false, error: "Internal tool error." }) });
      }
    }
  }

  // --- AI BRAIN REPORT GENERATION ---
  console.log(`\n══════════════════════════════════════════════════════════════════════════════`);
  console.log(`🧠 AI BRAIN REPORT`);
  console.log(`[1] CUSTOMER MESSAGE: "${input.messageText}"`);
  console.log(`[2] REASONING: ${firstPassReasoning}`);
  console.log(`[3] TOOLS CALLED: ${toolsCalledLog.join(', ') || 'None'}`);
  console.log(`[4] RESPONSE: "${finalResponse}"`);
  console.log(`══════════════════════════════════════════════════════════════════════════════\n`);

  // --- FINAL RESPONSE CLEANUP ---
  // If the AI sent literal quotation marks as its response, strip them.
  let cleanedResponse = finalResponse.trim();
  if (cleanedResponse === '""' || cleanedResponse === "''" || cleanedResponse === '""' || cleanedResponse === '""') {
    cleanedResponse = '';
  }

  return {
    response: cleanedResponse,
    shouldFlag: shouldFlag || flaggedForManual,
    flagReason: flagReason || undefined,
    toolsCalled: toolsCalledLog,
    toolCallsMade: toolLoops,
    shouldTriggerQuickForm,
  };
}
