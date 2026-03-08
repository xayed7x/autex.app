/**
 * Enhanced Intent Classifier
 * 
 * Intent-First Architecture for handling ANY customer message.
 * 
 * Flow:
 * 1. Try exact phrase patterns (FREE, instant)
 * 2. If no match → AI classifier (accurate)
 * 3. Return intent + extracted data
 * 
 * This replaces the state-first approach where we asked
 * "What state am I in?" before understanding the message.
 */

import OpenAI from 'openai';
import { ConversationContext, ConversationState } from '@/types/conversation';

// ============================================
// INTENT TYPES - Comprehensive List
// ============================================

export type IntentType = 
  // Order Flow
  | 'NEGOTIATE_PRICE'      // "800 দিব", "কম করেন", "900 nile hoi na?"
  | 'BULK_QUERY'           // "3টা নিলে কত?", "2 piece kinle discount?"
  | 'LAST_PRICE_QUERY'     // "লাস্ট প্রাইস?", "সর্বনিম্ন কত?"
  | 'DISCOUNT_QUERY'       // "ডিসকাউন্ট আছে?", "কত % ছাড়?"
  
  // Order Information
  | 'PROVIDE_NAME'         // "আমার নাম রফিক", "Rahim"
  | 'PROVIDE_PHONE'        // "01712345678"
  | 'PROVIDE_ADDRESS'      // "মিরপুর ১০, ঢাকা", "Dhanmondi 27"
  | 'PROVIDE_SIZE'         // "M সাইজ", "XL"
  | 'PROVIDE_COLOR'        // "লাল কালার", "Blue"
  | 'PROVIDE_QUANTITY'     // "২টা দেন", "3 piece"
  | 'PROVIDE_FULL_INFO'    // "রফিক, 01712345678, মিরপুর" (all at once)
  
  // Confirmations
  | 'CONFIRM_YES'          // "হ্যাঁ", "ok", "চাই", "order"
  | 'CONFIRM_NO'           // "না", "চাই না", "cancel"
  
  // Product Search & Queries
  | 'PRODUCT_SEARCH'       // "i want polo t shirt", "show me sarees", "দেখান", "আছে?"
  | 'PRODUCT_QUERY'        // "সাইজ কি আছে?", "স্টক আছে?", "কালার কি কি?"
  | 'PRICE_QUERY'          // "দাম কত?", "price?"
  | 'STOCK_QUERY'          // "স্টক আছে?", "stock available?"
  
  // Policy Queries
  | 'DELIVERY_QUERY'       // "কবে পাবো?", "delivery charge?", "কত দিন লাগবে?"
  | 'PAYMENT_QUERY'        // "বিকাশ নম্বর?", "COD হবে?", "payment method?"
  | 'RETURN_QUERY'         // "ফেরত দেওয়া যাবে?", "return policy?"
  | 'EXCHANGE_QUERY'       // "চেঞ্জ করা যাবে?", "exchange?"
  
  // Trust & Objections
  | 'TRUST_CONCERN'        // "original?", "fake না তো?", "আসল?"
  | 'PRICE_OBJECTION'      // "দাম বেশি", "expensive", "বেশি চাইলেন"
  | 'DELAY'                // "পরে অর্ডার করবো", "ভাবতে হবে"
  
  // General
  | 'GREETING'             // "হাই", "hello", "assalamualaikum"
  | 'THANKS'               // "ধন্যবাদ", "thanks"
  | 'ORDER_STATUS'         // "অর্ডার কোথায়?", "কবে পাবো?"
  | 'CANCEL_ORDER'         // "ক্যান্সেল করুন", "cancel order"
  | 'CHANGE_ORDER'         // "সাইজ চেঞ্জ করুন", "কালার বদলান"
  | 'COMPLAINT'            // "সার্ভিস বাজে", "reply দেন না"
  
  // Fallback
  | 'UNKNOWN';             // Can't determine

// ============================================
// CLASSIFIED INTENT RESULT
// ============================================

export interface ClassifiedIntent {
  intent: IntentType;
  confidence: number;
  source: 'pattern' | 'ai';
  extractedData: {
    price?: number;
    quantity?: number;
    name?: string;
    phone?: string;
    address?: string;
    size?: string;
    color?: string;
    [key: string]: any;
  };
}

// ============================================
// EXACT PHRASE PATTERNS (HIGH CONFIDENCE)
// ============================================

interface PatternRule {
  pattern: RegExp;
  intent: IntentType;
  extract?: (match: RegExpMatchArray) => Record<string, any>;
}

const EXACT_PATTERNS: PatternRule[] = [
  // Phone numbers (highest priority)
  {
    pattern: /^01[3-9]\d{8}$/,
    intent: 'PROVIDE_PHONE',
    extract: (m) => ({ phone: m[0] }),
  },
  
  // Price offers - "800 দিব", "900 nile hoi"
  {
    pattern: /(\d+)\s*(টাকা|taka|tk|৳)?\s*(দিব|দেব|দিবো|দেবো|dibo|debo|দিতে পারি)/i,
    intent: 'NEGOTIATE_PRICE',
    extract: (m) => ({ price: parseInt(m[1], 10) }),
  },
  {
    pattern: /(দিব|দেব|dibo|debo)\s*(\d+)\s*(টাকা|taka|tk)?/i,
    intent: 'NEGOTIATE_PRICE',
    extract: (m) => ({ price: parseInt(m[2], 10) }),
  },
  {
    pattern: /(\d+)\s*(টাকা|taka|tk)?\s*(রাখেন|রাখুন|করেন|rakhen)/i,
    intent: 'NEGOTIATE_PRICE',
    extract: (m) => ({ price: parseInt(m[1], 10) }),
  },
  {
    pattern: /(\d+)\s*(nile|নিলে)\s*(hoi|hobe|হয়|হবে)/i,
    intent: 'NEGOTIATE_PRICE',
    extract: (m) => ({ price: parseInt(m[1], 10) }),
  },
  
  // Bulk queries - "3টা নিলে কত?"
  {
    pattern: /(\d+)\s*(টা|ta|পিস|pis|piece|খানা)?\s*(নিলে|nile|কিনলে|kinle|নিব|nibo)/i,
    intent: 'BULK_QUERY',
    extract: (m) => ({ quantity: parseInt(m[1], 10) }),
  },
  {
    pattern: /একসাথে\s*(\d+)/i,
    intent: 'BULK_QUERY',
    extract: (m) => ({ quantity: parseInt(m[1], 10) }),
  },
  
  // Last price / minimum price
  {
    pattern: /লাস্ট\s*(প্রাইস|দাম|price)/i,
    intent: 'LAST_PRICE_QUERY',
  },
  {
    pattern: /(শেষ|সর্বনিম্ন|minimum|lowest)\s*(দাম|price)/i,
    intent: 'LAST_PRICE_QUERY',
  },
  {
    pattern: /last\s*price/i,
    intent: 'LAST_PRICE_QUERY',
  },
  
  // Confirmations - exact matches
  {
    pattern: /^(হ্যাঁ|হা|ji|jee|yes|yeah|ok|okay|oke|alright|sure|চাই|অর্ডার|order|নিব|nibo|করবো|korbo)$/i,
    intent: 'CONFIRM_YES',
  },
  {
    pattern: /order\s*(korbo|করবো|chai|চাই)/i,
    intent: 'CONFIRM_YES',
  },
  {
    pattern: /^(না|nah|no|nope|চাই\s*না|লাগবে\s*না|cancel|বাতিল)$/i,
    intent: 'CONFIRM_NO',
  },
  
  // Product Search patterns
  {
    pattern: /^(i want|i need|show me|do you have|looking for|give me|need)\s+.+/i,
    intent: 'PRODUCT_SEARCH',
  },
  {
    pattern: /(দেখান|দেখাও|dekhao|dekhan)\s*.*/i,
    intent: 'PRODUCT_SEARCH',
  },
  {
    pattern: /(কিনতে চাই|কিনবো|kinbo|kinte chai)/i,
    intent: 'PRODUCT_SEARCH',
  },
  {
    pattern: /(লাগবে|lagbe|দরকার|dorkar|চাই|chai)\s+.+/i,
    intent: 'PRODUCT_SEARCH',
  },
  {
    pattern: /^.+\s+(আছে|ache|ase)\??$/i,
    intent: 'PRODUCT_SEARCH',
  },
  {
    pattern: /^.+\s+(collection|কালেকশন)\s*(দেখান|dekhao|দাও|dao)?/i,
    intent: 'PRODUCT_SEARCH',
  },
  
  // Greetings
  {
    pattern: /^(hi|hello|hey|হাই|হ্যালো|assalamualaikum|আসসালামু আলাইকুম|salam|সালাম)$/i,
    intent: 'GREETING',
  },
  
  // Thanks
  {
    pattern: /^(thanks|thank you|ধন্যবাদ|শুকরিয়া|thx)$/i,
    intent: 'THANKS',
  },
  
  // Size patterns
  {
    pattern: /^(XS|S|M|L|XL|XXL|XXXL|2XL|3XL|\d{2})$/i,
    intent: 'PROVIDE_SIZE',
    extract: (m) => ({ size: m[0].toUpperCase() }),
  },
  {
    pattern: /(সাইজ|size)\s*(XS|S|M|L|XL|XXL|XXXL|2XL|3XL|\d{2})/i,
    intent: 'PROVIDE_SIZE',
    extract: (m) => ({ size: m[2].toUpperCase() }),
  },
  
  // Delivery queries
  {
    pattern: /(delivery|ডেলিভারি)\s*(charge|চার্জ|খরচ|কত)/i,
    intent: 'DELIVERY_QUERY',
  },
  {
    pattern: /(কবে|kobe|কত\s*দিন|কতদিন)\s*(পাবো|পাব|pabo|লাগবে|lagbe)/i,
    intent: 'DELIVERY_QUERY',
  },
  
  // Payment queries
  {
    pattern: /(bkash|বিকাশ|নগদ|nagad|রকেট|rocket)\s*(নম্বর|number)?/i,
    intent: 'PAYMENT_QUERY',
  },
  {
    pattern: /(cod|ক্যাশ অন ডেলিভারি|cash on delivery)/i,
    intent: 'PAYMENT_QUERY',
  },
  
  // Return/Exchange queries
  {
    pattern: /(return|ফেরত|রিটার্ন)\s*(policy|পলিসি|দেওয়া|যাবে)?/i,
    intent: 'RETURN_QUERY',
  },
  {
    pattern: /(exchange|এক্সচেঞ্জ|চেঞ্জ)\s*(করা|করতে|policy)?/i,
    intent: 'EXCHANGE_QUERY',
  },
  
  // Trust concerns
  {
    pattern: /(original|অরিজিনাল|আসল|asol|genuine)/i,
    intent: 'TRUST_CONCERN',
  },
  {
    pattern: /(fake|নকল|চায়না|china)\s*(না|na|তো|to)?/i,
    intent: 'TRUST_CONCERN',
  },
  
  // Price objections
  {
    pattern: /(দাম|price)\s*(বেশি|beshi|high|expensive)/i,
    intent: 'PRICE_OBJECTION',
  },
  {
    pattern: /(বেশি|beshi|too much)\s*(চাইলেন|চাইছেন|price)/i,
    intent: 'PRICE_OBJECTION',
  },
  
  // Discount queries
  {
    pattern: /(discount|ডিসকাউন্ট|ছাড়)\s*(আছে|ache|কত|koto|দিবেন|diben)?/i,
    intent: 'DISCOUNT_QUERY',
  },
  
  // Stock queries
  {
    pattern: /(stock|স্টক|মজুদ)\s*(আছে|ache|available)?/i,
    intent: 'STOCK_QUERY',
  },
  
  // Delay/thinking
  {
    pattern: /(পরে|pore|later)\s*(অর্ডার|order|নিব|nibo|করবো|korbo)/i,
    intent: 'DELAY',
  },
  {
    pattern: /(ভাবতে হবে|ভাবছি|thinking|consider)/i,
    intent: 'DELAY',
  },
  
  // Complaint
  {
    pattern: /(reply|রিপ্লাই)\s*(দেন\s*না|den na|করেন\s*না)/i,
    intent: 'COMPLAINT',
  },
  {
    pattern: /(service|সার্ভিস)\s*(বাজে|bad|poor)/i,
    intent: 'COMPLAINT',
  },
];

// ============================================
// PATTERN MATCHING (TIER 1 - FREE)
// ============================================

function matchExactPatterns(text: string): ClassifiedIntent | null {
  const cleanText = text.trim();
  
  for (const rule of EXACT_PATTERNS) {
    const match = cleanText.match(rule.pattern);
    if (match) {
      console.log(`✅ [INTENT] Pattern matched: ${rule.intent}`);
      return {
        intent: rule.intent,
        confidence: 0.95,
        source: 'pattern',
        extractedData: rule.extract ? rule.extract(match) : {},
      };
    }
  }
  
  return null;
}

// ============================================
// AI CLASSIFIER (TIER 2 - FALLBACK)
// ============================================

const AI_INTENT_PROMPT = `You are an intent classifier for a Bangladeshi e-commerce chatbot.

Analyze the customer message and classify it into ONE of these intents:

PRODUCT SEARCH (HIGHEST PRIORITY for IDLE state):
- PRODUCT_SEARCH: Customer is looking for a product by name, type, or category. Examples:
  - "i want polo t shirts", "show me sarees", "do you have jeans?"
  - "polo shirt ache?", "t-shirt collection dekhao"
  - "কিনতে চাই", "লাগবে", "দেখান"
  - ANY message where the customer mentions a product type they want to find/buy

ORDER FLOW:
- NEGOTIATE_PRICE: Customer offering a specific price (e.g., "800 দিব", "900 nile hobe?", "কম করেন")
- BULK_QUERY: Asking about bulk pricing (e.g., "3টা নিলে কত?")
- LAST_PRICE_QUERY: Asking for lowest/final price
- DISCOUNT_QUERY: Asking about discounts

ORDER INFORMATION:
- PROVIDE_NAME: Giving their name
- PROVIDE_PHONE: Giving phone number
- PROVIDE_ADDRESS: Giving delivery address
- PROVIDE_SIZE: Specifying size
- PROVIDE_COLOR: Specifying color
- PROVIDE_QUANTITY: Specifying quantity

CONFIRMATIONS:
- CONFIRM_YES: Agreeing, wanting to order
- CONFIRM_NO: Declining, canceling

QUERIES:
- PRODUCT_QUERY: Questions about a SPECIFIC product already in context (details, size, color, stock)
- PRICE_QUERY: Asking about price
- STOCK_QUERY: Asking about availability
- DELIVERY_QUERY: Questions about delivery
- PAYMENT_QUERY: Questions about payment methods
- RETURN_QUERY: Questions about returns
- EXCHANGE_QUERY: Questions about exchanges

TRUST & OBJECTIONS:
- TRUST_CONCERN: Asking if product is original/genuine
- PRICE_OBJECTION: Saying price is too high
- DELAY: Saying they'll order later

GENERAL:
- GREETING: Hi, Hello, etc. ONLY for pure greetings with no product mention
- THANKS: Thank you messages
- COMPLAINT: Expressing dissatisfaction
- UNKNOWN: Cannot determine intent

IMPORTANT RULES:
1. If the customer mentions ANY product type/category (shirt, saree, polo, jeans, panjabi, etc.) and seems to want to find/buy it → PRODUCT_SEARCH. This is true even if there's already a product in the cart.
2. PRODUCT_QUERY is for questions about a product already being discussed ("ki size ache?", "stock ache?"). PRODUCT_SEARCH is for finding NEW products.
3. Interpret numbers based on PHRASING and CONTEXT:
   - Pure number / Offer phrasing ("900", "900 tk", "800 dibo") -> NEGOTIATE_PRICE (extract price)
   - questioning price ("900?", "dam 900?") -> PRICE_QUERY or CONFIRM_YES depending on flow
   - Quantity/Bulk ("50 pcs", "10 ta") -> BULK_QUERY
   - Objection ("900 besi", "900 expensive") -> PRICE_OBJECTION
4. If 'Product in cart' is TRUE and input is just a number, prefer NEGOTIATE_PRICE unless context implies otherwise.
5. For PRODUCT_SEARCH, extract the product query in extractedData as {"searchQuery": "polo t shirt"}.

Respond with JSON: {"intent": "INTENT_NAME", "extractedData": {...}, "confidence": 0.0-1.0}`;

async function classifyWithAI(
  text: string,
  context: {
    currentState: ConversationState;
    hasProductInCart: boolean;
    recentMessages?: string[];
  }
): Promise<ClassifiedIntent> {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  
  try {
    console.log(`\n🤖 [INTENT-CLASSIFIER] ━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🤖 [INTENT-CLASSIFIER] Calling AI classifier for: "${text}"`);
    
    const contextInfo = `
Context:
- Current state: ${context.currentState}
- Product in cart: ${context.hasProductInCart}
${context.recentMessages ? `- Recent messages: ${context.recentMessages.join(' | ')}` : ''}`;
    
    const userContent = `${contextInfo}\n\nCustomer message: "${text}"`;
    
    console.log(`📋 [INTENT-CLASSIFIER] SYSTEM PROMPT (first 500 chars):`);
    console.log(AI_INTENT_PROMPT.substring(0, 500));
    console.log(`📋 [INTENT-CLASSIFIER] USER PROMPT:`);
    console.log(userContent);
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: AI_INTENT_PROMPT },
        { role: 'user', content: userContent },
      ],
      max_tokens: 100,
      temperature: 0,
      response_format: { type: 'json_object' },
    });
    
    const content = response.choices[0]?.message?.content || '{}';
    console.log(`📝 [INTENT-CLASSIFIER] RAW AI RESPONSE: ${content}`);
    const parsed = JSON.parse(content);
    
    console.log(`✅ [INTENT-CLASSIFIER] AI classified: ${parsed.intent} (confidence: ${parsed.confidence})`);
    console.log(`🤖 [INTENT-CLASSIFIER] ━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    
    return {
      intent: parsed.intent as IntentType || 'UNKNOWN',
      confidence: parsed.confidence || 0.7,
      source: 'ai',
      extractedData: parsed.extractedData || {},
    };
  } catch (error) {
    console.error('❌ [INTENT] AI classification failed:', error);
    return {
      intent: 'UNKNOWN',
      confidence: 0,
      source: 'ai',
      extractedData: {},
    };
  }
}

// ============================================
// MAIN CLASSIFIER FUNCTION
// ============================================

export async function classifyIntent(
  text: string,
  context: ConversationContext
): Promise<ClassifiedIntent> {
  console.log(`🧠 [INTENT] Classifying: "${text.substring(0, 50)}..."`);
  
  // TIER 1: Try exact patterns first (FREE)
  const patternMatch = matchExactPatterns(text);
  if (patternMatch) {
    return patternMatch;
  }
  
  // TIER 2: AI classifier (fallback)
  const aiResult = await classifyWithAI(text, {
    currentState: context.state,
    hasProductInCart: context.cart && context.cart.length > 0,
  });
  
  return aiResult;
}

// ============================================
// EXPORTS
// ============================================

export { matchExactPatterns, classifyWithAI };
