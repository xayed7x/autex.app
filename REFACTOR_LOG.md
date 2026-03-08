# Agentic Refactor — Progress Log

> Running documentation of every step in the AI architecture refactor.
> This file is the source of truth for what was built, why, and what changed.

---

## Step 1 — Database: Memory Summary Column
**Status:** ✅ Complete

**What was done:** Added two columns to the `conversations` table to support conversation history compression. `memory_summary` (TEXT) stores a condensed summary of older messages so full history doesn't need to be sent to the LLM. `memory_summarized_at` (TIMESTAMPTZ) tracks when summarization last ran, enabling Step 9 to decide whether re-summarization is needed without a separate counter.

**Design decisions:**
- Used `IF NOT EXISTS` to make the migration idempotent (safe to re-run).
- No index on these columns — they're only read when loading a specific conversation by primary key.
- Followed existing migration naming convention (`add_*.sql`).

**Files created:**
- `migrations/add_memory_summary.sql`

---

## Step 2 — Product RAG Search Function
**Status:** ✅ Complete

**What was done:** Built a token-efficient product retrieval function that wraps the existing `searchProductsByKeywordsWithScoring` from `lib/db/products.ts`. Instead of returning raw DB rows (~20 columns), it maps results to a compact `ProductSearchResult` type with only 9 fields: id, name, price, description (truncated to 120 chars), sizes, colors, stock, imageUrl, and pricingPolicy.

**Design decisions:**
- Reuses existing scored search logic (name ×3, search_keywords ×4, description ×2, category ×1) rather than duplicating DB queries.
- Description truncation breaks at word boundaries to avoid mid-word cuts.
- Never throws — all error paths return `{ success: false, products: [], message: "..." }`.
- `workspaceId` is required; missing workspace returns failure immediately without DB access.

**Files created:**
- `lib/ai/tools/search-products.ts`

---

## Step 3 — Tool Definitions + Executor
**Status:** ✅ Complete

**What was done:** Built the complete tool-calling infrastructure — OpenAI function schemas for all 9 tools and a dispatch router that executes them.

**`definitions.ts`** — 9 OpenAI `ChatCompletionTool` schemas:
| Tool | Purpose |
|---|---|
| `search_products` | RAG product search |
| `add_to_cart` | Add product with optional size/color |
| `remove_from_cart` | Remove by productId |
| `update_customer_info` | Name, phone (BD format), address |
| `save_order` | Finalize order (explicitly tells AI not to generate confirmation messages) |
| `flag_for_review` | Flag for manual owner attention |
| `check_stock` | Stock availability |
| `track_order` | Order status by phone |
| `calculate_delivery` | Delivery charge by address |

**`executor.ts`** — Full implementations for 8 tools, validated stub for `save_order`:
- **`ToolExecutionContext`** — Every tool receives workspaceId, settings, and conversationContext injected by orchestrator. AI never controls scope.
- **`ToolSideEffects`** — Clean separation: tools return a result (for AI) and side effects (for orchestrator to persist). Tools don't touch DB context directly.
- **`add_to_cart`** — Fetches full product from DB, validates existence and stock before adding. Loads pricing_policy. Resets negotiation metadata.
- **`update_customer_info`** — Validates BD phone format (`01[3-9]XXXXXXXX`), auto-calculates delivery charge on address update.
- **`save_order`** — Validated stub: checks all required fields, returns detailed missing-field errors. DB insert deferred to Step 4.
- **Exhaustive switch** — TypeScript compiler catches missing tool handlers at compile time.

**Failure behaviors defined:**
- `search_products`: returns empty list with message
- `add_to_cart`: returns error if product not found or out of stock
- `remove_from_cart`: returns error if product not in cart
- `update_customer_info`: returns validation error for invalid phone
- `flag_for_review`: logs to console if flagging fails, no customer-facing error
- `check_stock` / `track_order`: returns `{ found: false }` on no results
- `calculate_delivery`: always succeeds (uses default charge on error)

**Files created:**
- `lib/ai/tools/definitions.ts`
- `lib/ai/tools/executor.ts`
- `lib/ai/tools/index.ts` (barrel export)

---

## Step 4 — The `save_order` Tool (Critical)
**Status:** ✅ Complete

**What was done:** Built the complete order-saving tool, migrating all logic from `createOrderInDb` in `orchestrator.ts` into a standalone, testable module. The tool executes in 8 sequential phases.

**8 Phases:**
1. **Validation** — Checks cart (≥1 item, valid productId/price/quantity), customer name, phone (BD format `01[3-9]XXXXXXXX`), and address (≥10 chars). Returns structured missing-field errors so the AI can ask for each naturally.
2. **Floor Price Enforcement** — Server-side guardrail. If a negotiated price (`aiLastOffer`) is below the product's `pricing_policy.minPrice`, the order is rejected. This is the hard safety net even if the AI hallucinates a lower price.
3. **Stock Verification** — Real-time DB check before insert. Each cart item's requested quantity is checked against current `stock_quantity`. Prevents overselling.
4. **Subtotal Calculation** — Respects negotiated prices per product using `negotiation.productId` matching.
5. **Order Insert** — Inserts into `orders` table with all scoping fields (`workspace_id`, `fb_page_id`, `conversation_id`).
6. **Order Items Insert** — One row per cart item with effective price, size, color, product image.
7. **Stock Deduction** — Variant-aware: handles size×color combinations first, then size-only, then total stock fallback. Recalculates parent totals when deducting variant stock. Errors logged but don't fail the order.
8. **Success Response** — Returns `orderNumber`, `totalAmount`, side effects to clear cart/checkout/negotiation, and `shouldSendTransactionalMessages: true` flag for the orchestrator.

**Design decisions:**
- Validation happens in the tool executor (server-side), not in the AI prompt. The AI can call `save_order` optimistically — the tool will reject it with clear error data.
- `generateOrderNumber` is duplicated from `replies.ts` to avoid coupling to old code that will be deleted in Step 11.
- `failWithFlag` returns `{ shouldFlag: true }` in the result data so the orchestrator knows to also flag for manual review on unexpected errors.
- `fb_page_id` is cast to `String()` because the Supabase schema defines it as text.
- Column names matched to actual DB schema: `price`/`size`/`color`/`product_image` on order_items (not `product_price`/`selected_size`/`selected_color`/`product_image_url`).

**What was preserved from `createOrderInDb`:**
- Negotiated price logic (`aiLastOffer` with per-product matching)
- Variant stock deduction algorithm (3 priority levels)
- Legacy compatibility (`product_id` on orders table = first cart item)
- Payment last two digits, product variations JSON

**Files created/changed:**
- `lib/ai/tools/save-order.ts` [NEW] — 380+ lines, complete implementation
- `lib/ai/tools/executor.ts` [MODIFIED] — Replaced stub with delegation to `saveOrder()`
- `lib/ai/tools/index.ts` [MODIFIED] — Added `saveOrder` export

---

## Step 5 — Transactional Message Templates
**Status:** ✅ Complete

**What was done:** Created a standalone transactional message rendering module. This module produces the exact messages that get sent to customers after order events — the AI never generates these.

**3 messages preserved:**

| Message | Template Source | When Sent | Sent By |
|---|---|---|---|
| Order Confirmed | `settings.fastLaneMessages.orderConfirmed` | After `save_order` succeeds | Orchestrator |
| Payment Instructions | `settings.fastLaneMessages.paymentInstructions` | After order confirmed message | Orchestrator |
| Order Cancelled | `settings.fastLaneMessages.orderCancelled` | When customer cancels | Orchestrator |

**Placeholder replacement (7 placeholders):**
- `{deliveryCharge}` → Delivery charge amount
- `{totalAmount}` → Total order amount
- `{subtotal}` → Cart subtotal before delivery
- `{orderNumber}` → Generated order number
- `{name}` → Customer name
- `{itemCount}` → Number of items
- `{paymentNumber}` + `{{PAYMENT_DETAILS}}` → Built from enabled bkash/nagad numbers

**Design decisions:**
- `renderOrderConfirmationMessages()` returns both orderConfirmed and paymentInstructions as a single object. The orchestrator sends them sequentially via Facebook Messenger API.
- `paymentInstructions` returns `null` if no mobile payment methods (bkash/nagad) are enabled — indicating COD-only, so no payment instructions should be sent.
- Payment details are built dynamically from `settings.paymentMethods` — only enabled methods with configured numbers appear.
- Both `{paymentNumber}` and the legacy `{{PAYMENT_DETAILS}}` placeholder are replaced, ensuring compatibility with templates from both old and new configurations.
- Default templates are hardcoded as fallbacks in case `fastLaneMessages` is empty (matching the existing defaults in `settings.ts`).

**What was preserved:**
- All template text from `settings.ts` defaults (Bengali text, emojis, structure).
- The exact placeholder names used in existing workspace configurations.
- The pattern of building payment number strings from `bkash.number` / `nagad.number`.

**Files created/changed:**
- `lib/ai/tools/transactional-messages.ts` [NEW]
- `lib/ai/tools/index.ts` [MODIFIED] — Added transactional message exports

---

## Step 6 — Negotiation Rules Enforcement
**Status:** ✅ Complete

**What was done:** Built a two-layer negotiation enforcement system. Layer 1 (this step) is a dynamic system prompt builder that tells the AI its pricing boundaries. Layer 2 (Step 4) is the server-side hard floor in `save-order.ts` that rejects orders below `minPrice`.

**How the two layers work together:**

| Layer | File | What It Does | When It Runs |
|---|---|---|---|
| Prompt (soft) | `negotiation-rules.ts` | Tells AI: "your minimum for X is ৳Y, never reveal it" | Before every AI call (if cart has negotiable items) |
| Server (hard) | `save-order.ts` (`checkPriceFloors`) | Rejects order if `aiLastOffer < minPrice` | When `save_order` tool is called |

**What the prompt builder generates (example):**
```
=== NEGOTIATION RULES (STRICTLY FOLLOW) ===

You may negotiate prices with the customer. Follow these rules:
- Start by defending the listed price. Explain value before offering discounts.
- Concede gradually. Never jump straight to the minimum price.
- NEVER reveal the minimum price to the customer.
- If customer asks "last price", offer slightly above minimum (5-10%).

--- Red Polo T-Shirt ---
Listed price: ৳850
YOUR absolute minimum (NEVER go below, NEVER reveal): ৳680
Bulk discounts:
  - 3+ pieces: 10% off → ৳765/piece

=== END NEGOTIATION RULES ===
```

**Design decisions:**
- `buildNegotiationRules(cart)` returns `null` if no products are negotiable — the system prompt stays lean for non-negotiable conversations.
- Safety net for misconfigured products: if `isNegotiable` is true but `minPrice` is missing, defaults to 80% of listed price. This prevents the AI from accepting ৳1 offers.
- Bulk discount prices are pre-calculated (e.g., "৳765/piece") so the AI doesn't need to do math.
- The current `negotiation-handler.ts` (772 lines, 5-round framework) will be deleted in Step 11. In the new system, the AI handles conversation naturally — no rigid rounds.

**What this replaces:**
- `negotiation-handler.ts` — Pattern detection (`extractPriceOffer`, `isLastPriceQuery`), 5-round concession ladder (`calculateRound2Price` through `calculateFinalOffer`), all response builders. All of this is now handled by the AI conversationally, constrained only by the prompt rules and server floor.

**Files created/changed:**
- `lib/ai/tools/negotiation-rules.ts` [NEW]
- `lib/ai/tools/index.ts` [MODIFIED] — Added `buildNegotiationRules` export

---

## Step 7 — Image Recognition Integration (Verifying it stays untouched)
**Status:** ✅ Complete

**What was done:** Verified that the entire image recognition module in `lib/image-recognition/` and the `/api/image-recognition` route can remain **100% untouched**. Designed the injection mechanism for how the new agent will receive image data naturally.

**How it works in the single-agent architecture:**
1. User sends an image to Messenger
2. Webhook triggers `processMessage`
3. `handleImageMessage` is called (same as before)
4. It calls `/api/image-recognition` and creates a `pendingImages` entry (same as before)
5. **[NEW]** Instead of generating hardcoded responses (e.g., "ওহ দারুণ choice ভাইয়া!"), the orchestrator takes the structured JSON result and injects it directly into the agent's user prompt for that turn:

```text
[SYSTEM: IMAGE RECOGNITION RESULT]
Product: Red Polo T-Shirt
Price: ৳850
Available Sizes: S, M, L, XL
Available Colors: Red, Blue, Black

[INSTRUCTION]: The user just sent a photo of this product. Acknowledge it naturally, act excited, and ask if they want to order it or need size/color details.
```

**Why this design is superior:**
- The agent sees exactly what the user sent a photo of, allowing for natural conversation.
- If the user sends a photo of a shirt *and* text saying "৬০০ টাকা হবে?" in the same minute, the agent sees the shirt details and the text simultaneously and can negotiate immediately.
- We no longer need brittle state machines (like `SELECTING_CART_ITEMS`). If a user sends 3 photos, the agent can naturally ask "Do you want to order all 3 of these?" and call `add_to_cart` 3 times if they say yes.

**Files created/changed:**
- `IMAGE_RECOGNITION_PLAN.md` [NEW] — Documentation file detailing this exact flow.

---

## Step 8 — Single Agent Core & System Prompt
**Status:** ✅ Complete

**What was done:** Replaced the multi-layered intent system (`fast-lane.ts` + `ai-director.ts` + `salesman-core.ts`) with a single, elegant tool-calling loop. Built the core `runAgent()` function and its dynamic system prompt generator.

**Key Architecture Features:**
- **Model:** `gpt-4o-mini` with `tool_choice: 'auto'`.
- **Tool Loop:** Executes tools requested by the model in parallel, feeds results back, and loops until the model produces a final text response. Capped at a hard maximum of 5 loops to prevent infinite looping.
- **Context Preservation:** Side effects from tools (like `add_to_cart` updating the `context.cart`) are immediately synced into the `input.context` so subsequent tools in the *same* loop see the exact changes.
- **Image Integration:** Implemented the logic planned in Step 7. If `imageRecognitionResult` is present, it's injected directly into the user prompt as `[SYSTEM: IMAGE RECOGNITION RESULT]` followed by the product details.

**The System Prompt (Dynamic & Lean):**
The prompt is strictly under 100 lines base, with no hardcoded examples or rigid state descriptions. Built dynamically per turn:

1. **Persona (Meem):** Preserved exactly from `ai-director.ts`. Warm, friendly, Bangladeshi CS rep.
2. **Language Rules:** Explicit instruction to match user language (Bengali, Banglish, or English).
3. **Anti-Hallucination (Absolute Rule):** If feature/stock/policy is missing context, the agent MUST say "এই বিষয়টা আমি confirm করে জানাচ্ছি 😊" and immediately call `flag_for_review`.
4. **Order Sequence:** Instructed to collect Name → Phone → Address before calling `save_order`.
5. **Memory Summary (from Step 1):** Injected if present.
6. **Cart State:** Dynamically built string of current cart items, quantities, selected variants, and any collected customer info.
7. **Negotiation Rules (from Step 6):** Injected *only* if negotiable items are in the cart.

**What this replaces:**
- The entire `handleMessage` routing logic, intent classification, and hardcoded state transitions.

**Files created/changed:**
- `lib/ai/single-agent.ts` [NEW] — The core loop and prompt builder.
- `lib/ai/tools/index.ts` [MODIFIED] — Exported `runAgent`.

---

## Step 9 — Memory Summarization
**Status:** ✅ Complete

**What was done:** Built a synchronous memory manager to prevent context windows from growing infinitely and consuming massive LLM tokens. It compresses older messages while keeping the most recent ones intact for immediate context.

**How it works (`manageMemory` algorithm):**
1. Receives the full message array and the current DB summary string.
2. Checks if total messages > 10. If not, returns them as-is (no API call).
3. If > 10, it splits the array: 
   - `messagesToKeep`: The most recent 5 messages.
   - `messagesToSummarize`: All older messages.
4. It sends the `existingSummary` + `messagesToSummarize` to `gpt-4o-mini` with strict instructions to output a dense, factual, bulleted summary.
5. It overwrites the `memory_summary` and `memory_summarized_at` columns in the `conversations` table (which were added in Step 1).
6. Returns the `newSummary` and the 5 `messagesToKeep` to the orchestrator to pass to the agent.

**Critical Safety Guardrail:**
The entire process is wrapped in a `try/catch`. If Supabase goes down, or OpenAI times out, or the API key fails — the error is swallowed and logged, and the function gracefully falls back to returning the *full, uncompressed* array of messages. **The customer is never blocked.**

**Design decisions:**
- Runs synchronously before the agent call. This ensures the agent is guaranteed to see the summarized context if the array was large.
- We do *not* delete the raw old messages from the `messages` table in this function to avoid slow DB operations slowing down the chat. We just don't pass them to the LLM anymore.

**Files created/changed:**
- `lib/ai/memory-manager.ts` [NEW] — Standalone summarization module.

---

## Step 10 — Orchestrator Rewrite
**Status:** ✅ Complete

**What was done:** Completely ripped out the old intention-based pipeline (Fast Lane, AI Director, Salesman Core) inside `processMessage` and replaced it with a linear, resilient flow powered by the new Single Agent.

**How the new `processMessage` flow works:**
1. **Load Data:** Fetches Workspace Settings, `conversations` row, and all `messages` array from Supabase.
2. **Process Image:** If an image is attached, sends it to the existing `/api/image-recognition` endpoint (left untouched) and stores the parsed JSON result to be injected into the prompt.
3. **Memory Summarization:** Passes the full message array through `manageMemory()` (created in Step 9) which synchronously compresses old messages if > 10, returning an updated DB summary and the 5 most recent messages.
4. **Agent Call:** Builds the `AgentInput` containing the memory summary, the raw recent messages, the image context, the DB context, and settings. Calls `runAgent`.
5. **Transactional Messaging:** Checks if the agent loop successfully created an order by checking the mutated `context.metadata.latestOrderId` (which the `save_order` tool sets). If so, it synchronously generates the strict `orderConfirmed` and `paymentInstructions` template strings and appends them to the final LLM text response. **The agent itself never generates checkout summary tables or payment instructions.**
6. **Save & Send:** Updates `conversations` with the new context (and auto-flags if the agent returned `shouldFlag: true`). Runs `sendMessage` to FaceBook via Messenger API. Writes the bot's raw text to the `messages` table.

**Special requirements enforced:**
- The old files (`fast-lane.ts`, `ai-director.ts`, etc.) are *not* deleted yet. They are just bypassed by `orchestrator.ts`. (To be cleaned up in Step 11).
- `createOrderInDb` and `updateContextInDb` were intentionally kept as internal utilities inside `orchestrator.ts` since `save_order.ts` and the main loop rely on them.
- Workspace isolation is strictly enforced — `workspaceId` is read at the webhook layer and explicitly passed into `agentInput` and every tool context, making cross-tenant data leaks impossible.

**Files created/changed:**
- `lib/conversation/orchestrator.ts` [MODIFIED] — Replaced 1,800+ lines of intent matching with the single agent pipeline loop.
- `types/conversation.ts` [MODIFIED] - Added `latestOrderId` and `latestOrderNumber` to `ConversationMetadata` to fix type errors.

---

## Step 11 — API Cost Tracking Audit & Fix
**Status:** ✅ Complete

### 1. Audit Results
- **Is cost tracking being recorded?** Previously, only the total cost was saved without token metrics, and many new features (Single Agent, Summarizer) were completely untracked. Now, every OpenAI call is recorded with granular detail.
- **API Calls Tracked:** All calls in the active pipeline: `gpt-4o-mini` (Agent Response, Memory Summarization) and `gpt-4o` (Tier 3 Image Recognition).
- **Location of Calls:** 
  - `lib/ai/single-agent.ts`: Main conversation loops.
  - `lib/ai/memory-manager.ts`: Background summarization.
  - `lib/image-recognition/tier3.ts`: Advanced visual product matching.
- **Token Capture:** Captured via `completion.usage` object (Prompt, Completion, Total, and Cached tokens).
- **Database Storage:** Saved to the `api_usage` table (Enhanced with new columns).
- **Admin UI:** Fully updated. It no longer relies on hardcoded data. It shows real-time cost summaries, distribution charts, and a detailed "Recent API Calls" table with token counts and model info.

### 2. Implementation Details
- **Unified Tracker:** Created `lib/ai/usage-tracker.ts` as the single source of truth for pricing and logging.
- **OpenAI Pricing Updated:**
  - `gpt-4o-mini`: Input $0.15/1M, Cached $0.075/1M, Output $0.60/1M.
  - `gpt-4o`: Input $2.50/1M, Cached $1.25/1M, Output $10.00/1M.
- **Exchange Rate:** Centralized at ৳110 = $1 USD (displayed in Admin UI for transparency).
- **Resiliency:** Logging is fire-and-forget; if the usage database fails, the customer's message still goes through.

### 3. Files Created/Changed
- `lib/ai/usage-tracker.ts` [NEW] — Core logic for cost calculation and DB logging.
- `migrations/add_api_usage_metrics.sql` [NEW] — Migration to add token tracking columns.
- `lib/ai/single-agent.ts` [MODIFIED] — Integrated `logApiUsage`.
- `lib/ai/memory-manager.ts` [MODIFIED] — Integrated `logApiUsage`.
- `app/api/image-recognition/route.ts` [MODIFIED] — Replaced legacy tracking with the new unified system.
- `app/api/admin/costs/route.ts` [MODIFIED] — Refactored to aggregate new token metrics.
- `app/admin/costs/page.tsx` [MODIFIED] — Redesigned Admin dashboard with the new "Recent API Calls" table.
- `types/supabase.ts` [MODIFIED] — Updated types for the enhanced `api_usage` table.

---

## Step 12 - Wire Order Collection Settings Into Single Agent
**Status:** Complete

### Problem
single-agent.ts had hardcoded English instructions for collecting customer info (Name, Phone, Address), ignoring the business owner's workspace_settings. Behavior Rules toggles were hidden behind a Coming Soon badge.

### What Was Fixed

lib/ai/single-agent.ts:
- Removed hardcoded ORDER COLLECTION SEQUENCE block.
- Added buildOrderCollectionInstruction(settings, context) function:
  - Quick Form mode: Reads settings.quick_form_prompt verbatim, then appends size/color/quantity fields from the actual cart item, gated by behaviorRules.askSize.
  - Conversational mode: Injects productConfirm, nameCollected, phoneCollected templates from fastLaneMessages as numbered step instructions.

app/dashboard/ai-setup/page.tsx:
- Removed the fullscreen Coming Soon overlay from Behavior Rules section.
- Ask for Size/Color toggle: Now live and wired to askSize state (saved to DB).
- Check Stock Levels toggle: Now live and wired to showStock state.
- Multi-Product and Suggest Alternatives: Still show individual Soon badges as agent support is not built.

### Files Changed
- lib/ai/single-agent.ts [MODIFIED]
- app/dashboard/ai-setup/page.tsx [MODIFIED]

---

## Step 13 — Fix: Order Confirmation & Payment Flow (3 Critical Bugs)
**Status:** ✅ Complete

### Problem
The order confirmation and payment collection flow was completely broken in the new agent architecture:
1. **Transactional messages never fired** — save_order never set metadata.latestOrderId.
2. **No order summary before confirmation** — Agent jumped from address to save_order without a summary.
3. **No payment digit collection** — The COLLECTING_PAYMENT_DIGITS flow was never ported.

### Solution

**Bug 1:** save-order.ts now sets latestOrderId, latestOrderNumber, and latestOrderData in metadata. orchestrator.ts reads from latestOrderData (survives cart clearing) and sets awaitingPaymentDigits after sending the payment instructions.

**Bug 2:** single-agent.ts now injects a mandatory order summary template (product, name, phone, address, size, color, quantity, price, delivery, total) before save_order. Agent must WAIT for customer to confirm.

**Bug 3:** orchestrator.ts fast-path intercepts 2-digit messages before the agent, saves to DB, sends paymentReview template directly. collect_payment_digits tool added to definitions.ts and executor.ts as fallback. ConversationMetadata type extended.

### Files Changed
- types/conversation.ts [MODIFIED]
- lib/ai/tools/save-order.ts [MODIFIED]
- lib/ai/tools/definitions.ts [MODIFIED]
- lib/ai/tools/executor.ts [MODIFIED]
- lib/ai/single-agent.ts [MODIFIED]
- lib/conversation/orchestrator.ts [MODIFIED]

---

## Step 14 — Fix: save_order Insert Failure (payment_digits column missing)
**Status:** ✅ Complete

### Root Cause
The previous cleanup (Step 13, Bug 1) was too aggressive — it stripped ALL product columns from the orders insert, including legitimate ones like product_id, quantity, product_price, selected_size, selected_color that DO exist in the live DB.

It also added payment_digits (doesn't exist) and 	otal_price (doesn't exist) while keeping payment_last_two_digits (does exist). The Supabase PostgREST schema cache rejected the payload because payment_digits is not a column.

### Fix
- Rebuilt orderData to match the EXACT schema from schema.sql
- Restored: product_id, quantity, product_price, product_image_url, product_variations, selected_size, selected_color
- Removed: payment_digits, total_price (don't exist)
- Kept: payment_last_two_digits (exists in schema)
- Fixed fb_page_id: was being cast to String but DB expects bigint
- Fixed orchestrator fast-path: was using payment_digits, now uses payment_last_two_digits
- Added diagnostic logging for future debugging

### Files Changed
- lib/ai/tools/save-order.ts [MODIFIED]
- lib/conversation/orchestrator.ts [MODIFIED]

---

## Step 15 — AI-Judgment Based Flagging & Manual Mode
**Status:** ✅ Complete

### What was done:
- Removed hardcoded condition triggers (like "feature, fabric, stock", etc.) for flagging in `single-agent.ts`'s system prompt.
- Replaced with an AI-judgment based flagging system, clearly defining when it MUST flag (real-time info like delivery tracking, payment verification, etc. that requires external system access) and when it must NOT flag.
- Enforced a standard response phrase when flagging ("ভাইয়া, এই বিষয়টা আমি এখনই confirm করে জানাচ্ছি 😊 একটু অপেক্ষা করুন।").
- Updated `flag_for_review` tool in `executor.ts` to explicitly set `control_mode = 'manual'` on the conversation in the database, and added a clear alert log `🚨 [MANUAL FLAG] Reason: [reason] — Bot paused, owner notified`.
- Updated `orchestrator.ts` to check `control_mode` right after loading the conversation from the database. If it's `'manual'`, the orchestrator returns silently, halting any further AI agent processing.

### Files Changed
- `lib/ai/single-agent.ts` [MODIFIED]
- `lib/ai/tools/executor.ts` [MODIFIED]
- `lib/conversation/orchestrator.ts` [MODIFIED]

---

## Step 16 — Product Card Feature Restore
**Status:** ✅ Complete

### What was done:
- Reinstated the use of Facebook Messenger Generic Templates when products are identified via text search or image recognition.
- Updated `sendProductCard` and `sendProductCarousel` in `lib/facebook/messenger.ts` with explicit button payloads (`ORDER_NOW_{id}` and `VIEW_DETAILS_{id}`).
- Formatted subtitle to display dynamic sizes and colors.
- Modified `executeSearchProducts` in `executor.ts` to attach `identifiedProducts` to the `conversationContext.metadata`.
- Intercepted the AI's response in `orchestrator.ts` to append the product card/carousel *after* the bot sends its text response, ensuring a high-quality rich UI for the user.
- Updated the webhook listener in `route.ts` to listen for the `ORDER_NOW_` payloads strictly instead of the legacy `ORDER_PRODUCT_` keys.

### Files Changed
- `C:\Users\xayed\.gemini\antigravity\brain\b0f01155-8397-4ef0-b6f0-e842867d3fee\task.md` [MODIFIED]
- `lib/facebook/messenger.ts` [MODIFIED]
- `types/conversation.ts` [MODIFIED]
- `lib/ai/tools/executor.ts` [MODIFIED]
- `lib/conversation/orchestrator.ts` [MODIFIED]
- `app/api/webhooks/facebook/route.ts` [MODIFIED]

---

## Step 17 — AI Context Logging & Conversational Nuance
**Status:** ✅ Complete

### What was done:
- Added permanent `AGENT CONTEXT DUMP` block before the AI call in `single-agent.ts` to log the exact state (message, cart, customer, control mode, memory summary, contextual history, prompt size).
- Enhanced Context Dump to print actual memory summary string (up to 300 characters).
- Increased Context window logging limit to 150 characters per message and explicitly tagged `[IMAGE MESSAGE — recognition result: matched/unmatched]` to replace blank outputs.
- Added a `CONTEXT QUALITY` sanity checker analyzing:
    - Has product info
    - Has order history
    - Has customer name
    - Image context
    - Ambiguity risk (based on count of empty/short messages)
- Added permanent `AGENT DECISION` block after the AI call in `single-agent.ts` to log chosen tools, flagging state, response snippet, and loop count.
- Injected a `CONVERSATIONAL NUANCE (OKAY/Acknowledge)` rule into the system prompt. This forces the agent to reply with a simple acknowledgment ("জি ভাইয়া, আর কিছু লাগলে জানাবেন 😊") rather than initiating an order flow if the user simply says "ok" or "ঠিক আছে" after a delivery update or complaint resolution.

### Files Changed
- `lib/ai/single-agent.ts` [MODIFIED]

---

## Step 18 — Stock Management Rewrite
**Status:** ✅ Complete

### What was done:
- Audited the real database schema and discovered stock fields (`size_stock`, `variant_stock`) are arrays of objects, but updated `save-order.ts` to deduct reliably across both Array and Object notations anyway.
- Added explicit console logging (`📦 [STOCK DEDUCTION]`) for stock deduction directly inside `save-order.ts` with before/after context.
- Updated schema definitions for `check_stock` and `search_products` to accept `size` and `color` as optional parameters so the AI can verify specific variation stock. 
- Overhauled `executor.ts` handling of `searchProducts` and `checkStock` to dynamically filter variant stock quantities. It now specifically intercepts 0-stock values, logs `⚠️ [STOCK FILTER] Removed...`, and tags the product as `inStock: false`. 
- Modified `executeAddToCart` inside `executor.ts` to construct the `sizes` and `colors` arrays dynamically based precisely on positive variant stock. This automatically resolves the issue where Quick Forms displayed unavailable options.
- Appended a strict **OUT OF STOCK RULE** inside `single-agent.ts` system prompt prescribing the AI's exact response sequence when encountering an `inStock: false` return value.

### Files Changed
- `lib/ai/tools/definitions.ts` [MODIFIED]
- `lib/ai/tools/executor.ts` [MODIFIED]
- `lib/ai/tools/save-order.ts` [MODIFIED]
- `lib/ai/tools/search-products.ts` [MODIFIED]
- `lib/ai/single-agent.ts` [MODIFIED]

---

## Step 19 — Variant Stock Verification Hotfix
**Status:** ✅ Complete

### What was done:
- Fixed a bug where ordering an out-of-stock size+color combination would succeed if the product had stock in *other* variations.
- Updated `save-order.ts` to strictly verify the explicitly requested size and color against `variant_stock`. If the quantity is 0, the order is blocked with a specialized AI response: $\`"দুঃখিত, [size] সাইজে [color] কালার এখন স্টকে নেই..."\`$
- Added strict exact-quantity boundary inside `save-order.ts` (`"দুঃখিত, M সাইজে Red কালার মাত্র 9টি আছে। আপনি সর্বোচ্চ 9টি অর্ডার করতে পারবেন।"`)
- Implemented specific console logging (`🔍 [STOCK CHECK]`) to debug variant checking.
- Modified `executor.ts` to pass `variant_stock` into the `CartItem` context.
- Overhauled Quick Form builder inside `single-agent.ts`. Now, instead of blindly passing arrays of independent sizes and colors, the Quick Form explicitly generates a stock availability map showing exactly which colors are available for which size (e.g., `M → Red, Green`).
- Identical `variant_stock` explicit size/color map filtering has been added to `app/api/webhooks/facebook/route.ts` so the absolute *first* Quick Form thrown upon clicking `Order Now` on the Facebook Messenger generic template card immediately reflects accurate inventory.
- Changed `orchestrator.ts` Generic Template generation to also intercept and parse the raw `variant_stock` directly from the database row, hiding colors from the UI that have `0` stock across all size variations.
- Upgraded the `update_customer_info` tool in `definitions.ts` and `executor.ts` to permanently accept `size`, `color`, and `quantity` alongside the address fields, bringing the exact quantity stock-validation block from `save_order.ts` into the quick form parsing layer. The AI will now reject manual user inputs for out-of-stock variations *before* building the Order Summary.
- Patched `orchestrator.ts` to completely mute the AI agent's `finalResponse` whenever a `save_order` action succeeds. This terminates LLM hallucinated, duplicate confirmation messages and ensures only the exact `orderConfirmed` and `paymentInstructions` templates are delivered.

---

## Step 20 — Order Status Confirmations & Notifications
**Status:** ✅ Complete

### What was done:
- Added editable "Order Status Notifications" (`statusConfirmed`, `statusDelivered`, `statusCancelled`) templates to the AI Setup page in the dashboard.
- Modified the Supabase `orders` API `PATCH` endpoint (`app/api/orders/[id]/route.ts`) to intercept status changes (`completed`, `shipped`, `cancelled`).
- Integrated the Messenger API `sendMessage` directly into the order update API. The system now performs a join on the `conversations` table to retrieve `customer_psid` and maps dynamic variables (`{name}`, `{deliveryDays}`, `{orderNumber}`) into the saved workspace templates.
- Saved these sent messages into the `messages` table with `sender_type: 'automated'` to prevent them from triggering the "manual" mode pause logic on the AI.
- Updated the Orders dashboard UI (`app/dashboard/orders/page.tsx`) to include a "Shipped" tab trigger and added a "Mark Delivered" action button in the dropdown menu for completed orders.
