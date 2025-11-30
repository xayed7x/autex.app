import OpenAI from 'openai';
import { detectIntent as detectIntentLocal, Intent } from './nlu';

/**
 * Extended intent types for AI-powered detection
 */
export type AIIntent = 
  | 'product_search'
  | 'greeting'
  | 'general_query'
  | 'order_status'
  | 'price_query'
  | 'unknown';

/**
 * AI Intent Response structure
 */
export interface AIIntentResponse {
  intent: AIIntent;
  entities?: {
    product_type?: string;
    color?: string;
    size?: string;
    price_range?: string;
    [key: string]: any;
  };
  confidence?: number;
}

/**
 * Unified Intent Response (combines local NLU and AI)
 */
export interface UnifiedIntentResponse {
  intent: Intent | AIIntent;
  source: 'local' | 'ai';
  entities?: AIIntentResponse['entities'];
  confidence?: number;
}

/**
 * Main entry point for intent detection.
 * Uses a hybrid approach: Fast local NLU first, AI fallback for complex queries.
 * 
 * @param text - User's message text
 * @returns Unified intent response with source information
 */
export async function detectUserIntent(text: string): Promise<UnifiedIntentResponse> {
  console.log('🧠 [INTENT] Detecting user intent for:', text.substring(0, 50));

  // ========================================
  // STEP A: Fast Lane - Local NLU
  // ========================================
  const localIntent = detectIntentLocal(text);
  console.log('⚡ [INTENT] Local NLU result:', localIntent);

  // ========================================
  // STEP B: Check if local NLU succeeded
  // ========================================
  if (localIntent !== 'UNKNOWN') {
    console.log('✅ [INTENT] Local NLU succeeded, returning immediately');
    return {
      intent: localIntent,
      source: 'local',
      confidence: 0.9, // High confidence for exact keyword matches
    };
  }

  // ========================================
  // STEP C: Smart Lane - AI Fallback
  // ========================================
  console.log('🤖 [INTENT] Local NLU returned UNKNOWN, falling back to AI...');
  
  try {
    const aiResponse = await getIntentFromAI(text);
    console.log('✅ [INTENT] AI result:', aiResponse);
    
    return {
      intent: aiResponse.intent,
      source: 'ai',
      entities: aiResponse.entities,
      confidence: aiResponse.confidence || 0.7,
    };
  } catch (error) {
    console.error('❌ [INTENT] AI fallback failed:', error);
    
    // Final fallback: return unknown
    return {
      intent: 'unknown',
      source: 'ai',
      confidence: 0,
    };
  }
}

/**
 * Calls OpenAI API to detect intent for complex queries.
 * Uses GPT-4o-mini for cost-effective, fast inference.
 * 
 * @param text - User's message text
 * @returns AI-detected intent with entities
 */
async function getIntentFromAI(text: string): Promise<AIIntentResponse> {
  // Check if OpenAI API key is configured
  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️ [INTENT] OpenAI API key not configured, returning unknown');
    return { intent: 'unknown' };
  }

  try {
    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // System prompt for specialized NLU
    const systemPrompt = `You are a specialized NLU engine for a Bangladeshi clothing store chatbot. 
Analyze the user's text and return a JSON object with two keys:

1. "intent": Classify the user's goal. Possible values:
   - "product_search": User is looking for a specific product (e.g., "I want a red saree", "show me polo shirts")
   - "greeting": User is greeting or starting conversation (e.g., "hello", "hi", "assalamu alaikum")
   - "general_query": User has a general question (e.g., "do you deliver?", "what's your return policy?")
   - "order_status": User is asking about their order (e.g., "where is my order?", "track my order")
   - "price_query": User is asking about pricing (e.g., "how much?", "what's the price?")
   - "unknown": If you cannot confidently classify the intent

2. "entities": Extract key information as an object. Examples:
   - {"product_type": "saree", "color": "red"}
   - {"product_type": "shirt", "style": "polo"}
   - {"price_range": "under 1000"}

3. "confidence": A number between 0 and 1 indicating your confidence in the classification.

IMPORTANT: 
- Support both English and Bangla/Bengali text
- Be culturally aware of Bangladeshi shopping patterns
- If unsure, return "intent": "unknown"
- Always return valid JSON

Example responses:
{"intent": "product_search", "entities": {"product_type": "saree", "color": "red"}, "confidence": 0.95}
{"intent": "greeting", "entities": {}, "confidence": 0.99}
{"intent": "unknown", "entities": {}, "confidence": 0.3}`;

    console.log('🤖 [INTENT] Calling OpenAI API...');

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: text,
        },
      ],
      temperature: 0.3, // Lower temperature for more consistent results
      max_tokens: 150,
      response_format: { type: 'json_object' }, // Ensure JSON response
    });

    // Extract and parse the response
    const responseText = completion.choices[0]?.message?.content;
    
    if (!responseText) {
      console.error('❌ [INTENT] OpenAI returned empty response');
      return { intent: 'unknown' };
    }

    console.log('📝 [INTENT] OpenAI raw response:', responseText);

    // Parse JSON response
    const parsed = JSON.parse(responseText) as AIIntentResponse;

    // Validate intent value
    const validIntents: AIIntent[] = [
      'product_search',
      'greeting',
      'general_query',
      'order_status',
      'price_query',
      'unknown',
    ];

    if (!validIntents.includes(parsed.intent)) {
      console.warn(`⚠️ [INTENT] Invalid intent from AI: ${parsed.intent}, defaulting to unknown`);
      return { intent: 'unknown', entities: parsed.entities };
    }

    return parsed;
  } catch (error) {
    console.error('❌ [INTENT] Error calling OpenAI API:', error);
    
    // Return unknown on any error
    return { intent: 'unknown' };
  }
}

/**
 * Helper function to check if an intent indicates the user wants to search for products
 */
export function isProductSearchIntent(intent: Intent | AIIntent): boolean {
  return intent === 'product_search';
}

/**
 * Helper function to check if an intent is a greeting
 */
export function isGreetingIntent(intent: Intent | AIIntent): boolean {
  return intent === 'greeting';
}

/**
 * Helper function to extract product search query from entities
 */
export function extractProductQuery(entities?: AIIntentResponse['entities']): string | null {
  if (!entities) return null;

  const parts: string[] = [];

  if (entities.color) parts.push(entities.color);
  if (entities.product_type) parts.push(entities.product_type);
  if (entities.style) parts.push(entities.style);
  if (entities.size) parts.push(entities.size);

  return parts.length > 0 ? parts.join(' ') : null;
}
