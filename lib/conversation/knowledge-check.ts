/**
 * Knowledge Check Module - AI Director 2.0
 * 
 * Pre-filters questions to determine if the AI has the knowledge to answer.
 * If not, flags for manual response without wasting an AI API call.
 * 
 * Cost Savings: Skip AI call entirely when we know we can't answer.
 */

import { WorkspaceSettings } from '@/lib/workspace/settings';

// ============================================
// TYPES
// ============================================

export interface KnowledgeCheckResult {
  hasKnowledge: boolean;
  source?: 'deliveryInfo' | 'returnPolicy' | 'paymentInfo' | 'sellerInfo' | 'products' | 'general';
  shouldFlag?: boolean;
  flagReason?: string;
}

// ============================================
// QUESTION DETECTION PATTERNS
// ============================================

const QUESTION_PATTERNS = {
  delivery: [
    'delivery', 'ডেলিভারি', 'কত দিন', 'কবে পাব', 'shipping', 'চার্জ',
    'কত টাকা লাগবে', 'পৌঁছাবে', 'কতদিন', 'দিন লাগবে', 'সময় লাগবে',
    'ডেলিভারী', 'কত টাকা', 'charge', 'কোথায় পাঠান', 'dhaka', 'ঢাকা',
    'বাইরে', 'outside'
  ],
  
  return: [
    'return', 'exchange', 'ফেরত', 'বদল', 'change', 'ফিরত',
    'বদলে দেবেন', 'ফেরত দিতে', 'চেঞ্জ', 'রিটার্ন', 'এক্সচেঞ্জ',
    'পছন্দ না হলে', 'সমস্যা হলে', 'ভাঙা', 'নষ্ট', 'damaged'
  ],
  
  payment: [
    'payment', 'bkash', 'nagad', 'পেমেন্ট', 'টাকা দিব', 'কাশ',
    'বিকাশ', 'নগদ', 'পে করব', 'pay', 'কিভাবে দিব', 'টাকা পাঠাব',
    'cod', 'ক্যাশ অন', 'হাতে দিব', 'নম্বর', 'number', 'কোন নম্বরে'
  ],
  
  warranty: [
    // English and common typos
    'warranty', 'warrenty', 'warenty', 'waranty', 'warrantly', 'warrantee',
    'guarantee', 'guaranty', 'guarante', 'gaurantee',
    // Bengali
    'গ্যারান্টি', 'ওয়ারেন্টি', 'ওয়ারেন্টী', 'গ্যারেন্টি',
    // Related questions
    'কত দিন থাকবে', 'লাইফটাইম', 'lifetime', 'কত বছর', 'years',
    // Direct questions
    'warranty ache', 'warranty aase', 'warranty ase', 'warranty ki'
  ],
  
  location: [
    'office', 'address', 'location', 'ঠিকানা', 'কোথায়', 'দোকান', 'shop',
    'অফিস', 'শোরুম', 'showroom', 'outlet', 'branch', 'কোন এলাকা',
    'যোগাযোগ', 'contact', 'ভিজিট', 'visit', 'আসতে পারি', 'দেখতে চাই'
  ],
  
  customization: [
    'customize', 'custom', 'কাস্টম', 'বানাতে', 'তৈরি করতে',
    'আমার মতো', 'my design', 'ডিজাইন করে', 'special order'
  ],
  
  complaint: [
    'complaint', 'অভিযোগ', 'সমস্যা হয়েছে', 'ঠিক হয়নি', 'কাজ করছে না',
    'খারাপ', 'bad experience', 'আগের অর্ডার', 'last order', 'গত বার'
  ],
  
  orderStatus: [
    'আমার অর্ডার', 'my order', 'order status', 'কোথায় আছে',
    'ট্র্যাক', 'track', 'কবে আসবে', 'shipped', 'dispatched'
  ]
};

// ============================================
// DEFAULT MESSAGES TO CHECK IF CONFIGURED
// ============================================

const DEFAULT_SELLER_INFO = "";

// ============================================
// HELPER FUNCTIONS
// ============================================

function containsPattern(message: string, patterns: string[]): boolean {
  const lowerMessage = message.toLowerCase();
  return patterns.some(pattern => lowerMessage.includes(pattern.toLowerCase()));
}

function isReturnPolicyConfigured(settings: WorkspaceSettings): boolean {
  // Check the Business Policies return_policy field (not the old Fast Lane template)
  const returnPolicy = settings.returnPolicy;
  return !!(returnPolicy && returnPolicy.trim() !== '');
}

function isSellerInfoConfigured(settings: WorkspaceSettings): boolean {
  const sellerInfo = settings.fastLaneMessages?.sellerInfo;
  return !!(sellerInfo && 
            sellerInfo.trim() !== '' && 
            sellerInfo !== DEFAULT_SELLER_INFO);
}

// ============================================
// MAIN KNOWLEDGE CHECK FUNCTION
// ============================================

/**
 * Checks if the AI has knowledge to answer a question.
 * Should be called BEFORE AI Director to save API costs.
 * 
 * @param message - The user's message
 * @param settings - Workspace settings containing configured knowledge
 * @returns KnowledgeCheckResult indicating if we can answer
 */
export function checkKnowledgeBoundary(
  message: string,
  settings: WorkspaceSettings
): KnowledgeCheckResult {

  // 1. Delivery questions - always have knowledge (charges are always configured)
  if (containsPattern(message, QUESTION_PATTERNS.delivery)) {
    return { hasKnowledge: true, source: 'deliveryInfo' };
  }

  // 2. Return/Exchange questions - always let AI Director handle
  // AI Director has the return policy in its knowledge base (from Business Policies).
  // If not configured, AI will say "এই বিষয়টা confirm করে বলছি" per the prompt.
  if (containsPattern(message, QUESTION_PATTERNS.return)) {
    return { hasKnowledge: true, source: 'returnPolicy' };
  }

  // 3. Payment questions - always have knowledge
  if (containsPattern(message, QUESTION_PATTERNS.payment)) {
    return { hasKnowledge: true, source: 'paymentInfo' };
  }

  // 4. Warranty questions - currently not in settings, always flag
  if (containsPattern(message, QUESTION_PATTERNS.warranty)) {
    return {
      hasKnowledge: false,
      shouldFlag: true,
      flagReason: 'Warranty question - warranty information not supported'
    };
  }

  // 5. Store location/contact questions - check if configured
  if (containsPattern(message, QUESTION_PATTERNS.location)) {
    if (isSellerInfoConfigured(settings)) {
      return { hasKnowledge: true, source: 'sellerInfo' };
    }
    return {
      hasKnowledge: false,
      shouldFlag: true,
      flagReason: 'Store location/contact question - not configured in AI Setup'
    };
  }

  // 6. Customization requests - always flag (not supported)
  if (containsPattern(message, QUESTION_PATTERNS.customization)) {
    return {
      hasKnowledge: false,
      shouldFlag: true,
      flagReason: 'Custom product request - not supported by bot'
    };
  }

  // 7. Complaints about past orders - always flag
  if (containsPattern(message, QUESTION_PATTERNS.complaint)) {
    return {
      hasKnowledge: false,
      shouldFlag: true,
      flagReason: 'Customer complaint - requires human attention'
    };
  }

  // 8. Order status queries - always flag (we could improve this later)
  if (containsPattern(message, QUESTION_PATTERNS.orderStatus)) {
    return {
      hasKnowledge: false,
      shouldFlag: true,
      flagReason: 'Order status query - requires manual lookup'
    };
  }

  // 9. Default: Has knowledge (let AI Director handle)
  // This includes product questions, greetings, confirmations, etc.
  return { hasKnowledge: true, source: 'general' };
}

/**
 * Quick check if a message is likely a question that needs knowledge check.
 * Use this as a fast pre-filter.
 */
export function isKnowledgeQuestion(message: string): boolean {
  const questionIndicators = [
    '?', 'কি', 'কত', 'কোথায়', 'কবে', 'কেন', 'কিভাবে',
    'আছে', 'পারি', 'পাব', 'দেবেন', 'করবেন', 'হবে',
    'how', 'what', 'where', 'when', 'why', 'can', 'do you'
  ];
  
  const lowerMessage = message.toLowerCase();
  return questionIndicators.some(indicator => lowerMessage.includes(indicator.toLowerCase()));
}

/**
 * Get the manual flag response message
 */
export function getManualFlagResponse(): string {
  return "আমরা খুব শীঘ্রই আপনাকে উত্তর দিব। সময় দেওয়ার জন্য ধন্যবাদ। 🙏";
}
