# Image Recognition Integration

> **Status:** Untouched — Preserved as-is.

The existing image recognition system works exceptionally well. It uses a 3-tier approach (Hash → Exact → OpenAI) and is heavily tied to the business model of customers sending product screenshots.

**We are not changing the image recognition API.**

This document explains how the *untouched* image recognition module plugs into the *new* single-agent architecture (Step 8 and Step 10).

## The Current Flow (orchestrator.ts)

1. Customer sends an image to Messenger.
2. Webhook fires `processMessage` with `input.imageUrl`.
3. Orchestrator calls `handleImageMessage`.
4. `handleImageMessage` sends a POST to `/api/image-recognition`.
5. The API returns a `match` (product ID, name, price, confidence, sizes, colors).
6. Orchestrator adds it to `context.pendingImages`.
7. **[OLD SYSTEM]** Orchestrator generates a hardcoded response ("ওহ দারুণ choice ভাইয়া! 🔥") and sets the state to `IDLE` or `SELECTING_CART_ITEMS`.

## The New Flow (Single Agent Integration)

Steps 1-6 remain exactly the same. We still call the same API and keep the 5-minute `pendingImages` batching window.

The change happens at Step 7. Instead of the orchestrator generating a hardcoded reply, it passes the structured JSON result directly into the agent's user prompt.

**How the Orchestrator prepares the prompt:**
```typescript
let messageContent = input.text || "[User submitted an image]";

if (input.imageUrl && recognitionResult?.success && recognitionResult.match) {
  messageContent += `\n\n[SYSTEM: IMAGE RECOGNITION RESULT]\n`;
  messageContent += `Product: ${recognitionResult.match.product.name}\n`;
  messageContent += `Price: ৳${recognitionResult.match.product.price}\n`;
  
  if (recognitionResult.match.product.sizes?.length) {
    messageContent += `Available Sizes: ${recognitionResult.match.product.sizes.join(', ')}\n`;
  }
  if (recognitionResult.match.product.colors?.length) {
    messageContent += `Available Colors: ${recognitionResult.match.product.colors.join(', ')}\n`;
  }
  
  messageContent += `\n[INSTRUCTION TO AGENT]: The user just sent a photo of this product. Acknowledge it naturally, act excited, and ask if they want to order it or need size/color details.`;
}
```

## Why this is better

1. **Natural conversation:** The agent sees exactly what the user sent a photo of, and can respond with the actual context of a fluid conversation. 
2. **Immediate negotiation:** If the user sends a photo of a ৳850 shirt and says "৬০০ টাকা হবে?", the agent sees the shirt details *and* the text simultaneously, and can negotiate immediately.
3. **No rigid states:** We no longer need the brittle `SELECTING_CART_ITEMS` state. If a user sends 3 photos, the agent can naturally ask "Do you want to order all 3 of these?" and call `add_to_cart` 3 times if they say yes.

## Implementation Details

- The code in `lib/image-recognition/` is strictly ignored in this refactor.
- When we rewrite `orchestrator.ts` in Step 10, the API call inside `handleImageMessage` will be preserved, but the `responseMessage` generation will be deleted in favor of injecting the result into the agent prompt.
