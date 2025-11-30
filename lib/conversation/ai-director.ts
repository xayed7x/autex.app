/**
 * AI Director - Phase 2: Intelligent Decision Engine
 * 
 * The AI Director is the intelligent core of the chatbot that handles
 * complex, natural language queries that the Fast Lane cannot process.
 * 
 * It uses OpenAI GPT-4o-mini to:
 * - Understand user intent
 * - Make routing decisions
 * - Generate contextual responses
 * - Handle edge cases and interruptions
 */

import OpenAI from 'openai';
import { ConversationContext, ConversationState, CartItem } from '@/types/conversation';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/supabase';
import { WorkspaceSettings } from '@/lib/workspace/settings';

// ============================================
// OPENAI CLIENT
// ============================================

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ============================================
// TYPES
// ============================================

/**
 * Input to the AI Director
 */
export interface AIDirectorInput {
  /** User's message text */
  userMessage: string;
  
  /** Current conversation state */
  currentState: ConversationState;
  
  /** Current conversation context */
  currentContext: ConversationContext;
  
  /** Workspace ID (for database queries if needed) */
  workspaceId: string;
  
  /** Workspace settings for customization */
  settings?: WorkspaceSettings;
  
  /** Optional: Image recognition result if user sent an image */
  imageRecognitionResult?: {
    success: boolean;
    match?: {
      product: {
        id: string;
        name: string;
        price: number;
        description?: string;
        image_urls?: string[];
      };
      tier: string;
      confidence: number;
    };
  };
  
  /** Optional: Recent conversation history for context */
  conversationHistory?: Array<{
    sender: 'customer' | 'bot';
    message: string;
    timestamp: string;
  }>;
}

/**
 * Decision made by the AI Director
 */
export interface AIDirectorDecision {
  /** Action to take */
  action: 
    | 'SEND_RESPONSE'           // Send a message to user
    | 'TRANSITION_STATE'        // Change conversation state
    | 'ADD_TO_CART'            // Add product to cart
    | 'REMOVE_FROM_CART'       // Remove product from cart
    | 'UPDATE_CHECKOUT'        // Update checkout information
    | 'CREATE_ORDER'           // Create order
    | 'SEARCH_PRODUCTS'        // Search for products
    | 'SHOW_HELP'              // Show help message
    | 'RESET_CONVERSATION';    // Reset to IDLE
  
  /** Response message to send to user */
  response: string;
  
  /** New state to transition to (if applicable) */
  newState?: ConversationState;
  
  /** Updated context (if applicable) */
  updatedContext?: Partial<ConversationContext>;
  
  /** Additional data for the action */
  actionData?: {
    productId?: string;
    productName?: string;
    productPrice?: number;
    quantity?: number;
    searchQuery?: string;
    customerName?: string;
    customerPhone?: string;
    customerAddress?: string;
    deliveryCharge?: number;
    totalAmount?: number;
  };
  
  /** Confidence score (0-100) */
  confidence: number;
  
  /** Reasoning (for debugging) */
  reasoning?: string;
}

// ============================================
// MAIN AI DIRECTOR FUNCTION
// ============================================

/**
 * The AI Director - makes intelligent decisions about how to handle user messages
 * 
 * @param input - Input containing user message, state, and context
 * @returns Decision about what action to take
 */
export async function aiDirector(input: AIDirectorInput): Promise<AIDirectorDecision> {
  const startTime = Date.now();
  
  try {
    console.log('\n🧠 AI DIRECTOR CALLED');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`User Message: "${input.userMessage}"`);
    console.log(`Current State: ${input.currentState}`);
    console.log(`Cart Items: ${input.currentContext.cart.length}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Build prompts with workspace settings
    const systemPrompt = buildSystemPrompt(input.settings);
    const userPrompt = buildUserPrompt(input);
    
    console.log('📝 Calling OpenAI GPT-4o-mini...');
    
    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 1000,
    });
    
    const responseText = completion.choices[0].message.content || '{}';
    const usage = completion.usage;
    
    console.log('✅ OpenAI response received');
    console.log(`Tokens: ${usage?.total_tokens || 0} (input: ${usage?.prompt_tokens || 0}, output: ${usage?.completion_tokens || 0})`);
    
    // Parse JSON response
    let decision: AIDirectorDecision;
    
    try {
      const parsed = JSON.parse(responseText);
      decision = {
        action: parsed.action || 'SEND_RESPONSE',
        response: parsed.response || 'I apologize, I didn\'t quite understand that. Could you please rephrase?',
        newState: parsed.newState,
        updatedContext: parsed.updatedContext,
        actionData: parsed.actionData,
        confidence: parsed.confidence || 50,
        reasoning: parsed.reasoning,
      };
      
      console.log(`🎯 Decision: ${decision.action} (confidence: ${decision.confidence}%)`);
      if (decision.reasoning) {
        console.log(`💭 Reasoning: ${decision.reasoning}`);
      }
    } catch (parseError) {
      console.error('❌ Failed to parse AI response:', parseError);
      console.error('Raw response:', responseText);
      
      // Fallback decision
      decision = createFallbackDecision(input);
    }
    
    // Calculate cost and log usage
    if (usage) {
      const cost = calculateAICost(usage.prompt_tokens || 0, usage.completion_tokens || 0);
      console.log(`💰 Cost: $${cost.toFixed(6)}`);
      
      // Log to database
      await logAIUsage(input.workspaceId, 'ai_director', cost, usage);
    }
    
    const duration = Date.now() - startTime;
    console.log(`⏱️ AI Director completed in ${duration}ms\n`);
    
    return decision;
    
  } catch (error) {
    console.error('❌ AI Director error:', error);
    
    // Return safe fallback decision
    return createFallbackDecision(input);
  }
}

// ============================================
// PROMPT ENGINEERING
// ============================================

/**
 * Builds the system prompt that defines the AI's role and behavior
 * Now customized based on workspace settings!
 */
function buildSystemPrompt(settings?: WorkspaceSettings): string {
  const businessName = settings?.businessName || 'our store';
  const tone = settings?.tone || 'friendly';
  const bengaliPercent = settings?.bengaliPercent || 80;
  const insideDhakaCharge = settings?.deliveryCharges?.insideDhaka || 60;
  const outsideDhakaCharge = settings?.deliveryCharges?.outsideDhaka || 120;
  const useEmojis = settings?.useEmojis ?? true;
  
  // Tone descriptions
  const toneDescriptions = {
    friendly: 'friendly, warm, and conversational - like talking to a helpful friend',
    professional: 'professional, polite, and formal - like a business representative',
    casual: 'casual, relaxed, and informal - like chatting with a peer'
  };
  
  const toneDescription = toneDescriptions[tone as keyof typeof toneDescriptions] || toneDescriptions.friendly;
  
  return `You are an AI Director for ${businessName}'s conversational e-commerce chatbot. Your role is to make intelligent decisions about how to handle user messages.

**YOUR CAPABILITIES:**
- Understand user intent (questions, confirmations, product searches, etc.)
- Route conversations through different states
- Handle interruptions gracefully
- Manage shopping cart operations
- Collect customer information for orders

**CONVERSATION STATES:**
- IDLE: Waiting for user to start shopping
- CONFIRMING_PRODUCT: User is deciding whether to order a product
- COLLECTING_NAME: Collecting customer's name
- COLLECTING_PHONE: Collecting customer's phone number
- COLLECTING_ADDRESS: Collecting delivery address
- CONFIRMING_ORDER: Final order confirmation

**AVAILABLE ACTIONS:**
- SEND_RESPONSE: Send a message to the user
- TRANSITION_STATE: Change to a different conversation state
- ADD_TO_CART: Add a product to the shopping cart
- REMOVE_FROM_CART: Remove a product from cart
- UPDATE_CHECKOUT: Update customer information
- CREATE_ORDER: Finalize and create the order
- SEARCH_PRODUCTS: Search for products by text query
- SHOW_HELP: Display help information
- RESET_CONVERSATION: Reset to IDLE state

**LANGUAGE POLICY (CRITICAL):**
- Language mix: ${bengaliPercent}% Bengali, ${100 - bengaliPercent}% English
- ${bengaliPercent >= 70 ? 'Your primary language for ALL replies MUST be Bengali (বাংলা).' : bengaliPercent >= 40 ? 'Use a balanced mix of Bengali and English.' : 'You can use more English, but keep some Bengali phrases.'}
- You can and SHOULD use common English/Banglish words that are frequently used in Bengali conversation in Bangladesh (e.g., 'Price', 'Stock', 'Order', 'Delivery', 'Address', 'Confirm', 'Product', 'Phone').
- Your persona is a helpful ${businessName} shop assistant.
- Examples:
  ✅ CORRECT: "দারুণ! 🎉 আপনার সম্পূর্ণ নামটি বলবেন?"
  ✅ CORRECT: "পেয়েছি! 📱 এখন আপনার ডেলিভারি ঠিকানাটি দিন।"
  ✅ CORRECT: "অর্ডারটি কনফার্ম করা হয়েছে! ✅"
  ${bengaliPercent >= 70 ? '❌ WRONG: "Great! What\'s your name?"\n  ❌ WRONG: "Order confirmed!"' : '✅ ACCEPTABLE: "Great! What\'s your name?" (if Bengali % is lower)'}

**TONE & STYLE:**
- Your tone should be ${toneDescription}
- ${useEmojis ? 'Use emojis to make messages engaging and friendly 😊' : 'Avoid using emojis - keep it text-only'}
- Keep responses concise but helpful

**RESPONSE FORMAT:**
You MUST respond with valid JSON in this exact format:
{
  "action": "ACTION_NAME",
  "response": "Message to send to user (follow language and tone guidelines above)",
  "newState": "NEW_STATE" (optional),
  "updatedContext": { ... } (optional),
  "actionData": { ... } (optional),
  "confidence": 85,
  "reasoning": "Brief explanation of your decision"
}

**IMPORTANT GUIDELINES:**
1. Follow the ${toneDescription} tone in all responses
2. ${useEmojis ? 'Use emojis to make messages engaging' : 'Keep responses text-only without emojis'}
3. If user asks a question during checkout, answer it and re-prompt for the needed information
4. Always validate phone numbers (Bangladesh format: 01XXXXXXXXX)
5. Calculate delivery charges: Dhaka ৳${insideDhakaCharge}, Outside Dhaka ৳${outsideDhakaCharge}
6. For product searches, use SEARCH_PRODUCTS action with searchQuery in actionData
7. Keep responses concise but helpful
8. If uncertain, ask clarifying questions

**EXAMPLES:**

Example 1 - Product Search:
User: "Do you have red sarees?"
State: IDLE
Response:
{
  "action": "SEARCH_PRODUCTS",
  "response": "🔍 লাল শাড়ি খুঁজছি...",
  "actionData": { "searchQuery": "red saree" },
  "confidence": 90,
  "reasoning": "User is searching for a specific product"
}

Example 2 - Interruption During Phone Collection:
User: "What's the delivery charge?"
State: COLLECTING_PHONE
Response:
{
  "action": "SEND_RESPONSE",
  "response": "${useEmojis ? '🚚 ' : ''}Delivery charges:\n• ঢাকার মধ্যে: ৳${insideDhakaCharge}\n• ঢাকার বাইরে: ৳${outsideDhakaCharge}\n\nএখন আপনার ফোন নম্বর দিন।${useEmojis ? ' 📱' : ''}",
  "newState": "COLLECTING_PHONE",
  "confidence": 95,
  "reasoning": "User asked about delivery during checkout - answer and re-prompt"
}

Example 3 - Order Confirmation:
User: "Yes, confirm it"
State: CONFIRMING_ORDER
Response:
{
  "action": "CREATE_ORDER",
  "response": "✅ অর্ডারটি কনফার্ম করা হয়েছে! আপনার অর্ডার সফলভাবে সম্পন্ন হয়েছে। শীঘ্রই আমরা আপনার সাথে যোগাযোগ করবো।\n\nআমাদের সাথে কেনাকাটার জন্য ধন্যবাদ! 🎉",
  "newState": "IDLE",
  "updatedContext": {
    "state": "IDLE",
    "cart": [],
    "checkout": {}
  },
  "confidence": 100,
  "reasoning": "User confirmed order - create it and reset conversation"
}`;
}

/**
 * Builds the user prompt with current conversation context
 */
function buildUserPrompt(input: AIDirectorInput): string {
  let prompt = `**CURRENT SITUATION:**\n\n`;
  
  // Current state
  prompt += `State: ${input.currentState}\n`;
  
  // Cart information
  if (input.currentContext.cart.length > 0) {
    prompt += `\nCart (${input.currentContext.cart.length} items):\n`;
    input.currentContext.cart.forEach((item, index) => {
      prompt += `${index + 1}. ${item.productName} - ৳${item.productPrice} × ${item.quantity}\n`;
    });
    const cartTotal = input.currentContext.cart.reduce((sum, item) => sum + (item.productPrice * item.quantity), 0);
    prompt += `Subtotal: ৳${cartTotal}\n`;
  } else {
    prompt += `\nCart: Empty\n`;
  }
  
  // Checkout information
  if (input.currentContext.checkout.customerName || 
      input.currentContext.checkout.customerPhone || 
      input.currentContext.checkout.customerAddress) {
    prompt += `\nCheckout Info:\n`;
    if (input.currentContext.checkout.customerName) {
      prompt += `- Name: ${input.currentContext.checkout.customerName}\n`;
    }
    if (input.currentContext.checkout.customerPhone) {
      prompt += `- Phone: ${input.currentContext.checkout.customerPhone}\n`;
    }
    if (input.currentContext.checkout.customerAddress) {
      prompt += `- Address: ${input.currentContext.checkout.customerAddress}\n`;
    }
    if (input.currentContext.checkout.deliveryCharge) {
      prompt += `- Delivery: ৳${input.currentContext.checkout.deliveryCharge}\n`;
    }
    if (input.currentContext.checkout.totalAmount) {
      prompt += `- Total: ৳${input.currentContext.checkout.totalAmount}\n`;
    }
  }
  
  // Image recognition result
  if (input.imageRecognitionResult?.success && input.imageRecognitionResult.match) {
    const product = input.imageRecognitionResult.match.product;
    prompt += `\nImage Recognition Result:\n`;
    prompt += `- Product Found: ${product.name}\n`;
    prompt += `- Price: ৳${product.price}\n`;
    prompt += `- Confidence: ${input.imageRecognitionResult.match.confidence}%\n`;
    prompt += `- Tier: ${input.imageRecognitionResult.match.tier}\n`;
  }
  
  // Recent conversation history
  if (input.conversationHistory && input.conversationHistory.length > 0) {
    prompt += `\nRecent Messages (last ${Math.min(5, input.conversationHistory.length)}):\n`;
    input.conversationHistory.slice(-5).forEach(msg => {
      const sender = msg.sender === 'customer' ? '👤 Customer' : '🤖 Bot';
      prompt += `${sender}: ${msg.message}\n`;
    });
  }
  
  // Current user message
  prompt += `\n**USER'S CURRENT MESSAGE:**\n"${input.userMessage}"\n`;
  
  // Instructions
  prompt += `\n**YOUR TASK:**\n`;
  prompt += `Analyze the user's message in the context of the current state and decide what action to take.\n`;
  prompt += `Respond with a JSON object following the format specified in the system prompt.\n`;
  
  return prompt;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Creates a safe fallback decision when AI fails
 */
function createFallbackDecision(input: AIDirectorInput): AIDirectorDecision {
  console.log('⚠️ Using fallback decision');
  
  // Provide contextual fallback based on state
  let response = '';
  let newState: ConversationState = input.currentState;
  
  switch (input.currentState) {
    case 'IDLE':
      response = '👋 হাই! শুরু করতে product এর ছবি পাঠান, অথবা "help" লিখুন।';
      break;
    case 'CONFIRMING_PRODUCT':
      response = 'এই product টি অর্ডার করতে চান? YES বা NO লিখুন। ✅';
      break;
    case 'COLLECTING_NAME':
      response = 'আপনার সম্পূর্ণ নামটি বলবেন? 😊';
      break;
    case 'COLLECTING_PHONE':
      response = 'আপনার ফোন নম্বর দিন। 📱\n(Example: 01712345678)';
      break;
    case 'COLLECTING_ADDRESS':
      response = 'আপনার ডেলিভারি ঠিকানাটি দিন। 📍\n(Example: House 123, Road 4, Dhanmondi, Dhaka)';
      break;
    case 'CONFIRMING_ORDER':
      response = 'অর্ডার কনফার্ম করতে YES লিখুন। ✅';
      break;
    default:
      response = 'দুঃখিত, বুঝতে পারিনি। আবার বলবেন? 😊';
  }
  
  return {
    action: 'SEND_RESPONSE',
    response,
    newState,
    confidence: 30,
    reasoning: 'Fallback decision due to AI error',
  };
}

/**
 * Calculates the cost of an OpenAI API call
 * GPT-4o-mini pricing (as of 2024):
 * - Input: $0.15 per 1M tokens
 * - Output: $0.60 per 1M tokens
 */
function calculateAICost(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1_000_000) * 0.15;
  const outputCost = (outputTokens / 1_000_000) * 0.60;
  return inputCost + outputCost;
}

/**
 * Logs AI usage to the database for cost tracking
 */
async function logAIUsage(
  workspaceId: string,
  apiType: string,
  cost: number,
  usage: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  }
): Promise<void> {
  try {
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
    
    await supabase.from('api_usage').insert({
      workspace_id: workspaceId,
      api_type: apiType,
      cost,
      image_hash: null,
    });
    
    console.log(`📊 Logged AI usage: ${apiType}, $${cost.toFixed(6)}`);
  } catch (error) {
    console.error('❌ Failed to log AI usage:', error);
    // Don't throw - logging failure shouldn't break the flow
  }
}

// ============================================
// EXPORTS
// ============================================

export { aiDirector as default };
