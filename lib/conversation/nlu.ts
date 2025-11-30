/**
 * Natural Language Understanding (NLU) for conversation bot
 * Handles intent detection and validation in both Bangla and English
 */

export type Intent = 'POSITIVE' | 'NEGATIVE' | 'UNKNOWN';

/**
 * Detects user intent from text message
 * Supports both Bangla and English keywords
 * 
 * @param text - User's message text
 * @returns Intent classification
 */
export function detectIntent(text: string): Intent {
  // Normalize: lowercase and trim whitespace
  const normalized = text.toLowerCase().trim();

  // POSITIVE keywords (Bangla + English)
  const positiveKeywords = [
    // English
    'yes', 'yep', 'yeah', 'yup', 'ok', 'okay', 'sure', 'confirm', 'right', 
    'correct', 'good', 'fine', 'proceed', 'continue', 'accept', 'agree',
    // Bangla (phonetic) - CRITICAL: Include all variations
    'ji', 'jii', 'hae', 'haan', 'ha', 'hum', 'humm', 'thik ase', 'thik', 
    'ase', 'hobe', 'chai', 'chae',
    // Bangla (Unicode)
    'হ্যাঁ', 'জি', 'ঠিক আছে', 'ঠিক', 'আছে', 'হবে', 'চাই', 'সঠিক',
  ];

  // NEGATIVE keywords (Bangla + English)
  const negativeKeywords = [
    // English
    'no', 'nope', 'nah', 'cancel', 'wrong', 'incorrect', 'stop', 'decline',
    'reject', 'not',
    // Bangla (phonetic)
    'na', 'naa', 'nai', 'nahi', 'vul', 'cancel', 'lagbe na', 'chai na',
    // Bangla (Unicode)
    'না', 'নাই', 'ভুল', 'বাতিল', 'লাগবে না', 'চাই না',
  ];

  // Check for positive intent (exact match or contains)
  for (const keyword of positiveKeywords) {
    // Exact match (for short words like "ji", "ok")
    if (normalized === keyword) {
      return 'POSITIVE';
    }
    // Contains match (for phrases)
    if (normalized.includes(keyword)) {
      return 'POSITIVE';
    }
  }

  // Check for negative intent
  for (const keyword of negativeKeywords) {
    if (normalized === keyword || normalized.includes(keyword)) {
      return 'NEGATIVE';
    }
  }

  return 'UNKNOWN';
}

/**
 * Checks if an address is in Dhaka
 * Used to determine delivery charge
 * 
 * @param address - Full address string
 * @returns true if address contains Dhaka
 */
export function isDhaka(address: string): boolean {
  const normalized = address.toLowerCase().trim();
  
  const dhakaKeywords = [
    'dhaka',
    'ঢাকা',
    'dhanmondi',
    'gulshan',
    'banani',
    'mirpur',
    'uttara',
    'mohakhali',
    'farmgate',
    'tejgaon',
    'badda',
    'rampura',
    'khilgaon',
    'malibagh',
    'shahbag',
    'paltan',
    'motijheel',
    'kamrangirchar',
    'lalbagh',
    'old dhaka',
  ];

  for (const keyword of dhakaKeywords) {
    if (normalized.includes(keyword)) {
      return true;
    }
  }

  return false;
}

/**
 * Validates Bangladesh phone number
 * Accepts 11 digits starting with 01
 * 
 * @param phone - Phone number string
 * @returns true if valid Bangladesh phone number
 */
export function isValidPhone(phone: string): boolean {
  // Remove spaces, dashes, and +88
  const cleaned = phone.replace(/[\s\-+]/g, '');
  
  // Remove country code if present
  const normalized = cleaned.startsWith('88') ? cleaned.substring(2) : cleaned;
  
  // Check if it's 11 digits starting with 01
  const phoneRegex = /^01[0-9]{9}$/;
  return phoneRegex.test(normalized);
}

/**
 * Normalizes phone number to standard format (01XXXXXXXXX)
 * 
 * @param phone - Phone number string
 * @returns Normalized phone number
 */
export function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-+]/g, '');
  const normalized = cleaned.startsWith('88') ? cleaned.substring(2) : cleaned;
  return normalized;
}

/**
 * Extracts name from text (simple heuristic)
 * Removes common prefixes and cleans the input
 * 
 * @param text - User's message
 * @returns Cleaned name
 */
export function extractName(text: string): string {
  // Remove common prefixes
  const prefixes = ['my name is', 'i am', 'this is', 'আমার নাম', 'আমি'];
  let cleaned = text.trim();
  
  for (const prefix of prefixes) {
    const regex = new RegExp(`^${prefix}\\s*`, 'i');
    cleaned = cleaned.replace(regex, '');
  }
  
  // Capitalize first letter of each word
  return cleaned
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
    .trim();
}
