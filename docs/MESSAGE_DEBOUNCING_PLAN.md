# Message Debouncing & Intent Batching Strategy

## Problem Statement
Customers often send messages in rapid succession (bursts/chunks).
- Example: "Hi" -> [Image] -> "How much?" -> "1 pound?"
Current behavior: The AI processes each message individually, leading to:
1. Fragmented responses (bot replies multiple times).
2. Redundant API costs.
3. Potential race conditions in database updates.

## Proposed Solution: The "Silence Timer"
Implement a debouncing mechanism at the webhook layer to group related messages into a single AI turn.

### Workflow
1. **Webhook Ingestion**: When a message arrives, it is saved to the database immediately.
2. **Scheduling**: Instead of triggering the AI, the system schedules a delayed execution job (e.g., 8-12 seconds).
3. **Debounce/Reset**: If a new message arrives from the same PSID during the wait period, the previous job is cancelled/updated, and the timer resets.
4. **Batch Processing**: Once the timer expires (the customer has stopped typing), the background worker retrieves ALL messages from the current "burst window" and sends them to the AI as a single, multi-intent prompt.

## Technical Requirements
- **Queue/Worker System**: Since Next.js is serverless, we need a durable task queue like **Inngest** or **Upstash QStash**.
- **State Management**: A way to track if a conversation is currently in "Debounce Mode" to prevent parallel bot replies.

## Expected Benefits
- **Contextual Accuracy**: The AI sees the full request (Image + Questions) at once, leading to perfect decision-making.
- **Cost Efficiency**: Reduces LLM token usage by up to 60-70% in bursty conversations.
- **Natural UX**: The bot feels like it is "listening" and waits for the customer to finish their thought.
