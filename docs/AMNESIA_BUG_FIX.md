# 🧠 The Amnesia Bug — Complete Fix Documentation

**Date:** February 25, 2026  
**Files Modified:** `orchestrator.ts`, `fast-lane.ts`, `handlers.ts`, `keywords.ts`  
**Status:** ✅ Fixed

---

## Executive Summary

The "Amnesia Bug" was **6 interconnected problems** that caused the AI chatbot to lose all memory between conversation turns — negotiated prices, customer names, phone numbers, and conversation state. Every Supabase `.update()` call was silently failing because of a non-existent `updated_at` column, which masked all the other fixes from taking effect.

---

## 🔴 Root Cause: `updated_at` Column (PGRST204)

**The single biggest issue.** Every DB save in `orchestrator.ts` included `updated_at: new Date().toISOString()` in the update payload. The `conversations` table does **not** have an `updated_at` column. This caused Supabase PostgREST to reject the entire update with error `PGRST204` — silently, because the error was never checked.

### Impact
- `current_state` never persisted → state transitions lost between turns
- `context` never persisted → negotiation data, customer info, cart all lost
- Every other fix in this session was invisible until this was resolved

### Fix
```diff
# orchestrator.ts — ALL 3 update calls
  await supabase.from('conversations').update({
    current_state: newState,
    context: contextToSave,
-   updated_at: new Date().toISOString(),
- })
+ } as any)
  .eq('id', input.conversationId);
```

The `as any` cast also resolves TypeScript lint errors from outdated Supabase types that don't include `current_state` or `context` columns.

---

## 🔴 Problem 1: Shallow Context Merge (The Original Amnesia)

**File:** `orchestrator.ts`

### What Was Happening
Context was merged with shallow spread `{ ...base, ...updates }`. When a handler returned partial context like `{ checkout: { customerAddress: '...' } }`, it **replaced the entire `checkout` object** — wiping `customerName` and `customerPhone`. Same for `metadata.negotiation`.

### Fix
Created `deepMergeContext()` helper:

```typescript
function deepMergeContext(base, updates) {
  return {
    ...base,
    ...updates,
    checkout: {
      ...(base.checkout || {}),
      ...(updates.checkout || {}),
    },
    metadata: {
      ...(base.metadata || {}),
      ...(updates.metadata || {}),
      negotiation: (updates.metadata?.negotiation !== undefined)
        ? updates.metadata.negotiation
        : base.metadata?.negotiation,
    },
    cart: updates.cart !== undefined ? updates.cart : base.cart,
  };
}
```

Applied at both merge sites:
- Intent handler path (line ~406)
- AI Director's `executeDecision` (line ~696)

---

## 🔴 Problem 2: AI Director Sets Wrong State for Quick Form

**File:** `orchestrator.ts`

### What Was Happening
After AI-driven negotiation, when the customer says "yes", the AI Director transitions to `COLLECTING_NAME` — it doesn't know about the workspace's `order_collection_style` setting. The response **looks** like a quick form prompt ("নাম, ফোন, ঠিকানা দিন"), but the **state** is `COLLECTING_NAME`. Next turn, `handleCollectingName()` only captures the first line as a name.

### Fix
Added **Quick Form Override** in `executeDecision()`:

```typescript
if (newState === 'COLLECTING_NAME' && settings?.order_collection_style === 'quick_form') {
  newState = 'AWAITING_CUSTOMER_DETAILS';
  response = quickFormPrompt; // with size/color fields from product
}
```

---

## 🔴 Problem 3: `tryFastLane()` Never Called

**File:** `orchestrator.ts`

### What Was Happening
`tryFastLane()` was imported but **never called**. All messages went through `processWithIntent()` which classifies by content, not state. Quick form data like "Zayed Bin Hamid\n01915969330\n..." was classified as `PROVIDE_NAME` → conversational flow.

### Fix
Added **state-first routing** before intent classification:

```typescript
const STATE_DRIVEN_STATES = [
  'AWAITING_CUSTOMER_DETAILS', 'COLLECTING_MULTI_VARIATIONS',
  'COLLECTING_NAME', 'COLLECTING_PHONE', 'COLLECTING_ADDRESS',
  'CONFIRMING_ORDER', 'CONFIRMING_PRODUCT', 'SELECTING_CART_ITEMS',
  'COLLECTING_PAYMENT_DIGITS',
];

if (STATE_DRIVEN_STATES.includes(currentState)) {
  const fastLaneResult = tryFastLane(input, currentState, context, settings);
  if (fastLaneResult.matched) {
    // Handle and return early
  }
  // Otherwise fall through to intent classification
}
```

---

## 🔴 Problem 4: Smart Fallback for State Save Failures

**File:** `orchestrator.ts`

### What Was Happening
Even after fixing the save issue, there could be edge cases where the state save fails silently (race conditions, network issues). Multi-line form data would then arrive in `CONFIRMING_PRODUCT` state and be misclassified.

### Fix
Added **Smart Fallback**: when Fast Lane doesn't match in `CONFIRMING_PRODUCT` but the message is multi-line with a phone pattern and quick_form mode is configured:

```typescript
const isQuickFormMode = settings?.order_collection_style === 'quick_form';
const hasMultipleLines = input.includes('\n') && input.split('\n').length >= 3;
const hasPhonePattern = /01[3-9]\d{8}/.test(input);

if (isQuickFormMode && hasMultipleLines && hasPhonePattern && hasCartItems) {
  // Redirect to handleAwaitingCustomerDetails directly
}
```

---

## 🔴 Problem 5: Negotiated Price Never Stored in Metadata

**File:** `fast-lane.ts`

### What Was Happening
The Fast Lane negotiation handler (both `handleGlobalInterruption` and `handleConfirmingProduct`) stored the counter-offer only in the **response text** and optionally in the cart price — but **never in `metadata.negotiation`**. The `getEffectivePrice()` function checked `metadata.negotiation.aiLastOffer` which was always empty.

### Fix
Both negotiation return paths now store negotiation state:

```typescript
updatedContext: {
  ...context,
  state: newState,
  cart: updatedCart,
  metadata: {
    ...(context.metadata || {}),
    negotiation: {
      ...(context.metadata?.negotiation || {}),
      aiLastOffer: negotiationResult.newPrice || existing,
      status: action === 'ACCEPT' ? 'accepted' : 'in_progress',
    },
  },
}
```

---

## 🔴 Problem 6: `getEffectivePrice()` + Order DB Price

**Files:** `fast-lane.ts`, `orchestrator.ts`, `handlers.ts`

### What Was Happening
- `generateOrderSummary()` and `calculateCartTotal()` used `item.productPrice` (base price)
- `createOrderInDb()` used `item.productPrice` for both `orders` and `order_items` tables
- The dashboard always showed base price, not negotiated price

### Fix

**a) `getEffectivePrice()` helper in `fast-lane.ts`:**
```typescript
function getEffectivePrice(item, context) {
  const negotiatedPrice = context.metadata?.negotiation?.aiLastOffer;
  return negotiatedPrice || item.productPrice;
}
```
Updated `generateOrderSummary()` and `calculateCartTotal()` to use it.

**b) `createOrderInDb()` in `orchestrator.ts`:**
```typescript
const negotiatedPrice = context.metadata?.negotiation?.aiLastOffer;
const subtotal = cart.reduce((sum, item) => {
  const effectivePrice = negotiatedPrice || item.productPrice;
  return sum + (effectivePrice * item.quantity);
}, 0);
```
Also applied to `order_items.product_price` and `order_items.subtotal`.

**c) `handleProvideAddress()` in `handlers.ts`:**
Updated order summary to check `metadata.negotiation.aiLastOffer`.

---

## 🟡 Problem 7: Keyword System False Positives

**Files:** `fast-lane.ts`, `keywords.ts`

### What Was Happening
Broad keyword lists (`PRICE_KEYWORDS`, `SIZE_KEYWORDS`, `DETAILS_KEYWORDS`) were intercepting:
- Negotiation messages: "price aktu besi hoia jasse" → product card
- Quick form data: "M" (SIZE keyword), "Blue" (DETAILS keyword) → product card
- Price objections: "dam besi" → product card instead of AI handling

### Fix

**a) Disabled global keyword interruptions** in `handleGlobalInterruption()`:
After the negotiation regex handler (which is accurate), added `return null` to skip all keyword-based checks. Only the negotiation regex patterns are preserved.

**b) Removed `PRICE_KEYWORDS` from `isDetailsRequest()`** in `keywords.ts`.

**c) Removed the `isDetailsRequest()` check** from `handleConfirmingProduct()`.

---

## 🟡 Problem 8: Payment Template Placeholders

**File:** `orchestrator.ts`

### What Was Happening
Payment confirmation showed raw placeholders: `৳{totalAmount}` and `{{PAYMENT_DETAILS}}`.
The orchestrator replaced `{{PAYMENT_DETAILS}}` but not `{totalAmount}`.

### Fix
Added `{totalAmount}` replacement in the same block, calculating the total using negotiated price:

```typescript
response = response
  .replace('{{PAYMENT_DETAILS}}', paymentDetails)
  .replace('{totalAmount}', totalAmountCalc.toString());
```

---

## Files Changed Summary

| File | Changes |
|------|---------|
| `orchestrator.ts` | `deepMergeContext()`, state-first routing, quick form override, smart fallback, DB error checking, removed `updated_at`, negotiated price in `createOrderInDb`, payment placeholder fix |
| `fast-lane.ts` | `getEffectivePrice()`, `metadata.negotiation` storage in both negotiation paths, disabled keyword interruptions, removed `isDetailsRequest` from `handleConfirmingProduct` |
| `handlers.ts` | Negotiated price in `handleProvideAddress()` |
| `keywords.ts` | Removed `PRICE_KEYWORDS` from `isDetailsRequest()`, cleaned `DETAILS_KEYWORDS` |

---

## Post-Fix Checklist

- [x] Remove `updated_at` from all Supabase update calls
- [x] Run `NOTIFY pgrst, 'reload schema'` in Supabase SQL editor
- [x] Test full negotiation → order flow
- [x] Verify order appears in dashboard with negotiated price
- [x] Verify payment message shows real amounts and payment details
- [ ] *(Optional)* Regenerate Supabase types with `npx supabase gen types typescript` to add `current_state` and `context` columns to TypeScript types
