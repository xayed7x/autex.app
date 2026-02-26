# AI Salesman Core - Implementation Guide

> **Vision:** The World's Best AI Salesman Platform — not just a discount bot, but a complete Premium Sales Agent.

---

## 🏗️ Architecture Overview

```
┌────────────────────────────────────────────────────────────────┐
│                     AI SALESMAN CORE                           │
├────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────┐ │
│  │        LAYER 1: UNIVERSAL PROMPT (Foundation)            │ │
│  │  ✓ Premium Salesman Personality                          │ │
│  │  ✓ Sales Psychology (AIDA, Objection Handling)           │ │
│  │  ✓ Ethical Boundaries                                    │ │
│  └──────────────────────────────────────────────────────────┘ │
│                              ▼                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │        LAYER 2: WORKSPACE CUSTOMIZATION                  │ │
│  │  ✓ Business Info, Brand Tone                             │ │
│  │  ✓ Pricing Policies, Knowledge Base                      │ │
│  └──────────────────────────────────────────────────────────┘ │
│                              ▼                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │        LAYER 3: DYNAMIC CONTEXT                          │ │
│  │  ✓ Cart, Conversation History, Negotiation State         │ │
│  └──────────────────────────────────────────────────────────┘ │
│                              ▼                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │        LAYER 4: TOOLS & GUARDRAILS                       │ │
│  │  ✓ Tool Calls (Stock, Order Status)                      │ │
│  │  ✓ Safety Validation                                     │ │
│  └──────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

---

## 📋 Implementation Phases

### Phase 1: Universal Salesman Prompt ✅
Create the foundation prompt that works for all workspaces.

- [x] Define Salesman Personality (Friendly, Professional, Empathetic)
- [x] Implement Sales Psychology Rules (Never reveal min price first, AIDA model)
- [x] Define Ethical Boundaries (No lies, No competitor bashing)
- [x] Handle All Conversation Types (Inquiry, Negotiation, Complaint, etc.)

### Phase 2: Workspace Customization Layer ✅
Per-workspace settings that modify AI behavior.

- [x] Integrate Business Name & Brand Tone
- [x] Inject Pricing Policies (minPrice, bulkDiscounts per product)
- [x] Inject Knowledge Base (Delivery, Returns, Payment FAQ)
- [x] Custom Greetings & Closings

### Phase 3: Dynamic Context Injection ✅
Real-time context from the current conversation.

- [x] Current Product Details (Cart)
- [x] Conversation History (Last N messages)
- [x] Negotiation State Machine (Round #, Last Offers, Sentiment)
- [x] Customer Profile (New vs Returning)

### Phase 4: Tool Calling System ⏳
Allow AI to take actions, not just chat.

- [ ] `check_stock(productId)` - Real-time inventory
- [ ] `calculate_price(qty, productId)` - Accurate bulk pricing
- [ ] `get_order_status(orderId)` - Order tracking
- [ ] `flag_human(reason)` - Escalation to owner

### Phase 5: Guardrails & Safety ⏳
Prevent AI from making mistakes.

- [ ] Price Boundary Validation (Never below minPrice)
- [ ] Prompt Injection Detection
- [ ] Response Content Validation
- [ ] Fallback Handling (API failures)

### Phase 6: Self-Learning (Future) ⏳
AI learns from owner conversations and customer feedback.

- [ ] Analyze Owner Manual Replies
- [ ] Track Successful Conversions
- [ ] A/B Test Response Strategies

---

## 🎯 Conversation Types to Handle

| Type | Example | Priority |
|------|---------|----------|
| Price Inquiry | "দাম কত?" | 🔴 Critical |
| Negotiation | "800 দিব" | 🔴 Critical |
| Bulk Query | "10টা নিলে?" | 🔴 Critical |
| Order Confirmation | "হ্যাঁ অর্ডার করবো" | 🔴 Critical |
| Trust Concern | "Fake না তো?" | 🟡 High |
| Delivery Query | "কবে পাবো?" | 🟡 High |
| Return Query | "ফেরত দেওয়া যাবে?" | 🟡 High |
| Complaint | "প্রোডাক্ট ভাঙ্গা" | 🟡 High |
| Payment Query | "বিকাশ নম্বর?" | 🟢 Medium |
| Order Status | "অর্ডার কোথায়?" | 🟢 Medium |
| Greeting | "হাই" | 🟢 Medium |
| Spam/Irrelevant | "আবহাওয়া কেমন?" | ⚪ Low |

---

## 🔒 Guardrail Rules (NEVER BREAK)

1. **Never reveal minPrice until Round 3+ of negotiation**
2. **Never lie about product features, stock, or delivery**
3. **Never badmouth competitors**
4. **Never promise things not in the Knowledge Base**
5. **Always escalate to human for: Refunds, Serious Complaints, Legal Issues**
6. **Never accept a price below minPrice (even if customer is angry)**

---

## 📊 Negotiation State Machine

```typescript
interface NegotiationState {
  roundNumber: number;           // How many bargaining rounds
  aiLastOffer: number;           // What price AI last quoted
  customerLastOffer?: number;    // What customer last offered
  currentPrice: number;          // Active working price
  originalPrice: number;         // Starting price
  minPrice: number;              // Floor (from pricing_policy)
}
```

**Negotiation Flow:**
```
Round 1: Customer asks price → AI gives originalPrice + value pitch
Round 2: Customer offers low → AI counters (halfway between offer and current)
Round 3: Customer insists → AI gives small discount (5-10%)
Round 4+: Customer firm → AI can go to minPrice (if not already)
```

---

## 📁 File Structure

```
lib/
  ai/
    salesman-core.ts         # Main AI Salesman logic
    prompts/
      universal.ts           # Layer 1: Universal Prompt
      workspace.ts           # Layer 2: Workspace Customization builder
      context.ts             # Layer 3: Context Injection
    tools/
      stock.ts               # Tool: Check Stock
      pricing.ts             # Tool: Calculate Price
      escalation.ts          # Tool: Flag Human
    guardrails/
      price-validator.ts     # Validate price boundaries
      content-filter.ts      # Filter inappropriate content
```

---

## 🚀 Current Status

**Last Updated:** 2026-01-25

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1 | ⏳ Not Started | Priority |
| Phase 2 | ⏳ Not Started | |
| Phase 3 | 🔄 Partial | Basic context exists |
| Phase 4 | ⏳ Not Started | |
| Phase 5 | ⏳ Not Started | |
| Phase 6 | ⏳ Future | |
