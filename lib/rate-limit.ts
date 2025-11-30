/**
 * API Rate Limiting
 * Prevents API abuse by limiting requests per user
 * 100 requests per minute per user
 */

import { LRUCache } from 'lru-cache';

// Rate limit configuration
const rateLimit = new LRUCache<string, number>({
  max: 500, // Track up to 500 unique identifiers
  ttl: 60000, // 1 minute window
  updateAgeOnGet: false,
  updateAgeOnHas: false,
});

/**
 * Check if a request should be rate limited
 * 
 * @param identifier - Unique identifier (user ID, IP address, etc.)
 * @param limit - Maximum requests allowed per window (default: 100)
 * @returns true if request is allowed, false if rate limited
 */
export function checkRateLimit(
  identifier: string, 
  limit: number = 100
): boolean {
  const tokenCount = rateLimit.get(identifier) || 0;
  
  if (tokenCount >= limit) {
    console.warn(`⚠️ Rate limit exceeded for: ${identifier} (${tokenCount}/${limit})`);
    return false; // Rate limited
  }
  
  // Increment counter
  rateLimit.set(identifier, tokenCount + 1);
  
  return true; // Allowed
}

/**
 * Get current rate limit status for an identifier
 * Useful for debugging and monitoring
 * 
 * @param identifier - Unique identifier
 * @returns Current request count and limit
 */
export function getRateLimitStatus(identifier: string) {
  const count = rateLimit.get(identifier) || 0;
  
  return {
    identifier,
    currentCount: count,
    limit: 100,
    remaining: Math.max(0, 100 - count),
    resetIn: 60, // seconds
  };
}

/**
 * Reset rate limit for an identifier
 * Useful for testing or manual overrides
 * 
 * @param identifier - Unique identifier
 */
export function resetRateLimit(identifier: string): void {
  rateLimit.delete(identifier);
  console.log(`🔄 Reset rate limit for: ${identifier}`);
}

/**
 * Clear all rate limits
 * Useful for testing
 */
export function clearAllRateLimits(): void {
  rateLimit.clear();
  console.log('🗑️ Cleared all rate limits');
}

/**
 * Get rate limit cache statistics
 * Useful for monitoring
 */
export function getRateLimitStats() {
  return {
    size: rateLimit.size,
    maxSize: rateLimit.max,
    ttl: rateLimit.ttl,
  };
}
