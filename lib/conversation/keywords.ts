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
  | 'urgency'
  | 'objection'
  | 'seller'
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
  'got the product', 'get', 'receive', 'পেতে',
  // NEW: Time-specific queries
  'আজকে পাব', 'ajke pabo', 'today', 'tomorrow', 'আগামীকাল', 'agamikal',
  'কাল পাব', 'kal pabo', 'this week', 'এই সপ্তাহে',
  // NEW: Delivery method queries  
  'কুরিয়ার', 'courier service', 'pathao', 'পাঠাও', 'ecourier', 'ই-কুরিয়ার',
  'redx', 'রেডএক্স', 'sundorban', 'সুন্দরবন',
  // NEW: Location-specific
  'ঢাকার বাইরে', 'dhakar baire', 'outside dhaka', 'আমার এলাকায়', 'amar elakay',
  'mirpur', 'মিরপুর', 'uttara', 'উত্তরা', 'gulshan', 'গুলশান',
  'dhanmondi', 'ধানমন্ডি', 'mohakhali', 'মহাখালী',
  // NEW: Cost concerns
  'বেশি লাগবে', 'beshi lagbe', 'কম খরচ', 'kom khoroch', 'free delivery',
  'ফ্রি ডেলিভারি', 'delivery free', 'কত টাকা ডেলিভারি',
  // NEW: Tracking
  'ট্র্যাক', 'track', 'কোথায়', 'kothay', 'location', 'পাঠালো', 'pathalo'
];

const PRICE_KEYWORDS = [
  // English
  'price', 'cost', 'how much', 'rate', 'budget',
  // Bangla
  'কত', 'দাম', 'টাকা', 'কত টাকা', 'কিতা', 'dam',
  // Banglish
  'dam koto', 'koto taka', 'dam ki',
  // NEW: Price objections
  'দাম বেশি', 'dam beshi', 'expensive', 'চড়া', 'chora',
  'কমাতে পারবেন', 'kamate parben', 'discount', 'ডিসকাউন্ট',
  'কম দাম', 'kom dam', 'cheaper', 'সস্তা', 'sosta',
  'দর কষাকষি', 'dor koshakoshi', 'bargain', 'negotiate'
];

const PAYMENT_KEYWORDS = [
  // English
  'payment', 'pay', 'how to pay', 'paid',
  // Bangla
  'পেমেন্ট', 'কিভাবে', 'পরিশোধ', 'দিব', 'দেব',
  // Banglish  
  'kivabe', 'kemon kore', 'কেমন করে',
  // Methods
  'বিকাশ', 'নগদ', 'bkash', 'nagad', 'bikash', 'nogod',
  // NEW: Payment concerns
  'নিরাপদ', 'safe', 'secure', 'সিকিউর', 'বিশ্বাস', 'trust',
  'ঠকাবে না', 'thokabe na', 'reliable', 'ভরসা', 'vorosa',
  // NEW: Cash on Delivery (COD)
  'হাতে হাতে', 'hate hate', 'cash on delivery', 'cod', 'সিওডি',
  'দেখে দেব', 'dekhe debo', 'দেখে টাকা', 'dekhe taka',
  'প্রোডাক্ট দেখে', 'product dekhe', 'হাতে পেয়ে', 'hate peye',
  // NEW: Mobile banking specifics
  'বিকাশ নম্বর', 'bkash number', 'নগদ নম্বর', 'nagad number',
  'কোন নাম্বার', 'kon number', 'কোন নম্বরে', 'kon nombore',
  'মার্চেন্ট', 'merchant', 'পার্সোনাল', 'personal',
  'সেন্ড মানি', 'send money', 'পাঠাব', 'pathabo',
  // NEW: Payment timing
  'আগে দিতে হবে', 'age dite hobe', 'advance', 'আগাম', 'agam',
  'পরে দেব', 'pore debo', 'later', 'প্রোডাক্ট পেয়ে', 'product peye',
  // NEW: Payment problems
  'পেমেন্ট হচ্ছে না', 'payment hocche na', 'failed', 'ফেইল',
  'কাটছে না', 'katche na', 'declined', 'রিজেক্ট', 'reject'
];

const RETURN_KEYWORDS = [
  // English
  'return', 'exchange', 'change', 'refund',
  // Bangla
  'ফেরত', 'বদল', 'ফিরিয়ে', 'পরিবর্তন', 'ফেরতযোগ্য',
  // Banglish
  'ferot', 'firat', 'change kora', 'বদলানো',
  // NEW: Condition-based returns
  'নষ্ট হলে', 'noshto hole', 'ভাঙা', 'vanga', 'damaged', 'ডেমেজ',
  'ছেঁড়া', 'chera', 'defect', 'ডিফেক্ট', 'problem', 'সমস্যা',
  'মেলে না', 'mele na', 'দেখতে খারাপ', 'dekhte kharap',
  // NEW: Return process
  'কিভাবে ফেরত', 'kivabe ferot', 'return korbo', 'ফেরত দিব', 'ferot dibo',
  'কোথায় দেব', 'kothay debo', 'কুরিয়ার', 'courier', 'পাঠাব', 'pathabo',
  // NEW: Time concerns
  'কত দিন', 'koto din', 'সময় আছে', 'somoy ache', 'deadline',
  'এক্সপায়ার', 'expire', 'শেষ', 'shesh',
  // NEW: Money back
  'টাকা ফেরত', 'taka ferot', 'refund', 'রিফান্ড', 'ফেরত পাব', 'ferot pabo',
  'money back', 'মানি ব্যাক'
];

const SIZE_KEYWORDS = [
  // English
  'size', 'small', 'medium', 'large', 'xl', 'xxl', 'l', 'm', 's',
  // Bangla
  'সাইজ', 'মাপ', 'ছোট', 'বড়', 'মাঝারি',
  // Banglish
  'choto', 'boro', 'মিডিয়াম', 'লার্জ',
  // Variations
  'available', 'আছে', 'পাওয়া যায়', 'stock',
  // NEW: Fitting concerns
  'মানাবে', 'manabe', 'fit', 'ফিট', 'পড়া যাবে', 'pora jabe',
  'ঢোকাবে', 'dhokabe', 'আমার জন্য', 'amar jonno',
  'সাইজ ছোট', 'size choto', 'সাইজ বড়', 'size boro',
  // NEW: Measurement specifics
  'লম্বা', 'lomba', 'length', 'চওড়া', 'chora', 'width',
  'ইঞ্চি', 'inch', 'সেন্টিমিটার', 'cm', 'মাপ', 'map',
  'কত ইঞ্চি', 'koto inch', 'measurement', 'মেজারমেন্ট',
  // NEW: Weight/Material
  'ওজন', 'ojon', 'weight', 'ভারী', 'vari', 'heavy',
  'হালকা', 'halka', 'light', 'মোটা', 'mota', 'thick',
  'পাতলা', 'patla', 'thin', 'material', 'ম্যাটেরিয়াল',
  'কাপড়', 'kapor', 'fabric', 'কি দিয়ে', 'ki diye'
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
  'red', 'blue', 'black', 'white', 'লাল', 'নীল', 'কালো', 'সাদা',
  // NEW: Quality/Authenticity
  'অরিজিনাল', 'original', 'আসল', 'asol', 'নকল', 'nokol', 'fake',
  'quality', 'কোয়ালিটি', 'ভালো', 'valo', 'good', 'খারাপ', 'kharap',
  'দামি', 'dami', 'expensive', 'সস্তা', 'sosta', 'cheap',
  'brand', 'ব্র্যান্ড', 'company', 'কোম্পানি',
  // NEW: Comparison
  'অন্য', 'onno', 'আরেকটা', 'arekta', 'another', 'different',
  'similar', 'একই রকম', 'eki rokom', 'same', 'মতো', 'moto',
  'better', 'ভালো কোনটা', 'valo konota', 'which one', 'কোনটা নিব',
  'compare', 'তুলনা', 'tulona', 'মিল', 'mil',
  // NEW: Availability Urgency
  'শেষ হয়ে যাবে', 'shesh hoye jabe', 'stock out', 'শেষ', 'shesh',
  'আছে তো', 'ache to', 'পাওয়া যাচ্ছে', 'pawa jacche', 'available',
  'নতুন আসবে', 'notun asbe', 'restock', 'আবার আসবে', 'abar asbe',
  'কবে পাব', 'kobe pabo', 'when available'
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

// NEW: Urgency & Availability
const URGENCY_KEYWORDS = [
  // Immediate need
  'এখনই লাগবে', 'ekhoni lagbe', 'urgent', 'জরুরি', 'joruri',
  'তাড়াতাড়ি', 'taratari', 'fast', 'দ্রুত', 'druto',
  'আজকেই', 'ajkei', 'today', 'রাতেই', 'ratei',
  // Stock anxiety
  'শেষ হয়ে যাবে', 'shesh hoye jabe', 'শেষ হচ্ছে', 'shesh hocche',
  'কয়টা আছে', 'koyta ache', 'how many left', 'বাকি আছে', 'baki ache',
  'লাস্ট পিস', 'last piece', 'শেষ টা', 'shesh ta',
  // Pre-order/Waiting
  'কবে আসবে', 'kobe asbe', 'pre order', 'প্রি অর্ডার',
  'বুকিং', 'booking', 'reserve', 'রিজার্ভ', 'রাখা', 'rakha',
  'waiting', 'অপেক্ষা', 'opekkha'
];

// NEW: Objections & Concerns
const OBJECTION_KEYWORDS = [
  // Trust/Scam concerns
  'ঠকাবে না তো', 'thokabe na to', 'scam', 'ফেক', 'fake',
  'বিশ্বাস করব কি', 'biswas korbo ki', 'trust করা যায়', 'trust kora jay',
  'নিরাপদ', 'safe', 'secure', 'সিকিউর',
  // Price objections (also in PRICE_KEYWORDS but explicit here for intent)
  'দাম বেশি', 'dam beshi', 'expensive', 'চড়া', 'chora',
  'কমাতে পারবেন', 'kamate parben', 'discount', 'ডিসকাউন্ট',
  'কম দাম', 'kom dam', 'cheaper', 'সস্তা', 'sosta',
  'দর কষাকষি', 'dor koshakoshi', 'bargain', 'negotiate',
  // Decision delay
  'পরে অর্ডার করব', 'pore order korbo', 'ভাবতে হবে', 'vabte hobe',
  'দেখি', 'dekhi', 'think', 'চিন্তা', 'chinta',
  'স্বামীকে জিজ্ঞেস', 'swamike jiggesh', 'ask husband',
  'বাসায় জিজ্ঞেস', 'basay jiggesh', 'ask family'
];

// NEW: Seller Questions
const SELLER_KEYWORDS = [
  // Business info
  'দোকান কোথায়', 'dokan kothay', 'shop location', 'ঠিকানা', 'thikana',
  'address', 'এড্রেস', 'office', 'অফিস', 'showroom', 'শোরুম',
  // Contact
  'ফোন নম্বর', 'phone number', 'নাম্বার', 'number', 'যোগাযোগ', 'jogajog',
  'contact', 'কন্টাক্ট', 'কল করব', 'call korbo', 'হোয়াটসঅ্যাপ', 'whatsapp',
  // Business hours
  'কখন খোলা', 'kokhon khola', 'open', 'বন্ধ', 'bondho', 'closed',
  'সময়', 'somoy', 'hours', 'রাতে খোলা', 'rate khola'
];

// ============================================
// DETECTION FUNCTIONS
// ============================================

/**
 * Checks if a text contains keywords from a specific list
 */
function containsKeywords(text: string, keywords: string[]): boolean {
  const lowerText = text.toLowerCase().trim();
  return keywords.some(keyword => {
    // If keyword is very short (<= 2 chars), require word boundary to avoid false positives
    // Example: "YES" should not match "s" (size)
    if (keyword.length <= 2) {
      // Escape special regex characters if any (though unlikely for short keywords)
      const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escapedKeyword}\\b`, 'i');
      return regex.test(lowerText);
    }
    return lowerText.includes(keyword.toLowerCase());
  });
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
  if (containsKeywords(text, URGENCY_KEYWORDS)) return 'urgency';
  if (containsKeywords(text, OBJECTION_KEYWORDS)) return 'objection';
  if (containsKeywords(text, SELLER_KEYWORDS)) return 'seller';
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
// CART SELECTION DETECTION (Multi-Product)
// ============================================

/** Keywords for "select all" intent */
const ALL_INTENT_KEYWORDS = [
  // Bangla
  'সবগুলো', 'সবকটা', 'সব', 'সবই', 'সকল',
  // Banglish
  'sobgulo', 'sob', 'shob', 'shobgulo', 'sobkota',
  // English
  'all', 'everything', 'all of them',
  // Confirmation (when asked "সবগুলো অর্ডার করবেন?")
  'হ্যাঁ', 'yes', 'ha', 'ji', 'জি', 'হা', 'ok', 'ওকে', 'যাক', 'থাক',
];

/** Bangla number mapping */
const BANGLA_TO_ARABIC: Record<string, number> = {
  // Bangla digits
  '১': 1, '২': 2, '৩': 3, '৪': 4, '৫': 5,
  // Bangla words
  'এক': 1, 'দুই': 2, 'তিন': 3, 'চার': 4, 'পাঁচ': 5,
  'প্রথম': 1, 'দ্বিতীয়': 2, 'তৃতীয়': 3, 'চতুর্থ': 4, 'পঞ্চম': 5,
  // Banglish
  'ek': 1, 'dui': 2, 'tin': 3, 'char': 4, 'pach': 5,
  'first': 1, 'second': 2, 'third': 3, 'fourth': 4, 'fifth': 5,
  'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
};

/**
 * Detects if user wants to select all items
 * e.g., "সবগুলো", "all", "yes", "হ্যাঁ"
 */
export function detectAllIntent(text: string): boolean {
  const lowerText = text.toLowerCase().trim();
  
  // Check for exact matches or contains
  return ALL_INTENT_KEYWORDS.some(keyword => {
    const lower = keyword.toLowerCase();
    // For short keywords, require word boundary
    if (lower.length <= 3) {
      const regex = new RegExp(`\\b${lower}\\b`, 'i');
      return regex.test(lowerText);
    }
    return lowerText.includes(lower);
  });
}

/**
 * Extracts item numbers from user input
 * Handles: "1 ar 3", "1, 2", "১ আর ৩", "প্রথম আর তৃতীয়", "শুধু 2"
 * Returns array of 1-indexed item numbers or empty array if none found
 */
export function detectItemNumbers(text: string): number[] {
  const cleanText = text.toLowerCase().trim();
  const numbers: number[] = [];
  
  // Strategy 1: Extract Arabic numerals (1, 2, 3)
  const arabicMatches = cleanText.match(/\d+/g);
  if (arabicMatches) {
    arabicMatches.forEach(m => {
      const num = parseInt(m, 10);
      if (num >= 1 && num <= 10 && !numbers.includes(num)) {
        numbers.push(num);
      }
    });
  }
  
  // Strategy 2: Check for Bangla digits and words
  for (const [bangla, arabic] of Object.entries(BANGLA_TO_ARABIC)) {
    if (cleanText.includes(bangla.toLowerCase()) && !numbers.includes(arabic)) {
      numbers.push(arabic);
    }
  }
  
  // Sort and return unique numbers
  return [...new Set(numbers)].sort((a, b) => a - b);
}

/**
 * Checks if the input is asking for "only" or "just" specific items
 * e.g., "শুধু 2", "just 1", "only 3"
 */
export function detectOnlyIntent(text: string): boolean {
  const lowerText = text.toLowerCase().trim();
  return (
    lowerText.includes('শুধু') ||
    lowerText.includes('shudhu') ||
    lowerText.includes('only') ||
    lowerText.includes('just')
  );
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
  URGENCY_KEYWORDS,
  OBJECTION_KEYWORDS,
  SELLER_KEYWORDS,
};
