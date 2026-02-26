/**
 * Orchestrator - Phase 3: Main Message Processing Controller
 * 
 * The Orchestrator is the central controller that coordinates all message processing.
 * It ties together the Fast Lane, AI Director, and execution logic into a cohesive system.
 * 
 * Flow:
 * 1. Load conversation context and history
 * 2. Handle image attachments (special case)
 * 3. Try Fast Lane (pattern matching)
 * 4. Fall back to AI Director (AI decision)
 * 5. Execute the decision
 * 6. Save state and send response
 */

import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';
import { 
  ConversationContext, 
  ConversationState, 
  migrateLegacyContext,
  PendingImage,
  addPendingImage,
  MAX_PENDING_IMAGES,
} from '@/types/conversation';
import { tryFastLane } from './fast-lane';
import aiDirector, { AIDirectorDecision } from './ai-director';
import { 
  validateAIDecision, 
  hasLowConfidence, 
  createClarificationDecision, 
  createValidationErrorDecision 
} from './action-validator';
import { sendMessage } from '@/lib/facebook/messenger';
import { generateOrderNumber } from './replies';
import { getCachedSettings, WorkspaceSettings, getDeliveryCharge } from '@/lib/workspace/settings-cache';
import { AgentTools, ToolResult } from './agent-tools';
import { getContextManager } from './context-manager';
import { checkKnowledgeBoundary, getManualFlagResponse } from './knowledge-check';

// ============================================
// DEEP CONTEXT MERGE HELPER
// ============================================

/**
 * Deep-merges conversation context updates into the base context.
 * 
 * CRITICAL: This replaces the naive `{ ...base, ...updates }` spread
 * which was causing 'The Amnesia' bug — shallow spreading would replace
 * entire nested objects (checkout, metadata), losing fields like
 * customerName, customerPhone, and negotiation state between turns.
 */
function deepMergeContext(
  base: ConversationContext,
  updates: Partial<ConversationContext>
): ConversationContext {
  return {
    ...base,
    ...updates,
    // Deep merge checkout — preserve name/phone/address across turns
    checkout: {
      ...(base.checkout || {}),
      ...(updates.checkout || {}),
    },
    // Deep merge metadata — preserve negotiation state
    metadata: {
      ...(base.metadata || {}),
      ...(updates.metadata || {}),
      // Specifically preserve negotiation unless explicitly overwritten
      negotiation: (updates.metadata?.negotiation !== undefined)
        ? updates.metadata.negotiation
        : base.metadata?.negotiation,
    },
    // Preserve cart unless explicitly updated
    cart: updates.cart !== undefined ? updates.cart : base.cart,
  };
}

// ============================================
// TYPES
// ============================================

export interface ProcessMessageInput {
  /** Facebook Page ID */
  pageId: string;
  
  /** Customer PSID (Page-Scoped ID) */
  customerPsid: string;
  
  /** Message text (optional) */
  messageText?: string;
  
  /** Image URL (optional) */
  imageUrl?: string;
  
  /** Workspace ID */
  workspaceId: string;
  
  /** Facebook Page database ID */
  fbPageId: number;
  
  /** Conversation ID */
  conversationId: string;
  
  /** Test mode - skips Facebook API calls (optional) */
  isTestMode?: boolean;
}

export interface ProcessMessageResult {
  /** Response sent to user */
  response: string;
  
  /** New conversation state */
  newState: ConversationState;
  
  /** Updated context */
  updatedContext: ConversationContext;
  
  /** Whether an order was created */
  orderCreated?: boolean;
  
  /** Order number (if created) */
  orderNumber?: string;

  /** Product card data (for test bot) */
  productCard?: any;
}

// ============================================
// MAIN ORCHESTRATOR FUNCTION
// ============================================

/**
 * Main message processing orchestrator
 * 
 * This is the single entry point for all message processing.
 * The webhook should call this function for every incoming message.
 */
export async function processMessage(input: ProcessMessageInput): Promise<ProcessMessageResult> {
  const startTime = Date.now();
  
  console.log('\n🎭 ORCHESTRATOR STARTED');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Customer: ${input.customerPsid}`);
  console.log(`Message: "${input.messageText || '(image)'}"`);
  console.log(`Has Image: ${!!input.imageUrl}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  try {
    // ========================================
    // STEP 1: LOAD CONVERSATION DATA
    // ========================================
    
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
    
    // Load workspace settings (with caching)
    const settings = await getCachedSettings(input.workspaceId);
    console.log(`⚙️ Loaded settings for: ${settings.businessName}`);
    
    // Load conversation
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', input.conversationId)
      .single();
    
    if (convError || !conversation) {
      throw new Error(`Failed to load conversation: ${convError?.message}`);
    }
    
    // Initialize default context if null
    let currentContext = conversation.context || {
      state: conversation.current_state || 'IDLE',
      cart: [],
      checkout: {},
      metadata: { lastImageUrl: null, messageCount: 0 },
    };
    
    console.log('📥 [DB DEBUG] Loaded Context Metadata:', JSON.stringify(currentContext.metadata, null, 2));

    // Migrate legacy context if needed
    if (!currentContext.cart || !currentContext.checkout || !currentContext.metadata) {
      console.log('🔄 Migrating legacy context...');
      currentContext = migrateLegacyContext(currentContext);
    }
    
    const currentState = conversation.current_state as ConversationState || 'IDLE';
    
    console.log(`📊 Current State: ${currentState}`);
    console.log(`📊 Cart Items: ${currentContext.cart.length}`);
    
    // Load recent conversation history (last 10 messages)
    const { data: recentMessages } = await supabase
      .from('messages')
      .select('sender, message_text, created_at')
      .eq('conversation_id', input.conversationId)
      .order('created_at', { ascending: false })
      .limit(10);
    
    const conversationHistory = (recentMessages || [])
      .reverse()
      .map((msg: any) => ({
        sender: msg.sender as 'customer' | 'bot',
        message: msg.message_text || '',
        timestamp: msg.created_at || '',
      }));
    
    // ========================================
    // STEP 2: HANDLE IMAGE ATTACHMENTS (SPECIAL CASE)
    // ========================================
    
    if (input.imageUrl) {
      console.log('🖼️ Image detected - calling image recognition...');
      
      const imageDecision = await handleImageMessage(
        input.imageUrl,
        currentState,
        currentContext,
        input.workspaceId,
        input.messageText
      );
      
      return await executeDecision(
        imageDecision,
        input,
        conversation,
        supabase,
        settings
      );
    }
    
    // ========================================
    // STEP 3: STATE-FIRST FAST LANE (for data-collection states)
    // ========================================
    // Data-collection states (AWAITING_CUSTOMER_DETAILS, COLLECTING_NAME, etc.)
    // MUST go through Fast Lane first because it's state-aware and handles:
    // - Quick Form multi-field parsing
    // - Phone/address validation
    // - Multi-variation collection
    // Without this, the intent classifier sees "Zayed Bin Hamid" and routes to
    // PROVIDE_NAME handler (conversational), ignoring the Quick Form state.
    
    const STATE_DRIVEN_STATES: ConversationState[] = [
      'AWAITING_CUSTOMER_DETAILS',
      'COLLECTING_MULTI_VARIATIONS',
      'COLLECTING_NAME',
      'COLLECTING_PHONE',
      'COLLECTING_ADDRESS',
      'CONFIRMING_ORDER',
      'CONFIRMING_PRODUCT',
      'SELECTING_CART_ITEMS',
      'COLLECTING_PAYMENT_DIGITS',
    ];
    
    if (input.messageText && STATE_DRIVEN_STATES.includes(currentState)) {
      console.log(`⚡ State-driven routing: ${currentState} → trying Fast Lane first...`);
      
      const fastLaneResult = tryFastLane(
        input.messageText,
        currentState,
        currentContext,
        settings
      );
      
      if (fastLaneResult.matched) {
        console.log(`✅ Fast Lane matched in state ${currentState}: action=${fastLaneResult.action}`);
        
        let orderNumber: string | undefined;
        
        // Handle order creation from Fast Lane
        if (fastLaneResult.action === 'CREATE_ORDER') {
          console.log('📦 Creating order from Fast Lane...');
          if (input.isTestMode) {
            const timestamp = Date.now().toString().slice(-4);
            orderNumber = `TEST-${timestamp}`;
          } else {
            const mergedForOrder = deepMergeContext(currentContext, fastLaneResult.updatedContext || {});
            orderNumber = await createOrderInDb(
              supabase,
              input.workspaceId,
              input.fbPageId,
              input.conversationId,
              mergedForOrder
            );
          }
        }
        
        // Send response
        if (fastLaneResult.response && !input.isTestMode) {
          const { sendMessage } = await import('@/lib/facebook/messenger');
          await sendMessage(input.pageId, input.customerPsid, fastLaneResult.response);
          
          await supabase.from('messages').insert({
            conversation_id: input.conversationId,
            sender: 'bot',
            sender_type: 'bot',
            message_text: fastLaneResult.response,
            message_type: 'text',
          });
        }
        
        // Save state (deep merge to preserve negotiation + checkout data)
        const contextToSave = deepMergeContext(currentContext, fastLaneResult.updatedContext || {});
        
        await supabase
          .from('conversations')
          .update({
            current_state: fastLaneResult.newState || currentState,
            context: contextToSave,
          } as any)
          .eq('id', input.conversationId);
        
        console.log(`💾 Fast Lane state saved: ${fastLaneResult.newState}`);
        
        return {
          response: fastLaneResult.response || '',
          newState: fastLaneResult.newState || currentState,
          updatedContext: contextToSave,
          orderCreated: fastLaneResult.action === 'CREATE_ORDER',
          orderNumber,
        };
      }
      
      console.log(`⚠️ Fast Lane didn't match in state ${currentState} — checking fallback...`);
      
      // ========================================
      // SMART FALLBACK: Quick Form data sent in wrong state
      // ========================================
      // Sometimes the previous request's state save fails silently
      // (e.g., saved AWAITING_CUSTOMER_DETAILS but next request loads CONFIRMING_PRODUCT).
      // Detect multi-line form data and redirect to handleAwaitingCustomerDetails.
      
      const isQuickFormMode = settings?.order_collection_style === 'quick_form';
      const hasMultipleLines = input.messageText.includes('\n') && input.messageText.split('\n').length >= 3;
      const hasPhonePattern = /01[3-9]\d{8}/.test(input.messageText);
      const hasCartItems = currentContext.cart && currentContext.cart.length > 0;
      
      if (isQuickFormMode && hasMultipleLines && hasPhonePattern && hasCartItems) {
        console.log('🔄 [SMART FALLBACK] Multi-line form data detected in wrong state → treating as AWAITING_CUSTOMER_DETAILS');
        
        const fallbackResult = tryFastLane(
          input.messageText,
          'AWAITING_CUSTOMER_DETAILS' as ConversationState,
          { ...currentContext, state: 'AWAITING_CUSTOMER_DETAILS' },
          settings
        );
        
        if (fallbackResult.matched) {
          console.log('✅ [SMART FALLBACK] Form data parsed successfully!');
          
          let orderNumber: string | undefined;
          
          if (fallbackResult.action === 'CREATE_ORDER') {
            if (input.isTestMode) {
              orderNumber = `TEST-${Date.now().toString().slice(-4)}`;
            } else {
              const mergedForOrder = deepMergeContext(currentContext, fallbackResult.updatedContext || {});
              orderNumber = await createOrderInDb(supabase, input.workspaceId, input.fbPageId, input.conversationId, mergedForOrder);
            }
          }
          
          if (fallbackResult.response && !input.isTestMode) {
            const { sendMessage } = await import('@/lib/facebook/messenger');
            await sendMessage(input.pageId, input.customerPsid, fallbackResult.response);
            await supabase.from('messages').insert({
              conversation_id: input.conversationId,
              sender: 'bot', sender_type: 'bot',
              message_text: fallbackResult.response, message_type: 'text',
            });
          }
          
          const contextToSave = deepMergeContext(currentContext, fallbackResult.updatedContext || {});
          const { error: saveErr } = await supabase.from('conversations').update({
            current_state: fallbackResult.newState || 'AWAITING_CUSTOMER_DETAILS',
            context: contextToSave,
          } as any).eq('id', input.conversationId);
          if (saveErr) console.error('❌ [SMART FALLBACK] DB save error:', saveErr);
          
          return {
            response: fallbackResult.response || '',
            newState: fallbackResult.newState || 'AWAITING_CUSTOMER_DETAILS',
            updatedContext: contextToSave,
            orderCreated: fallbackResult.action === 'CREATE_ORDER',
            orderNumber,
          };
        }
      }
    }
    
    // ========================================
    // STEP 4: INTENT-FIRST PROCESSING (for non-state-driven messages)
    // ========================================
    // Handles greetings, negotiations, queries, etc. where content matters more than state
    
    if (input.messageText) {
      console.log('🧠 Starting Intent-First Processing...');
      const { processWithIntent } = await import('./intent');
      
      const intentResult = await processWithIntent(
        input.messageText,
        currentContext,
        settings,
        conversationHistory
      );
      
      if (intentResult.handled) {
        console.log(`✅ Intent Handled: ${intentResult.intent.intent}`);
        
        let orderNumber: string | undefined;
        
        // Handle Move to Manual (Flag) from Handler
        if (intentResult.flagManual) {
           console.log(`🚩 Handler flagged for manual: ${intentResult.flagReason}`);
           // Fall through to AI Director or Flag logic below? 
           // Better to handle it here if it's an explicit flag
           await flagForManualResponse(supabase, input.conversationId, intentResult.flagReason || 'Flagged by intent handler');
           // Continue to send response if any
        }
        
        // Handle Order Creation
        if (intentResult.createOrder) {
          console.log('📦 Creating order from intent handler...');
          if (input.isTestMode) {
             const timestamp = Date.now().toString().slice(-4);
             orderNumber = `TEST-${timestamp}`;
          } else {
             orderNumber = await createOrderInDb(
               supabase,
               input.workspaceId,
               input.fbPageId,
               input.conversationId,
               { ...currentContext, ...intentResult.updatedContext }
             );
          }
        }
        
        // Send response to user (if not in test mode)
        if (intentResult.response && !input.isTestMode) {
          const { sendMessage } = await import('@/lib/facebook/messenger');
          await sendMessage(input.pageId, input.customerPsid, intentResult.response);
          
          // Log bot message
          await supabase.from('messages').insert({
            conversation_id: input.conversationId,
            sender: 'bot',
            sender_type: 'bot',
            message_text: intentResult.response,
            message_type: 'text',
          });
        }

        // SAVE STATE AND CONTEXT TO DB (DEEP MERGE — fixes The Amnesia bug)
        const contextToSave = deepMergeContext(currentContext, intentResult.updatedContext);
        console.log('📝 [DB SAVE] State:', intentResult.newState, '| Context keys:', Object.keys(contextToSave).join(','));

        const { error: dbSaveError } = await supabase
          .from('conversations')
          .update({
            current_state: intentResult.newState,
            context: contextToSave,
          } as any)
          .eq('id', input.conversationId);
        
        if (dbSaveError) {
          console.error('❌ [DB SAVE ERROR] Failed to save state!', dbSaveError);
        } else {
          console.log(`💾 State saved: ${intentResult.newState}`);
        }
        
        return {
          response: intentResult.response,
          newState: intentResult.newState,
          updatedContext: contextToSave, // Return full merged context to be safe
          orderCreated: intentResult.createOrder,
          orderNumber
        };
      }
      
      console.log('⚠️ Intent not handled - falling back to Full AI Director...');
    }
    
    // ========================================
    // STEP 4: FALLBACK TO FULL AI DIRECTOR (COMPLEX CASES)
    // ========================================
    
    if (input.messageText) {
      console.log('🧠 Calling AI Director...');
      
      // Get context manager and save checkpoint
      const contextManager = getContextManager();
      contextManager.saveCheckpoint(currentContext, 'Before AI Director call');
      
      // ========================================
      // STEP 4a: KNOWLEDGE PRE-CHECK (COST OPTIMIZATION)
      // ========================================
      // Check if we even have the knowledge to answer this question
      // If not, skip AI Director entirely and flag for manual response
      
      const knowledgeCheck = checkKnowledgeBoundary(input.messageText, settings);
      
      if (knowledgeCheck.shouldFlag) {
        console.log(`⚠️ Knowledge boundary reached: ${knowledgeCheck.flagReason}`);
        console.log('📥 Flagging for manual response (skipping AI call to save cost)');
        
        // Flag conversation for manual response
        await flagForManualResponse(
          supabase,
          input.conversationId,
          knowledgeCheck.flagReason || 'Unknown question'
        );
        
        const manualFlagResponse = getManualFlagResponse();
        
        // Send response to user (skip in test mode)
        if (!input.isTestMode) {
          await sendMessage(input.pageId, input.customerPsid, manualFlagResponse);
        }
        
        // Log bot message
        await supabase.from('messages').insert({
          conversation_id: input.conversationId,
          sender: 'bot',
          sender_type: 'bot',
          message_text: manualFlagResponse,
          message_type: 'text',
          created_at: new Date().toISOString(),
        });
        
        return {
          response: manualFlagResponse,
          newState: currentState,
          updatedContext: currentContext
        };
      }
      
      try {
        let decision: AIDirectorDecision | null = null;
        let finalDecision: AIDirectorDecision | null = null;
        const maxTurns = 3;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const historyForAI: any[] = [...conversationHistory];
        
        // Agent Loop for Tool Usage (Phase 3)
        for (let turn = 0; turn < maxTurns; turn++) {
          console.log(`🧠 AI Director Turn ${turn + 1}/${maxTurns}`);
          
          decision = await aiDirector({
            userMessage: input.messageText,
            currentState,
            currentContext,
            workspaceId: input.workspaceId,
            settings,
            conversationHistory: historyForAI,
          });
          
          // Handle Tool Calls
          if (decision.action === 'CALL_TOOL') {
            console.log(`🛠️ AI Requesting Tool: ${decision.actionData?.toolName}`);
            const toolName = decision.actionData?.toolName;
            const toolArgs = decision.actionData?.toolArgs;
            
            let toolResult: ToolResult = { 
              toolName: toolName || 'unknown', 
              success: false, 
              result: null, 
              message: 'Tool execution failed' 
            };
            
            // Execute Tool
            if (toolName === 'checkStock' && toolArgs?.searchQuery) {
              toolResult = await AgentTools.checkStock(input.workspaceId, toolArgs.searchQuery);
            } else if (toolName === 'trackOrder' && toolArgs?.phone) {
              toolResult = await AgentTools.trackOrder(input.workspaceId, toolArgs.phone);
            } else if (toolName === 'calculateDelivery' && toolArgs?.address) {
              toolResult = await AgentTools.calculateDelivery(toolArgs.address, settings);
            } else {
              toolResult = {
                toolName: toolName || 'unknown',
                success: false,
                result: null,
                message: `Unknown tool or missing args: ${toolName}`
              };
            }
            
            console.log(`✅ Tool Result: ${toolResult.message}`);
            
            // Append tool result to history for next turn
            // We simulate this by adding a "bot" message with system prefix
            historyForAI.push({
              sender: 'bot',
              message: `[SYSTEM TOOL RESULT] (${toolName}): ${toolResult.message}`,
              timestamp: new Date().toISOString()
            });
            
            // Continue to next turn (AI will see tool result and decide next step)
            continue;
          }
          
          // If not a tool call, this is the final decision
          finalDecision = decision;
          break;
        }
        
        // Use final decision (or fallback if loop exhausted)
        decision = finalDecision || decision!; // Should have a decision from last turn
        
        // ========================================
        // STEP 4a: CONFIDENCE CHECK
        // ========================================
        // IMPORTANT: Skip confidence check for FLAG_MANUAL - low confidence is intentional
        // when AI explicitly decides it doesn't have the knowledge to answer
        
        if (decision.action === 'FLAG_MANUAL') {
          console.log(`🚩 AI Director returned FLAG_MANUAL - skipping confidence check`);
          // FLAG_MANUAL is intentionally low confidence - don't override it
        } else if (hasLowConfidence(decision)) {
          console.log(`⚠️ Low confidence (${decision.confidence}%) - asking for clarification`);
          decision = createClarificationDecision(decision, currentState);
        } else {
          // ========================================
          // STEP 4b: VALIDATION CHECK
          // ========================================
          
          const validation = await validateAIDecision(
            decision,
            currentContext,
            input.workspaceId
          );
          
          if (!validation.valid) {
            console.log(`❌ Validation failed: ${validation.error}`);
            decision = createValidationErrorDecision(validation, currentState);
          }
        }
        
        return await executeDecision(
          decision,
          input,
          conversation,
          supabase,
          settings
        );
      } catch (error) {
        console.error('❌ AI Director failed:', error);
        
        // Silently flag for manual response — don't send error message to customer
        try {
          await flagForManualResponse(
            supabase,
            conversation.id,
            `AI Director error: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        } catch (flagError) {
          console.error('⚠️ Failed to flag conversation:', flagError);
        }
        
        console.log('🚩 Conversation flagged for manual reply (no message sent to customer)');
        return {
          response: '',
          newState: currentState,
          updatedContext: currentContext
        };
      }
    }
    
    // ========================================
    // FALLBACK: NO TEXT AND NO IMAGE
    // ========================================
    
    console.log('⚠️ No text or image - sending help message');
    
    const fallbackDecision: AIDirectorDecision = {
      action: 'SHOW_HELP',
      response: '👋 Hi! Send me a product image or tell me what you\'re looking for!',
      confidence: 100,
    };
    
    return await executeDecision(
      fallbackDecision,
      input,
      conversation,
      supabase,
      settings
    );
    
  } catch (error) {
    console.error('❌ Orchestrator error:', error);
    
    // Attempt context rollback
    try {
      const contextManager = getContextManager();
      const rolledBackContext = contextManager.rollback();
      if (rolledBackContext) {
        console.log('⏪ Context rolled back to previous checkpoint');
      }
    } catch (rollbackError) {
      console.error('⚠️ Rollback failed:', rollbackError);
    }
    
    // Silently flag for manual response — don't send error message to customer
    try {
      const flagSupabase = createClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );
      await flagSupabase.from('conversations').update({
        needs_manual_response: true,
        manual_flag_reason: `Orchestrator error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        manual_flagged_at: new Date().toISOString(),
      }).eq('id', input.conversationId);
      console.log('🚩 Conversation flagged for manual reply (no message sent to customer)');
    } catch (flagError) {
      console.error('⚠️ Failed to flag conversation:', flagError);
    }
    
    throw error;
  } finally {
    const duration = Date.now() - startTime;
    console.log(`\n⏱️ Orchestrator completed in ${duration}ms\n`);
  }
}

// ============================================
// DECISION EXECUTION
// ============================================

/**
 * Executes an AI Director decision
 * 
 * This function handles all 9 action types and performs the necessary
 * database operations and API calls.
 */
async function executeDecision(
  decision: AIDirectorDecision,
  input: ProcessMessageInput,
  conversation: any,
  supabase: any,
  settings: WorkspaceSettings
): Promise<ProcessMessageResult> {
  console.log(`\n🎬 EXECUTING DECISION: ${decision.action}`);
  console.log(`Confidence: ${decision.confidence}%`);
  if (decision.reasoning) {
    console.log(`Reasoning: ${decision.reasoning}`);
  }
  
  let response = decision.response;
  let newState = decision.newState || conversation.current_state;
  let updatedContext = deepMergeContext(conversation.context || {}, decision.updatedContext || {});
  let orderCreated = false;
  let orderNumber: string | undefined;
  let productCard: any = undefined;
  
  // ========================================
  // QUICK FORM OVERRIDE
  // ========================================
  // When the AI Director decides to start collecting customer info
  // (COLLECTING_NAME), it doesn't know about the workspace's
  // order_collection_style setting. If 'quick_form' is configured,
  // we override to AWAITING_CUSTOMER_DETAILS so the Fast Lane's
  // multi-field parser handles the response, not the single-field
  // conversational flow handler.
  
  if (newState === 'COLLECTING_NAME' && settings?.order_collection_style === 'quick_form') {
    console.log('⚡ [QUICK_FORM OVERRIDE] AI set COLLECTING_NAME but quick_form is configured → AWAITING_CUSTOMER_DETAILS');
    newState = 'AWAITING_CUSTOMER_DETAILS';
    
    // Generate proper quick form prompt with product variations
    const product = updatedContext.cart?.[0] as any;
    const availableSizes = product?.sizes || [];
    const availableColors = product?.colors || [];
    const hasSize = availableSizes.length > 0;
    const hasColor = availableColors.length > 1;
    
    let quickFormPrompt = settings.quick_form_prompt || 
      'দারুণ! অর্ডারটি সম্পন্ন করতে, অনুগ্রহ করে নিচের ফর্ম্যাট অনুযায়ী আপনার তথ্য দিন:\n\nনাম:\nফোন:\nসম্পূর্ণ ঠিকানা:';
    
    if (hasSize) quickFormPrompt += `\nসাইজ: (${availableSizes.join('/')})`;
    if (hasColor) quickFormPrompt += `\nকালার: (${availableColors.join('/')})`;
    quickFormPrompt += '\nপরিমাণ: (1 হলে লিখতে হবে না)';
    
    response = quickFormPrompt;
    updatedContext = { ...updatedContext, state: 'AWAITING_CUSTOMER_DETAILS' };
  }
  
  // Execute action
  switch (decision.action) {
    case 'SEND_RESPONSE':
      // Just send the response (no state change)
      console.log('📤 Sending response...');
      break;
    
    case 'TRANSITION_STATE':
      // Change state
      console.log(`🔄 Transitioning state: ${conversation.current_state} → ${newState}`);
      break;
    
    case 'ADD_TO_CART':
      // Add product to cart
      console.log('🛒 Adding to cart...');
      if (decision.actionData?.productId) {
        const { addToCart } = await import('@/types/conversation');
        updatedContext.cart = addToCart(updatedContext.cart || [], {
          productId: decision.actionData.productId,
          productName: decision.actionData.productName || 'Product',
          productPrice: decision.actionData.productPrice || 0,
          quantity: decision.actionData.quantity || 1,
        });
      }
      break;
    
    case 'REMOVE_FROM_CART':
      // Remove product from cart
      console.log('🗑️ Removing from cart...');
      if (decision.actionData?.productId) {
        const { removeFromCart } = await import('@/types/conversation');
        updatedContext.cart = removeFromCart(
          updatedContext.cart || [],
          decision.actionData.productId
        );
      }
      break;
    
    case 'UPDATE_CHECKOUT':
      // Update checkout information
      console.log('📝 Updating checkout info...');
      if (decision.actionData) {
        // Calculate delivery charge based on address and settings
        let deliveryCharge = decision.actionData.deliveryCharge;
        if (decision.actionData.customerAddress) {
          deliveryCharge = getDeliveryCharge(decision.actionData.customerAddress, settings);
          console.log(`📦 Calculated delivery charge: ৳${deliveryCharge}`);
        }
        
        updatedContext.checkout = {
          ...updatedContext.checkout,
          customerName: decision.actionData.customerName || updatedContext.checkout?.customerName,
          customerPhone: decision.actionData.customerPhone || updatedContext.checkout?.customerPhone,
          customerAddress: decision.actionData.customerAddress || updatedContext.checkout?.customerAddress,
          deliveryCharge: deliveryCharge || updatedContext.checkout?.deliveryCharge,
          totalAmount: decision.actionData.totalAmount || updatedContext.checkout?.totalAmount,
        };
      }
      break;
    
    case 'CREATE_ORDER':
      // Create order in database
      console.log('📦 Creating order...');
      
      if (input.isTestMode) {
        console.log('🧪 Test mode: Skipping DB insert for order');
        // Generate fake order number for simulation
        const timestamp = Date.now().toString().slice(-4);
        const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        orderNumber = `TEST-${timestamp}${random}`;
      } else {
        orderNumber = await createOrderInDb(
          supabase,
          input.workspaceId,
          input.fbPageId,
          input.conversationId,
          updatedContext
        );
      }
      
      orderCreated = true;
      
      // Replace PENDING with actual order number in response
      response = response.replace('PENDING', orderNumber);
      
      // Reset cart and checkout after order
      updatedContext.cart = [];
      updatedContext.checkout = {};
      newState = 'IDLE';
      break;
    
    case 'SEARCH_PRODUCTS':
      // Search for products and send product cards
      console.log('🔍 Searching products...');
      if (decision.actionData?.searchQuery) {
        const products = await searchProducts(
          decision.actionData.searchQuery,
          input.workspaceId,
          supabase
        );
        
        if (products.length === 0) {
          response = `দুঃখিত! "${decision.actionData.searchQuery}" পাওয়া যায়নি। 😔\n\nঅন্য কিছু খুঁজুন বা পণ্যের ছবি পাঠান!`;
        } else if (products.length === 1) {
          // Single product - send product card
          const product = products[0];
          
          // Skip Facebook API in test mode
          if (!input.isTestMode) {
            const { sendProductCard, sendMessage } = await import('@/lib/facebook/messenger');
            
            try {
              await sendProductCard(
                input.pageId,
                input.customerPsid,
                {
                  id: product.id,
                  name: product.name,
                  price: product.price,
                  imageUrl: product.image_urls?.[0] || '',
                  stock: product.stock_quantity || 0,
                }
              );
              console.log('✅ Product card sent for search result');
              
              // Send clarifying text
              await sendMessage(input.pageId, input.customerPsid, 'এটা কি আপনার পছন্দের পণ্য? 👆');
              response = '';
            } catch (error) {
              console.error('❌ Failed to send product card:', error);
              // Fallback to text
              response = `✅ পাওয়া গেছে: ${product.name}\n💰 মূল্য: ৳${product.price}\n\nঅর্ডার করতে চান? (YES/NO)`;
            }
          } else {
            // Test mode - set product card data
            productCard = {
              id: product.id,
              name: product.name,
              price: product.price,
              imageUrl: product.image_urls?.[0] || '',
              stock: product.stock_quantity || 0,
            };
            response = `✅ পাওয়া গেছে: ${product.name}\n💰 মূল্য: ৳${product.price}\n\nঅর্ডার করতে চান? (YES/NO)`;
          }
          
          // Add to cart and transition to CONFIRMING_PRODUCT
          // IMPORTANT: Reset negotiation metadata — new product = fresh negotiation
          updatedContext.cart = [{
            productId: product.id,
            productName: product.name,
            productPrice: product.price,
            quantity: 1,
            sizes: product.sizes || [],
            colors: product.colors || [],
            // Extra fields for AI Director context
            description: product.description || undefined,
            stock: product.stock_quantity || 0,
            // Pricing Policy for Negotiation
            pricing_policy: product.pricing_policy || { isNegotiable: false },
          } as any];
          updatedContext.metadata = {
            ...updatedContext.metadata,
            negotiation: undefined, // Clear old negotiation from previous product/session
          };
          newState = 'CONFIRMING_PRODUCT';
        } else {
          // Multiple products - send carousel
          console.log(`📎 Found ${products.length} products, sending carousel...`);
          
          // Skip Facebook API in test mode
          if (!input.isTestMode) {
            const { sendProductCarousel, sendMessage } = await import('@/lib/facebook/messenger');
            
            try {
              const carouselProducts = products.slice(0, 5).map(p => ({
                id: p.id,
                name: p.name,
                price: p.price,
                imageUrl: p.image_urls?.[0] || '',
                stock: p.stock_quantity || 0,
              }));
              
              await sendProductCarousel(input.pageId, input.customerPsid, carouselProducts);
              console.log('✅ Product carousel sent');
              
              // Send follow-up text
              await sendMessage(input.pageId, input.customerPsid, `${products.length}টি পণ্য পেয়েছি! 👆 কোনটি পছন্দ করুন। 🛍️`);
              response = '';
            } catch (error) {
              console.error('❌ Failed to send carousel:', error);
              // Fallback to text list
              response = `${products.length}টি পণ্য পাওয়া গেছে:\n\n`;
              products.slice(0, 5).forEach((p, i) => {
                response += `${i + 1}. ${p.name} - ৳${p.price}\n`;
              });
              response += `\nকোন নম্বরটি চান বলুন!`;
            }
          } else {
            // Test mode - return text list
            response = `${products.length}টি পণ্য পাওয়া গেছে:\n\n`;
            products.slice(0, 5).forEach((p: any, i: number) => {
              response += `${i + 1}. ${p.name} - ৳${p.price}\n`;
            });
            response += `\nকোন নম্বরটি চান বলুন!`;
          }
        }
      }
      break;
    
    case 'SHOW_HELP':
      // Show help message
      console.log('❓ Showing help...');
      // Use custom greeting if available
      response = decision.response || settings.greeting || '👋 Hi! I can help you:\n\n🛍️ Find products (send photo or name)\n💰 Check prices\n📦 Place orders\n\nWhat would you like to do?';
      break;
    
    case 'RESET_CONVERSATION':
      // Reset to IDLE
      console.log('🔄 Resetting conversation...');
      newState = 'IDLE';
      updatedContext.cart = [];
      updatedContext.checkout = {};
      break;
    
    case 'FLAG_MANUAL':
      // Flag conversation for manual owner response
      console.log('🚩 Flagging for manual response (AI Director decision)...');
      await flagForManualResponse(
        supabase,
        input.conversationId,
        decision.actionData?.flagReason || 'AI Director flagged - missing information'
      );
      break;
    
    case 'SEND_PRODUCT_CARD':
      // Send product card with image using Facebook Generic Template
      console.log('🖼️ Sending product card...');
      if (decision.actionData?.product) {
        // Store product data for return
        productCard = decision.actionData.product;

        // Skip Facebook API in test mode
        if (!input.isTestMode) {
          const { sendProductCard, sendMessage } = await import('@/lib/facebook/messenger');
          
          try {
            await sendProductCard(
              input.pageId,
              input.customerPsid,
              decision.actionData.product
            );
            console.log('✅ Product card sent successfully');
            
            // Send follow-up text message (for multi-product batching)
            if (decision.response && decision.response.trim()) {
              await sendMessage(input.pageId, input.customerPsid, decision.response);
              console.log('✅ Follow-up message sent');
            }
            
            // Don't send additional text message - we already sent it
            response = '';
          } catch (error) {
            console.error('❌ Failed to send product card:', error);
            // Fallback to text-only message
            response = `✅ Found: ${decision.actionData.product.name}\n💰 Price: ৳${decision.actionData.product.price}\n\nWould you like to order this? (YES/NO)`;
          }
        } else {
          // In test mode, we still want to return the product card data
          // But we can also set a fallback text response just in case the frontend doesn't handle cards yet
          console.log('🧪 Test mode: Returning product card data');
          response = decision.response || `✅ Found: ${decision.actionData.product.name}\n💰 Price: ৳${decision.actionData.product.price}\n\nWould you like to order this? (YES/NO)`;
        }
      }
      break;
    
    case 'EXECUTE_SEQUENCE':
      // Execute multiple actions in sequence (Phase 2)
      console.log('🔄 Executing action sequence...');
      if (decision.sequence && decision.sequence.length > 0) {
        for (let i = 0; i < decision.sequence.length; i++) {
          const step: NonNullable<AIDirectorDecision['sequence']>[number] = decision.sequence[i];
          console.log(`  Step ${i + 1}/${decision.sequence.length}: ${step.action}`);
          
          // Execute each step's action
          switch (step.action) {
            case 'ADD_TO_CART':
              if (step.actionData) {
                const { addToCart } = await import('@/types/conversation');
                const cartIndex = step.actionData.cartIndex;
                const pendingImages = updatedContext.pendingImages || [];
                
                // If cartIndex is provided, use pending image at that index
                if (cartIndex !== undefined && pendingImages[cartIndex]) {
                  const pending = pendingImages[cartIndex];
                  if (pending.recognitionResult.success) {
                    updatedContext.cart = addToCart(updatedContext.cart || [], {
                      productId: pending.recognitionResult.productId || '',
                      productName: pending.recognitionResult.productName || 'Product',
                      productPrice: pending.recognitionResult.productPrice || 0,
                      quantity: step.actionData.quantity || 1,
                      selectedSize: step.actionData.selectedSize,
                      selectedColor: step.actionData.selectedColor,
                      sizes: pending.recognitionResult.sizes,
                      colors: pending.recognitionResult.colors,
                    });
                  }
                } else if (step.actionData.productId) {
                  // Direct product add
                  updatedContext.cart = addToCart(updatedContext.cart || [], {
                    productId: step.actionData.productId,
                    productName: step.actionData.productName || 'Product',
                    productPrice: step.actionData.productPrice || 0,
                    quantity: step.actionData.quantity || 1,
                    selectedSize: step.actionData.selectedSize,
                    selectedColor: step.actionData.selectedColor,
                  });
                }
              }
              break;
            
            case 'UPDATE_CHECKOUT':
              if (step.actionData) {
                // Handle cart item updates (size, color, quantity)
                if (step.actionData.cartIndex !== undefined && updatedContext.cart) {
                  const idx = step.actionData.cartIndex;
                  if (updatedContext.cart[idx]) {
                    if (step.actionData.selectedSize) {
                      updatedContext.cart[idx].selectedSize = step.actionData.selectedSize;
                    }
                    if (step.actionData.selectedColor) {
                      updatedContext.cart[idx].selectedColor = step.actionData.selectedColor;
                    }
                    if (step.actionData.quantity) {
                      updatedContext.cart[idx].quantity = step.actionData.quantity;
                    }
                  }
                }
                
                // Handle checkout info updates
                let deliveryCharge = step.actionData.deliveryCharge;
                if (step.actionData.customerAddress) {
                  deliveryCharge = getDeliveryCharge(step.actionData.customerAddress, settings);
                }
                
                updatedContext.checkout = {
                  ...updatedContext.checkout,
                  customerName: step.actionData.customerName || updatedContext.checkout?.customerName,
                  customerPhone: step.actionData.customerPhone || updatedContext.checkout?.customerPhone,
                  customerAddress: step.actionData.customerAddress || updatedContext.checkout?.customerAddress,
                  deliveryCharge: deliveryCharge || updatedContext.checkout?.deliveryCharge,
                };
              }
              break;
            
            case 'REMOVE_FROM_CART':
              if (step.actionData?.productId) {
                const { removeFromCart } = await import('@/types/conversation');
                updatedContext.cart = removeFromCart(
                  updatedContext.cart || [],
                  step.actionData.productId
                );
              }
              break;
            
            default:
              console.log(`  ⚠️ Sequence step action not implemented: ${step.action}`);
          }
          
          // Apply step's context updates
          if (step.updatedContext) {
            updatedContext = { ...updatedContext, ...step.updatedContext };
          }
          
          // Apply step's new state (last step's state wins)
          if (step.newState) {
            newState = step.newState;
          }
        }
        
        // Clear pending images after processing sequence (if cart items were added)
        if (updatedContext.cart && updatedContext.cart.length > 0) {
          updatedContext.pendingImages = [];
        }
        
        console.log(`✅ Sequence complete. Cart: ${updatedContext.cart?.length || 0} items`);
      }
      break;
    
    default:
      console.warn(`⚠️ Unknown action: ${decision.action}`);
  }
  
  // ========================================
  // SAVE STATE AND SEND RESPONSE
  // ========================================
  
  // Update conversation in database
  await updateContextInDb(
    supabase,
    input.conversationId,
    newState,
    updatedContext
  );
  
  // Send response to user (only if not empty - product cards are sent separately)
  if (response) {
    // Inject payment number if placeholder exists
    // Inject payment details if placeholder exists
    if (response.includes('{{PAYMENT_NUMBER}}') || response.includes('{{PAYMENT_DETAILS}}') || response.includes('{totalAmount}')) {
      const methods = [];
      
      if (settings.paymentMethods?.bkash?.enabled) {
        methods.push(`📱 bKash: ${settings.paymentMethods.bkash.number}`);
      }
      
      if (settings.paymentMethods?.nagad?.enabled) {
        methods.push(`📱 Nagad: ${settings.paymentMethods.nagad.number}`);
      }
      
      if (settings.paymentMethods?.cod?.enabled) {
        methods.push(`🚚 Cash on Delivery Available`);
      }
      
      // Fallback if nothing enabled (shouldn't happen usually)
      if (methods.length === 0) {
        methods.push(`📱 bKash/Nagad: 01915969330`);
      }
      
      const paymentDetails = methods.join('\n');
      
      // Calculate total amount for the placeholder
      const cart = updatedContext?.cart || [];
      const negotiatedPrice = (updatedContext?.metadata as any)?.negotiation?.aiLastOffer;
      const subtotalCalc = cart.reduce((sum: number, item: any) => {
        const effectivePrice = negotiatedPrice || item.productPrice;
        return sum + (effectivePrice * (item.quantity || 1));
      }, 0);
      const deliveryCalc = updatedContext?.checkout?.deliveryCharge || updatedContext?.deliveryCharge || 0;
      const totalAmountCalc = subtotalCalc + deliveryCalc;
      
      // Replace all placeholders
      response = response
        .replace('{{PAYMENT_NUMBER}}', paymentDetails)
        .replace('{{PAYMENT_DETAILS}}', paymentDetails)
        .replace('{totalAmount}', totalAmountCalc.toString())
        .replace('৳{totalAmount}', `৳${totalAmountCalc}`);
    }

    // Skip Facebook API call in test mode
    if (!input.isTestMode) {
      await sendMessage(input.pageId, input.customerPsid, response);
    } else {
      console.log('🧪 Test mode: Skipping Facebook API call');
    }
    
    // Log bot message
    await supabase.from('messages').insert({
      conversation_id: input.conversationId,
      sender: 'bot',
      sender_type: 'bot',
      message_text: response,
      message_type: 'text',
    });
  }
  
  console.log(`✅ Decision executed successfully`);
  
  return {
    response,
    newState,
    updatedContext,
    orderCreated,
    orderNumber,
    productCard,
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Handles image messages by calling image recognition
 * 
 * NEW: Multi-image batching support
 * - Each image is recognized and added to pendingImages queue
 * - User has 5 minutes to send more images
 * - On text message or timeout, bot prompts for batch confirmation
 */
async function handleImageMessage(
  imageUrl: string,
  currentState: ConversationState,
  currentContext: ConversationContext,
  workspaceId: string,
  messageText?: string
): Promise<AIDirectorDecision> {
  try {
    console.log('🖼️ Calling image recognition API...');
    
    // Note: addPendingImage, MAX_PENDING_IMAGES, PendingImage are imported at top of file
    
    // Call image recognition API
    const formData = new FormData();
    formData.append('imageUrl', imageUrl);
    formData.append('workspaceId', workspaceId);
    
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/image-recognition`, {
      method: 'POST',
      body: formData,
    });
    
    const imageRecognitionResult = await response.json();
    
    const now = Date.now();
    const BATCH_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
    
    // Get pending images, but CLEAR them if batch window has expired
    let pendingImages = currentContext.pendingImages || [];
    const lastImageTime = currentContext.lastImageReceivedAt || 0;
    
    // If more than 5 minutes since last image, treat as new batch (clear old pending images)
    if (pendingImages.length > 0 && (now - lastImageTime) > BATCH_WINDOW_MS) {
      console.log('⏰ Batch window expired - clearing old pending images');
      pendingImages = [];
    }
    
    // Create pending image entry
    const newPendingImage: PendingImage = {
      url: imageUrl,
      timestamp: now,
      recognitionResult: {
        success: imageRecognitionResult.success && !!imageRecognitionResult.match,
        productId: imageRecognitionResult.match?.product?.id,
        productName: imageRecognitionResult.match?.product?.name,
        productPrice: imageRecognitionResult.match?.product?.price,
        imageUrl: imageRecognitionResult.match?.product?.image_urls?.[0],
        confidence: imageRecognitionResult.match?.confidence,
        tier: imageRecognitionResult.match?.tier,
        sizes: imageRecognitionResult.match?.product?.sizes,
        colors: imageRecognitionResult.match?.product?.colors,
      },
    };
    
    // Check if product was recognized
    if (!imageRecognitionResult.success || !imageRecognitionResult.match) {
      console.log('❌ Product not found in image');
      
      return {
        action: 'SEND_RESPONSE',
        response: 'Sorry, I couldn\'t recognize this product. 😔\n\nTry:\n📸 Taking a clearer photo\n💬 Telling me the product name\n\nExample: "Red Saree" or "Polo T-shirt"',
        confidence: 100,
        reasoning: 'Image recognition failed',
      };
    }
    
    const product = imageRecognitionResult.match.product;
    console.log(`✅ Product found: ${product.name}`);
    
    // Add to pending images
    const { images: updatedPendingImages, wasLimited } = addPendingImage(pendingImages, newPendingImage);
    
    // Check if this is the first image (start of batch) or additional image
    const isFirstImage = pendingImages.length === 0;
    const imageCount = updatedPendingImages.filter(img => img.recognitionResult.success).length;
    
    // Build response message
    let responseMessage: string;
    
    if (wasLimited) {
      // Already at max images — warm but firm
      responseMessage = `⚠️ ভাইয়া আরো স্ক্রিনশটের জন্য আগে এগুলোর order complete করে ফেলেন!\n\n` +
        `✅ সব নিতে "all" লিখুন\n` +
        `🔢 নির্দিষ্ট গুলো: "1 and 3" লিখুন\n` +
        `❌ বাতিল করতে "cancel" লিখুন`;
    } else if (isFirstImage) {
      // First image — Meem gets excited about the product
      const productName = product.name || 'এই product';
      const description = (product as any).description || '';
      
      // Build a warm, personalized greeting
      let warmGreeting = `ওহ দারুণ choice ভাইয়া! 🔥 ${productName} — এটা এখন অনেক popular!`;
      
      // Add one selling point from description if available
      if (description && description.length > 5) {
        // Take first sentence or first 80 chars of description as selling point
        const sellingPoint = description.split(/[।.!]/)[0].trim().substring(0, 80);
        if (sellingPoint) {
          warmGreeting += `\n✨ ${sellingPoint}`;
        }
      }
      
      warmGreeting += `\n\nনিতে চাইলে "order" লিখুন, size আর color check করে দিই! 😊`;
      warmGreeting += `\n📸 একাধিক product অর্ডার করতে আরো screenshot পাঠান`;
      
      responseMessage = warmGreeting;
    } else {
      // Additional image — warm batch update
      responseMessage = `✅ দারুণ! ${imageCount}টা product সিলেক্ট হয়েছে! 🛍️\n\n` +
        `📸 আরো পাঠাতে পারেন\n\n` +
        `✅ সব নিতে "all" লিখুন\n` +
        `🔢 নির্দিষ্ট গুলো: "1 and 2" লিখুন\n` +
        `❌ বাতিল করতে "cancel" লিখুন`;
    }
    
    // Return decision with SEND_PRODUCT_CARD action (shows Facebook template)
    // The response field contains the follow-up batch prompt text
    
    // CRITICAL: Use different state based on image count
    // - Single image (1): CONFIRMING_PRODUCT (handles YES/NO)
    // - Multiple images (2+): SELECTING_CART_ITEMS (handles "সবগুলো"/"all", numbers)
    const newState = imageCount > 1 ? 'SELECTING_CART_ITEMS' : 'CONFIRMING_PRODUCT';
    
    // CRITICAL FIX: For single image, add product to cart immediately
    // This allows "order"/"yes" to work without needing button click
    const productAny = product as any;
    const cartForSingleImage = imageCount === 1 ? [{
      productId: product.id,
      productName: product.name,
      productPrice: product.price,
      quantity: 1,
      sizes: product.sizes || [],
      colors: product.colors || [],
      stock: product.stock_quantity || 0,
      description: product.description || undefined,
      size_stock: productAny.size_stock || [],
      variant_stock: productAny.variant_stock || [],
      pricing_policy: productAny.pricing_policy || null,
    }] as any[] : currentContext.cart || [];
    
    return {
      action: 'SEND_PRODUCT_CARD',
      response: responseMessage, // Sent after product card
      actionData: {
        product: {
          id: product.id,
          name: product.name,
          price: product.price,
          imageUrl: product.image_urls?.[0] || '',
          stock: product.stock_quantity || 0,
          sizes: product.sizes || [],
          colors: product.colors || [],
        },
      },
      newState: newState,
      updatedContext: {
        ...currentContext,
        state: newState,
        cart: cartForSingleImage, // FIXED: Now cart is populated for single image
        pendingImages: updatedPendingImages,
        lastImageReceivedAt: now,
        metadata: {
          ...currentContext.metadata,
          lastImageUrl: imageUrl,
          lastProductId: product.id,
          negotiation: undefined, // Clear old negotiation — new product = fresh start
        },
      },
      confidence: imageRecognitionResult.match.confidence,
      reasoning: `Product card + ${imageCount > 1 ? 'selection prompt' : 'confirmation prompt'} (${imageCount}/${MAX_PENDING_IMAGES})`,
    };
    
  } catch (error) {
    console.error('❌ Error in handleImageMessage:', error);
    
    // Don't send error message to customer — flag for manual reply instead
    return {
      action: 'SEND_RESPONSE',
      response: '',  // Empty = no message sent to customer
      confidence: 100,
      reasoning: `Image processing error: ${error instanceof Error ? error.message : 'Unknown'}`,
      flagManual: true,
      flagReason: `Image processing error: ${error instanceof Error ? error.message : 'Unknown'}`,
    } as any;
  }
}

/**
 * Creates an order in the database with multiple items
 * - Creates 1 row in orders table (customer info, delivery, total)
 * - Creates N rows in order_items table (one per cart item)
 * - Deducts stock for each item
 */
async function createOrderInDb(
  supabase: any,
  workspaceId: string,
  fbPageId: number,
  conversationId: string,
  context: ConversationContext
): Promise<string> {
  console.log('📦 Creating multi-item order in database...');
  
  const orderNumber = generateOrderNumber();
  const cart = context.cart || [];
  
  if (cart.length === 0) {
    throw new Error('No products in cart');
  }
  
  // Calculate totals using negotiated price if available AND for this product
  const negotiation = (context.metadata as any)?.negotiation;
  const subtotal = cart.reduce((sum, item) => {
    const isForThisProduct = !negotiation?.productId || negotiation.productId === item.productId;
    const effectivePrice = (negotiation?.aiLastOffer && isForThisProduct) ? negotiation.aiLastOffer : item.productPrice;
    return sum + (effectivePrice * item.quantity);
  }, 0);
  const deliveryCharge = context.checkout.deliveryCharge || context.deliveryCharge || 0;
  const totalAmount = subtotal + deliveryCharge;
  
  if (negotiation?.aiLastOffer) {
    console.log(`💰 Using negotiated price: ৳${negotiation.aiLastOffer} (base was ৳${cart[0].productPrice})`);
  }
  
  console.log(`🛒 Cart has ${cart.length} items, subtotal: ৳${subtotal}, total: ৳${totalAmount}`);
  
  // Use first product for legacy compatibility (orders table still has product_id column)
  const firstItem = cart[0];
  
  // Create order row
  const orderData = {
    workspace_id: workspaceId,
    fb_page_id: fbPageId,
    conversation_id: conversationId,
    product_id: firstItem.productId, // Legacy: first product
    customer_name: context.checkout.customerName || context.customerName,
    customer_phone: context.checkout.customerPhone || context.customerPhone,
    customer_address: context.checkout.customerAddress || context.customerAddress,
    product_price: subtotal, // Legacy: now stores subtotal
    delivery_charge: deliveryCharge,
    total_amount: totalAmount,
    order_number: orderNumber,
    status: 'pending',
    payment_status: 'unpaid',
    quantity: cart.reduce((sum, item) => sum + item.quantity, 0), // Total quantity
    product_image_url: firstItem.imageUrl || null,
    product_variations: cart.length > 1 
      ? { multi_product: true, item_count: cart.length }
      : ((firstItem as any).variations || null),
    payment_last_two_digits: context.checkout?.paymentLastTwoDigits || null,
    selected_size: cart.length === 1 ? ((firstItem as any).selectedSize || null) : null,
    selected_color: cart.length === 1 ? ((firstItem as any).selectedColor || null) : null,
  };
  
  // Insert order
  const { data: orderResult, error: orderError } = await supabase
    .from('orders')
    .insert(orderData)
    .select('id')
    .single();
  
  if (orderError) {
    console.error('❌ Error creating order:', orderError);
    throw orderError;
  }
  
  const orderId = orderResult.id;
  console.log(`✅ Order created with ID: ${orderId}`);
  
  // Fetch product images for all cart items
  const productIds = cart.map(item => item.productId);
  const { data: productsWithImages } = await supabase
    .from('products')
    .select('id, image_urls')
    .in('id', productIds);
  
  // Create a map of productId -> imageUrl for quick lookup
  const imageUrlMap: Record<string, string> = {};
  if (productsWithImages) {
    for (const p of productsWithImages) {
      if (p.image_urls && p.image_urls.length > 0) {
        imageUrlMap[p.id] = p.image_urls[0];
      }
    }
  }
  
  // Insert order items with correct product images and negotiated price
  const orderItems = cart.map(item => {
    const itemAny = item as any;
    const isForThisProduct = !negotiation?.productId || negotiation.productId === item.productId;
    const effectivePrice = (negotiation?.aiLastOffer && isForThisProduct) ? negotiation.aiLastOffer : item.productPrice;
    return {
      order_id: orderId,
      product_id: item.productId,
      product_name: item.productName,
      product_price: effectivePrice,
      quantity: item.quantity,
      subtotal: effectivePrice * item.quantity,
      selected_size: itemAny.selectedSize || itemAny.variations?.size || null,
      selected_color: itemAny.selectedColor || itemAny.variations?.color || null,
      product_image_url: imageUrlMap[item.productId] || item.imageUrl || null,
    };
  });
  
  const { error: itemsError } = await supabase
    .from('order_items')
    .insert(orderItems);
  
  if (itemsError) {
    console.error('❌ Error creating order items:', itemsError);
    // Note: Order is already created, but items failed
    // In production, you'd want a transaction rollback here
  } else {
    console.log(`✅ Inserted ${orderItems.length} order items`);
  }
  
  // Deduct stock for each item
  let stockDeductedCount = 0;
  for (const item of cart) {
    try {
      const itemAny = item as any;
      const selectedSize = itemAny.selectedSize || itemAny.variations?.size;
      const orderQuantity = item.quantity || 1;
      
      // Fetch current product data
      const { data: product } = await supabase
        .from('products')
        .select('size_stock, variant_stock, stock_quantity')
        .eq('id', item.productId)
        .single();
      
      if (product) {
        // Priority 1: Variant Stock (Size×Color)
        const selectedColor = itemAny.selectedColor || itemAny.variations?.color;
        
        if (selectedSize && selectedColor && product.variant_stock && Array.isArray(product.variant_stock)) {
          // Deduct from variant-specific stock
          const updatedVariantStock = product.variant_stock.map((vs: any) => {
            if (
              vs.size?.toUpperCase() === selectedSize.toUpperCase() && 
              vs.color?.toLowerCase() === selectedColor.toLowerCase()
            ) {
              return { ...vs, quantity: Math.max(0, (vs.quantity || 0) - orderQuantity) };
            }
            return vs;
          });
          
          // Also update size_stock totals if they exist
          let updatedSizeStock = product.size_stock;
          if (product.size_stock && Array.isArray(product.size_stock)) {
             updatedSizeStock = product.size_stock.map((ss: any) => {
                if (ss.size?.toUpperCase() === selectedSize.toUpperCase()) {
                  // Re-calculate size total from variants
                  const sizeVariants = updatedVariantStock.filter((v: any) => v.size?.toUpperCase() === selectedSize.toUpperCase());
                  const newSizeTotal = sizeVariants.reduce((sum: number, v: any) => sum + (v.quantity || 0), 0);
                  return { ...ss, quantity: newSizeTotal };
                }
                return ss;
             });
          }
          
          const newTotalStock = updatedVariantStock.reduce((sum: number, vs: any) => sum + (vs.quantity || 0), 0);
          
          await supabase
            .from('products')
            .update({ 
              variant_stock: updatedVariantStock,
              size_stock: updatedSizeStock,
              stock_quantity: newTotalStock
            })
            .eq('id', item.productId);
            
          console.log(`📉 Stock deducted for ${item.productName}: ${selectedSize}/${selectedColor} -${orderQuantity}`);
        
        } else if (selectedSize && product.size_stock && Array.isArray(product.size_stock)) {
          // Priority 2: Size Stock (Size only)
          // Deduct from size-specific stock
          // Deduct from total stock
          const newStock = Math.max(0, (product.stock_quantity || 0) - orderQuantity);
          
          await supabase
            .from('products')
            .update({ stock_quantity: newStock })
            .eq('id', item.productId);
          
          console.log(`📉 Stock deducted for ${item.productName}: -${orderQuantity}`);
        }
        stockDeductedCount++;
      }
    } catch (stockError) {
      console.error(`⚠️ Error deducting stock for ${item.productName}:`, stockError);
    }
  }
  
  console.log(`✅ Stock updated for ${stockDeductedCount} products`);
  console.log(`✅ Order created: ${orderNumber}`);
  return orderNumber;
}

/**
 * Updates conversation context in database
 * NOTE: In LIVE mode, Facebook profile fetch often fails due to API restrictions.
 * So we save the customer name from order checkout flow as a fallback.
 */
async function updateContextInDb(
  supabase: any,
  conversationId: string,
  newState: ConversationState,
  updatedContext: ConversationContext
): Promise<void> {
  console.log('💾 Updating conversation context...');
  
  // Build update object
  const updateData: any = {
    current_state: newState,
    context: updatedContext,
    last_message_at: new Date().toISOString(),
  };
  
  // If checkout has customer name, update conversation's customer_name
  // This is the fallback for when Facebook profile fetch fails in LIVE mode
  const checkoutName = updatedContext.checkout?.customerName;
  if (checkoutName && checkoutName.trim().length > 1) {
    console.log(`👤 Updating customer_name from checkout: "${checkoutName}"`);
    updateData.customer_name = checkoutName;
  }
  
  const { error } = await supabase
    .from('conversations')
    .update(updateData)
    .eq('id', conversationId);
  
  if (error) {
    console.error('❌ Error updating context:', error);
    throw error;
  }
  
  console.log('✅ Context updated');
}

/**
 * Searches for products by keywords
 */
async function searchProducts(
  query: string,
  workspaceId: string,
  supabase: any
): Promise<any[]> {
  console.log(`🔍 Searching for: "${query}"`);
  
  const { searchProductsByKeywords } = await import('@/lib/db/products');
  const products = await searchProductsByKeywords(query, workspaceId);
  
  console.log(`✅ Found ${products.length} products`);
  return products;
}

/**
 * Flags a conversation for manual owner response
 * 
 * Called when:
 * 1. Knowledge pre-check detects a question we can't answer
 * 2. AI Director returns FLAG_MANUAL action
 * 
 * @param supabase - Supabase client
 * @param conversationId - ID of the conversation to flag
 * @param reason - Reason for flagging (for owner context)
 */
async function flagForManualResponse(
  supabase: any,
  conversationId: string,
  reason: string
): Promise<void> {
  console.log(`🚩 Flagging conversation ${conversationId} for manual response`);
  console.log(`   Reason: ${reason}`);
  
  const { error } = await supabase
    .from('conversations')
    .update({
      needs_manual_response: true,
      manual_flag_reason: reason,
      manual_flagged_at: new Date().toISOString()
    })
    .eq('id', conversationId);
  
  if (error) {
    console.error('❌ Failed to flag conversation:', error);
  } else {
    console.log('✅ Conversation flagged successfully');
  }
}
