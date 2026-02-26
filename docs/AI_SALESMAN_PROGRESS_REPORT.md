# AI Salesman: Negotiation & Bulk Logic Progress Report

**Date:** January 25, 2026
**Status:** 90% logic Complete, 1 Critical Persistence Bug remaining.

## 🚀 Work Completed

### 1. Fixed AI Hallucination (Fake Features)
- **Problem:** AI was inventing features like "Premium Fabric", "Special Offer".
- **Fix:** Added **Rule #9** in `universal.ts`: *"NEVER INVENT product features - Only mention what's in the Product Description."*
- **Result:** AI now strictly sticks to provided data.

### 2. Implemented "Natural Negotiation"
- **Problem:** AI response was robotic and repetitive.
- **Fix:** Updated Prompt in `universal.ts` with "FOLLOW THE SPIRIT, NOT EXACT WORDS" instruction.
- **Result:** AI now varies responses naturally (e.g., "এই দামে কঠিন", "বাজেট কত বলুন?").

### 3. Fixed Negotiation State Tracking
- **Problem:** Logic handler wasn't aware of AI's verbal offers.
- **Fix:** Updated `salesman-core.ts` to regex-scrape price (`৳1100`) from AI's text response and update state even if intent wasn't explicitly NEGOTIATION.
- **Result:** System now tracks `aiLastOffer` (e.g., 1100) as a valid negotiated price.

### 4. Implemented "Best Price Wins" Logic (Bulk Orders)
- **Problem:** Bulk discount was sometimes worse than negotiated single-unit price.
- **Fix:** In `handleBulkQuery` (`handlers.ts`), added logic:
  ```typescript
  Final Price = MIN(
    Negotiated_Price * Qty, 
    Bulk_Discount_Price
  )
  ```
  Also added logic to accept `aiLastOffer` (Pending Offer) as a valid negotiated price if buying immediately.

### 5. Fixed Context Persistence (Partially)
- **Problem:** Negotiation state wasn't saving to DB.
- **Fix:** Updated `orchestrator.ts` to explicitly save `updatedContext` to Supabase after Intent Handler execution.

---

## 🐛 Current Critical Bug: "The Amnesia"

**Symptom:**
1. **Turn 1 (Negotiation):** AI says "1100 hobe".
   - System Logs: `Saving negotiated price: 1100` ✅
   - DB Save Log: `Saving Context Metadata: { negotiation: { currentPrice: 1100 } }` ✅
2. **Turn 2 (Bulk Order):** User says "5 ta nebo".
   - System Logs: `Loaded Context Metadata: { negotiation: undefined }` ❌
   - Result: Logic falls back to original price calculation.

**Diagnosis:**
Data is successfully writing to DB (confirmed by logs), but **failing to load** in the immediate next request.
- **Suspect 1:** Supabase Read/Write latency (Race condition).
- **Suspect 2:** Context merging logic in `intent/index.ts` might be stripping metadata structure improperly.

---

## 📝 Next Steps (For Next Session)

1. **Verify DB Load Logic:**
   - Check `orchestrator.ts` loading line `let { data: conversation } = ...`
   - Is it reading cached data?

2. **Check Context Structure:**
   - Ensure `intentResult.updatedContext` isn't accidentally overwriting the *entire* metadata object with partial data.

3. **Final Test:**
   - `1100 hobe?` -> AI: `Okay`
   - `5 ta den` -> System should calc: `1100 * 5 = 5500`.

---

## 📂 Key Files Modified
- `lib/ai/prompts/universal.ts` (Prompt Rules)
- `lib/ai/salesman-core.ts` (State Extraction)
- `lib/conversation/intent/handlers.ts` (Bulk Logic)
- `lib/conversation/orchestrator.ts` (DB Persistence)
