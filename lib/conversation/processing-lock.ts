/**
 * In-memory lock manager for conversation processing
 * Prevents race conditions between bot and owner replies
 * 
 * Note: For multi-instance deployments, migrate to Redis-based locking
 */

type LockType = 'bot_processing' | 'owner_sending' | 'general'

interface LockInfo {
  locked: boolean
  locked_at: number
  lock_type: LockType
  ttl: number // milliseconds
}

class ProcessingLockManager {
  private locks: Map<string, LockInfo> = new Map()
  private cleanupInterval: NodeJS.Timeout | null = null
  private readonly DEFAULT_TTL = 3000 // 3 seconds default
  private readonly CLEANUP_INTERVAL = 5000 // Run cleanup every 5 seconds

  constructor() {
    // Start periodic cleanup
    this.startCleanup()
  }

  /**
   * Acquire a lock on a conversation
   * @param conversationId - The conversation to lock
   * @param lockType - Type of lock (bot_processing, owner_sending)
   * @param ttl - Time to live in milliseconds (default: 10s)
   * @returns true if lock acquired, false if already locked
   */
  acquireLock(conversationId: string, lockType: LockType = 'general', ttl: number = this.DEFAULT_TTL): boolean {
    const existing = this.locks.get(conversationId)
    
    // Check if already locked and not expired
    if (existing && existing.locked) {
      const now = Date.now()
      const expiresAt = existing.locked_at + existing.ttl
      
      if (now < expiresAt) {
        console.log(`🔒 [LOCK] Cannot acquire lock for ${conversationId} - already locked by ${existing.lock_type}`)
        return false
      }
      
      // Lock expired, can acquire
      console.log(`🔓 [LOCK] Previous lock expired for ${conversationId}, acquiring new lock`)
    }

    this.locks.set(conversationId, {
      locked: true,
      locked_at: Date.now(),
      lock_type: lockType,
      ttl,
    })

    console.log(`🔒 [LOCK] Acquired ${lockType} lock for conversation ${conversationId} (TTL: ${ttl}ms)`)
    return true
  }

  /**
   * Acquire a database-level lock for cross-instance coordination (Vercel)
   * This prevents parallel webhooks for the same conversation from double-processing.
   */
  async acquireDbLock(supabase: any, conversationId: string, lockType: string = 'bot_processing', ttlSeconds: number = 15): Promise<boolean> {
    const lockId = `lock_${conversationId}`;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    
    // First, try to clean up any expired lock for this conversation
    try {
      await supabase
        .from('webhook_events')
        .delete()
        .eq('event_id', lockId)
        .eq('event_type', 'lock')
        .lt('processed_at', new Date().toISOString());
    } catch (e) {
      // Ignore cleanup errors
    }

    // Try to insert the lock
    const { error } = await supabase
      .from('webhook_events')
      .insert({
        event_id: lockId,
        event_type: 'lock',
        payload: { lock_type: lockType, acquired_at: new Date().toISOString() },
        processed_at: expiresAt // Overloading processed_at to mean "expires_at" for locks
      });

    if (error) {
      console.log(`🔒 [DB-LOCK] Could not acquire lock for ${conversationId} (likely already active)`);
      return false;
    }

    console.log(`🔒 [DB-LOCK] Acquired DB lock for conversation ${conversationId} (Expires: ${expiresAt})`);
    return true;
  }

  /**
   * Release a lock on a conversation
   * @param conversationId - The conversation to unlock
   */
  releaseLock(conversationId: string): void {
    const existing = this.locks.get(conversationId)
    
    if (existing) {
      const holdTime = Date.now() - existing.locked_at
      console.log(`🔓 [LOCK] Released lock for conversation ${conversationId} (held for ${holdTime}ms)`)
      this.locks.delete(conversationId)
    }
  }

  /**
   * Release a database-level lock
   */
  async releaseDbLock(supabase: any, conversationId: string): Promise<void> {
    const lockId = `lock_${conversationId}`;
    try {
      await supabase
        .from('webhook_events')
        .delete()
        .eq('event_id', lockId)
        .eq('event_type', 'lock');
      console.log(`🔓 [DB-LOCK] Released DB lock for conversation ${conversationId}`);
    } catch (e) {
      console.warn(`⚠️ [DB-LOCK] Failed to release DB lock for ${conversationId}:`, e);
    }
  }

  /**
   * Check if a conversation is currently locked
   * @param conversationId - The conversation to check
   * @returns Lock info if locked, null if not locked
   */
  isLocked(conversationId: string): LockInfo | null {
    const existing = this.locks.get(conversationId)
    
    if (!existing) {
      return null
    }

    // Check if expired
    const now = Date.now()
    const expiresAt = existing.locked_at + existing.ttl
    
    if (now >= expiresAt) {
      // Expired, clean up and return null
      this.locks.delete(conversationId)
      return null
    }

    return existing
  }

  /**
   * Check if locked by a specific type
   * @param conversationId - The conversation to check
   * @param lockType - The type of lock to check for
   * @returns true if locked by specified type
   */
  isLockedBy(conversationId: string, lockType: LockType): boolean {
    const lockInfo = this.isLocked(conversationId)
    return lockInfo !== null && lockInfo.lock_type === lockType
  }

  /**
   * Wait for a lock to be released
   * @param conversationId - The conversation to wait for
   * @param timeout - Maximum time to wait in milliseconds
   * @returns true if lock was released within timeout, false if timed out
   */
  async waitForLock(conversationId: string, timeout: number = 5000): Promise<boolean> {
    const startTime = Date.now()
    const checkInterval = 100 // Check every 100ms

    return new Promise((resolve) => {
      const check = () => {
        const elapsed = Date.now() - startTime
        
        if (elapsed >= timeout) {
          console.log(`⏰ [LOCK] Wait timeout for ${conversationId} after ${elapsed}ms`)
          resolve(false)
          return
        }

        if (!this.isLocked(conversationId)) {
          console.log(`✅ [LOCK] Lock released for ${conversationId} after ${elapsed}ms wait`)
          resolve(true)
          return
        }

        setTimeout(check, checkInterval)
      }

      check()
    })
  }

  /**
   * Get remaining time on a lock
   * @param conversationId - The conversation to check
   * @returns Remaining milliseconds, or 0 if not locked/expired
   */
  getRemainingTime(conversationId: string): number {
    const lockInfo = this.isLocked(conversationId)
    
    if (!lockInfo) {
      return 0
    }

    const expiresAt = lockInfo.locked_at + lockInfo.ttl
    const remaining = expiresAt - Date.now()
    
    return Math.max(0, remaining)
  }

  /**
   * Start periodic cleanup of expired locks
   */
  private startCleanup(): void {
    if (this.cleanupInterval) {
      return
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredLocks()
    }, this.CLEANUP_INTERVAL)

    // Ensure cleanup doesn't prevent process exit
    if (typeof this.cleanupInterval.unref === 'function') {
      this.cleanupInterval.unref()
    }
  }

  /**
   * Clean up all expired locks
   */
  private cleanupExpiredLocks(): void {
    const now = Date.now()
    let cleaned = 0

    for (const [conversationId, lockInfo] of this.locks.entries()) {
      const expiresAt = lockInfo.locked_at + lockInfo.ttl
      
      if (now >= expiresAt) {
        this.locks.delete(conversationId)
        cleaned++
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 [LOCK] Cleaned up ${cleaned} expired lock(s)`)
    }
  }

  /**
   * Stop the cleanup interval (for testing/shutdown)
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }

  /**
   * Get current lock count (for monitoring)
   */
  getLockCount(): number {
    return this.locks.size
  }

  /**
   * Clear all locks (for testing)
   */
  clearAll(): void {
    this.locks.clear()
    console.log('🧹 [LOCK] Cleared all locks')
  }
}

// Export singleton instance
export const processingLock = new ProcessingLockManager()

// Export class for testing
export { ProcessingLockManager }
export type { LockType, LockInfo }
