# AI Response Behavior Tracker

This file tracks current issues with the AI's response logic, tone, and decision-making. We use this to document problems and provide examples before implementation.

### 🔴 Current Problems

*(None at the moment)*

---

## ✅ Resolved Issues

### 1. Payment Policy Contradiction & Hallucination (COD vs Upfront)
**Resolved via**: Fixed `paymentMessage` mapping bug in `single-agent.ts` and injected the **[LOGICAL INTEGRITY]** rule into Core Constraints to prioritize JSON payment toggles.

### 2. Custom Cake "Early Handover" & Pricing Paradox
**Resolved via**: Implemented **"Late Handover"** and **"YES WE CAN"** protocols in `food.ts`. The AI now collects all details (Phone, Address, Date, Flavor) before flagging for a final quote. Disabled price negotiation for custom cakes.

### 3. "Broken Record" & Over-Talkative AI (Handover Redundancy)
**Resolved via**: Injected the **[SILENCE PROTOCOL]** into `single-agent.ts`. The AI will now return an empty response to passive acknowledgments (e.g., "Okay", "Thanks").

### 4. Goal-Oriented Checklist Logic (The "Mental Checklist")
**Resolved via**: Added **[HISTORY AWARENESS]** to `single-agent.ts`. The AI is forced to scan the entire conversation history to prevent asking redundant questions.

### 5. Two-Part Order Flow (Transaction vs. Design Vision)
**Resolved via**: Implemented the **Design Vision Accumulator** in `food.ts` to append raw design notes over time. Updated `order-flow.ts` to include `🎨 ডিজাইন নোট` and `✍️ কেকের লেখা` in the final summary.
