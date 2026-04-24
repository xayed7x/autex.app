/**
 * Message Debouncer — "Silence Timer"
 * 
 * Batches rapid-fire customer messages into a single AI processing call.
 * When a message arrives, a timer starts. If another message arrives before
 * the timer expires, it resets. Once the customer goes silent for the full
 * debounce window, all accumulated messages are processed as one batch.
 * 
 * Uses in-memory timers (same singleton pattern as processing-lock.ts).
 */

interface PendingProcess {
  timer: NodeJS.Timeout;
  callback: () => Promise<void>;
  messageCount: number;
  firstMessageAt: number;
}

const DEBOUNCE_MS = 10_000; // 10 seconds (middle of 8-12s range)

class MessageDebouncerManager {
  private pending: Map<string, PendingProcess> = new Map();

  /**
   * Schedule (or reschedule) debounced processing for a conversation.
   * If a timer already exists, it is reset with the updated callback.
   */
  scheduleProcessing(
    conversationId: string,
    callback: () => Promise<void>,
    debounceMs: number = DEBOUNCE_MS
  ): void {
    const existing = this.pending.get(conversationId);

    if (existing) {
      clearTimeout(existing.timer);
      existing.messageCount++;
      existing.callback = callback;
      existing.timer = setTimeout(() => this.fire(conversationId), debounceMs);
      console.log(
        `⏱️ [DEBOUNCE] Timer RESET for ${conversationId.slice(0, 8)}… ` +
        `(${existing.messageCount} messages buffered, waiting ${debounceMs}ms)`
      );
    } else {
      console.log(`⏱️ [DEBOUNCE] Timer STARTED for ${conversationId.slice(0, 8)}… (waiting ${debounceMs}ms)`);
      const timer = setTimeout(() => this.fire(conversationId), debounceMs);
      this.pending.set(conversationId, {
        timer,
        callback,
        messageCount: 1,
        firstMessageAt: Date.now(),
      });
    }
  }

  /**
   * Cancel any pending debounce for a conversation.
   * Used when the owner replies manually during the debounce window.
   */
  cancelProcessing(conversationId: string): void {
    const existing = this.pending.get(conversationId);
    if (existing) {
      clearTimeout(existing.timer);
      this.pending.delete(conversationId);
      console.log(`⏱️ [DEBOUNCE] Timer CANCELLED for ${conversationId.slice(0, 8)}…`);
    }
  }

  /**
   * Check if a conversation has a pending debounce timer.
   */
  isPending(conversationId: string): boolean {
    return this.pending.has(conversationId);
  }

  /**
   * Get the buffered message count for a pending debounce.
   */
  getPendingCount(conversationId: string): number {
    return this.pending.get(conversationId)?.messageCount || 0;
  }

  /**
   * Internal: fire the debounce callback.
   */
  private async fire(conversationId: string): Promise<void> {
    const pending = this.pending.get(conversationId);
    if (!pending) return;

    const totalWait = Date.now() - pending.firstMessageAt;
    console.log(
      `⏱️ [DEBOUNCE] Timer FIRED for ${conversationId.slice(0, 8)}… — ` +
      `${pending.messageCount} message(s) batched over ${totalWait}ms`
    );

    this.pending.delete(conversationId);

    try {
      await pending.callback();
    } catch (error) {
      console.error(`❌ [DEBOUNCE] Callback error for ${conversationId.slice(0, 8)}…:`, error);
    }
  }

  /** Clear all pending timers (for shutdown/testing). */
  clearAll(): void {
    for (const [, p] of this.pending) clearTimeout(p.timer);
    this.pending.clear();
    console.log('🧹 [DEBOUNCE] Cleared all pending timers');
  }
}

// Singleton
export const messageDebouncer = new MessageDebouncerManager();
export { MessageDebouncerManager };
