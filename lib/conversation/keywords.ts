/**
 * Shared Keywords for Interruption Detection
 * 
 * This file contains keyword lists and detection logic used by both
 * fast-lane.ts and state-machine.ts to identify customer interruptions
 * (questions) during the order flow.
 */

// ============================================
// INTERRUPTION TYPES
// ============================================

export type InterruptionType = 
  | 'delivery'
  | 'price'
  | 'payment'
  | 'return'
  | 'size'
  | null;

// ============================================
// KEYWORD LISTS
// ============================================

const DELIVERY_KEYWORDS = [
  // English
  'delivery', 'shipping', 'courier', 'charge', 'cost',
  // Time-related (should trigger delivery, not product)
  'when', 'কখন', 'কবে', 'koto din', 'kotdin', 'কত দিন', 'কতদিন',
  'arrive', 'reach', 'পৌঁছাবে', 'পৌঁছে', 'পাব', 'আসবে', 'পাবো',
  'পৌছাবে', 'পৌছে', // Common typos
  // Banglish
  'deliver', 'ডেলিভারি', 'চার্জ', 'খরচ',
  'কত লাগবে', 'time lagbe', 'সময়', 'somoy',
  'got the product', 'get', 'receive', 'পেতে'
];

const PRICE_KEYWORDS = [
  // English
  'price', 'cost', 'how much', 'rate', 'budget',
  // Bangla
  'কত', 'দাম', 'টাকা', 'কত টাকা', 'কিতা', 'dam',
  // Banglish
  'dam koto', 'koto taka', 'dam ki'
];

const PAYMENT_KEYWORDS = [
  // English
  'payment', 'pay', 'how to pay', 'paid',
  // Bangla
  'পেমেন্ট', 'কিভাবে', 'পরিশোধ', 'দিব', 'দেব',
  // Banglish  
  'kivabe', 'kemon kore', 'কেমন করে',
  // Methods
  'বিকাশ', 'নগদ', 'bkash', 'nagad', 'bikash', 'nogod'
];

const RETURN_KEYWORDS = [
  // English
  'return', 'exchange', 'change', 'refund',
  // Bangla
  'ফেরত', 'বদল', 'ফিরিয়ে', 'পরিবর্তন', 'ফেরতযোগ্য',
  // Banglish
  'ferot', 'firat', 'change kora', 'বদলানো'
];

const SIZE_KEYWORDS = [
  // English
  'size', 'small', 'medium', 'large', 'xl', 'xxl', 'l', 'm', 's',
  // Bangla
  'সাইজ', 'মাপ', 'ছোট', 'বড়', 'মাঝারি',
  // Banglish
  'choto', 'boro', 'মিডিয়াম', 'লার্জ',
  // Variations
  'available', 'আছে', 'পাওয়া যায়', 'stock'
];

// Product detail keywords (View Details equivalents)
const DETAILS_KEYWORDS = [
  // Direct detail requests
  'details', 'detail', 'info', 'information', 'specification',
  // Bangla
  'বিস্তারিত', 'বর্ণনা', 'জানতে চাই', 'বলুন', 'দেখাও',
  // Banglish
  'dekhao', 'bolo', 'জানাও', 'janao',
  // Color/variation questions
  'color', 'colour', 'রঙ', 'রং', 'কালার',
  'red', 'blue', 'black', 'white', 'লাল', 'নীল', 'কালো', 'সাদা'
];

// Order/Buy keywords (Order Now equivalents)
const ORDER_KEYWORDS = [
  // English
  'order', 'buy', 'purchase', 'want', 'need',
  // Bangla
  'কিনব', 'কিনতে চাই', 'অর্ডার', 'নিব', 'নিতে চাই', 'চাই', 'লাগবে',
  // Banglish
  'kinbo', 'nibo', 'nite chai', 'lagbe', 'দাও'
];

// ============================================
// DETECTION FUNCTIONS
// ============================================

/**
 * Checks if a text contains keywords from a specific list
 */
function containsKeywords(text: string, keywords: string[]): boolean {
  const lowerText = text.toLowerCase().trim();
  return keywords.some(keyword => lowerText.includes(keyword.toLowerCase()));
}

/**
 * Detects the type of interruption based on keywords
 * Returns the interruption type or null if no interruption detected
 */
export function getInterruptionType(text: string): InterruptionType {
  if (containsKeywords(text, DELIVERY_KEYWORDS)) return 'delivery';
  if (containsKeywords(text, PRICE_KEYWORDS)) return 'price';
  if (containsKeywords(text, PAYMENT_KEYWORDS)) return 'payment';
  if (containsKeywords(text, RETURN_KEYWORDS)) return 'return';
  if (containsKeywords(text, SIZE_KEYWORDS)) return 'size';
  return null;
}

/**
 * Checks if text is a general interruption (any type)
 */
export function isInterruption(text: string): boolean {
  return getInterruptionType(text) !== null;
}

/**
 * Checks if text is asking for product details
 */
export function isDetailsRequest(text: string): boolean {
  return containsKeywords(text, DETAILS_KEYWORDS) || containsKeywords(text, PRICE_KEYWORDS);
}

/**
 * Checks if text is an order/buy intent
 */
export function isOrderIntent(text: string): boolean {
  return containsKeywords(text, ORDER_KEYWORDS);
}

// ============================================
// EXPORTS
// ============================================

export {
  DELIVERY_KEYWORDS,
  PRICE_KEYWORDS,
  PAYMENT_KEYWORDS,
  RETURN_KEYWORDS,
  SIZE_KEYWORDS,
  DETAILS_KEYWORDS,
  ORDER_KEYWORDS,
};
