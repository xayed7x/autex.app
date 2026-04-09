# AI Agent Architecture (`single-agent.ts`)

**Purpose of this file:**
This document serves as the source of truth for the core AI Agent logic. Whenever an AI assistant is asked to modify or debug `single-agent.ts`, they MUST read this file first to understand the current architecture, existing constraints, and recent updates.

---

## 🏗️ The 7-Block System Prompt Architecture

The system prompt generation function (`generateSystemPrompt`) is strictly engineered into a 7-block structure to maximize OpenAI's prompt caching and eliminate repetitive context regeneration.

1. **[BLOCK 1 - IDENTITY]**
   - **Role:** Meem (Real human sales rep).
   - **Tone & Language:** Professional/Casual depending on workspace settings. Bengali/English ratio is controlled via settings.
   - **Rules:** Never use "ভাইয়া", "আপু", "অবশ্যই", "দারুণ প্রশ্ন". Only address users as "Sir" or "Ma'am".

2. **[BLOCK 2 - THINKING PROTOCOL]**
   - **Protocol:** The agent must analyze the customer's request step-by-step using a mandatory `[THINK]...[/THINK]` block using an exact format list: `INTENTS, MONEY/DATA CHECK, CART STATE, MEMORY, DECISION, ASSUMPTION CHECK`.
   - **Enforcement:** This block must be generated first before answering the customer.

3. **[BLOCK 3 - ABSOLUTE RULES]**
   - **Zero Hallucinations:** Real-time data (stock, prices, delivery) must explicitly originate from tool calls, never from memory.
   - **Zero Assumptions:** AI is forbidden from picking default sizes/colors if not specified.
   - **Negative Response Logic:** Immediate order flow termination if the user says 'na', 'nah', or 'thak'.

4. **[BLOCK 4 - TOOL USAGE GUIDE]**
   - **Product Card Triggering (Opt-in UI):** `sendCard` is strictly **DEFAULT FALSE**. Cards must only trigger on first discovery. Follow-up checks (like checking sizes via `check_stock` or `search_products`) **must never** send duplicate cards.
   - **Tool Failure Gracefulness:** 
     - If `update_customer_info` fails (e.g., invalid phone), the AI must politely ask the customer for correct info instead of flagging.
     - For all other tools, `success: false` triggers an immediate `flag_for_review` for manual owner intervention.

5. **[BLOCK 5 - ORDER FLOW]**
   - **Dynamic Workflows:** Handles either "Conversational" flow (step-by-step) or "Quick Form" based on workspace settings.
   - **Pre-requisite Validation:** Agent must explicitly check Cartesian state, fetch missing attributes, and run `check_stock` BEFORE saving the order.

6. **[BLOCK 6 - STATIC SETTINGS]**
   - Injects available payment methods (Cod, bKash, Nagad) and delivery times statically so no tools need to be called for static FAQs.

7. **[BLOCK 7 - DYNAMIC STATE]**
   - **Caching Optimization:** All highly dynamic elements (Cart State, Context Metadata, Conversation Memory Summary, Customer address) are injected securely into the very last block. This prevents token thrashing at the top of the prompt and preserves OpenAI caching over long sessions.

---

## 📋 Changelog & Recent Fixes

### Update (April 2026) - 7-Block Refactoring
- **Issue:** System was previously encountering 28-second OpenAI timeouts, redundant rule parsing, and contradictions (e.g. AI was outputting "ভাইয়া" unexpectedly). 
- **Fixes Implemented:**
  - Standardized the 7-block architecture to leverage prompt caching.
  - Stripped out all hardcoded explicit and implicit references to "ভাইয়া" replacing them with "Sir".
  - De-duplicated the "Out of stock" and "Voice message" instructions to run exactly once for token efficiency.
  - Overhauled tool error handling to prevent aggressive, unnecessary tool flagging when users input invalid phone numbers.
  - Separated `<Block 5>` logic directly from real-time customer/cart context, ensuring that conversational logic vs. quick form logic acts dynamically via `settings` only, rather than `context`. 

---

## ❌ Forbidden Actions for Future Development
1. **Never Inject Dynamic User Content Early:** Do not inject customer names or cart variables into Block 1 through 6. All dynamic, per-message user content belongs in Block 7.
2. **Never Weaken the `[THINK]` Block:** The mandatory format protocol is essential for deterministic reasoning boundaries. Do not remove safety checks around assumptions.
3. **Never Allow AI to Explain Tool Failures:** If a tool ungracefully fails outside of input errors (like phone numbers), the AI must invoke the manual flag and say exactly: "এই বিষয়টা আমাদের team দেখবে, শীঘ্রই জানানো হবে 😊". Explain NOTHING else.
