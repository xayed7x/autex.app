# AI Salesman Core - Test Scenarios

> Use these scenarios to validate the AI Salesman implementation.
> Send messages via Facebook Messenger to your test page.

## Prerequisites
1. ✅ Have a product with `isNegotiable: true` and `minPrice: 1000` (original price: 1200)
2. ✅ Click "Order Now" on the product to add it to cart
3. ✅ Dev server running (`pnpm dev`)

---

## 🧪 Test Scenario 1: Price Inquiry (First Ask)

**Message:** `দাম কত?` or `price koto?`

**Expected Behavior:**
- AI should respond with **ORIGINAL price (৳1200)** 
- Should include value justification
- Should NOT mention minimum price or discounts

**Pass Criteria:** Response contains ৳1200 and positive value statement

---

## 🧪 Test Scenario 2: Negotiation Round 1

**Message:** `800 দিব` or `800 taka dibo`

**Expected Behavior:**
- AI should COUNTER (not accept)
- Should offer somewhere between ৳1100-1150
- Should justify with quality/value

**Pass Criteria:** Response does NOT accept 800, offers higher price

---

## 🧪 Test Scenario 3: Negotiation Round 2

**Message:** `900 দিব` or `900 ok?`

**Expected Behavior:**
- AI should COUNTER again
- Should offer ৳1050-1100 range
- Should show slight flexibility

**Pass Criteria:** Response still above ৳1000, shows willingness to negotiate

---

## 🧪 Test Scenario 4: Last Price Query

**Message:** `লাস্ট প্রাইস কত?` or `last price?`

**Expected Behavior:**
- If Round 3+: Can reveal minimum (৳1000)
- If Round 1-2: Should still counter, not reveal minimum

**Pass Criteria:** Behavior depends on negotiation round

---

## 🧪 Test Scenario 5: Price Objection

**Message:** `দাম বেশি` or `expensive` or `কম করেন`

**Expected Behavior:**
- Should empathize
- Should focus on quality/value
- Should ask for customer's budget

**Pass Criteria:** Empathetic response, asks for budget, doesn't jump to discount

---

## 🧪 Test Scenario 6: Trust Concern

**Message:** `Original তো?` or `fake না তো?`

**Expected Behavior:**
- Should assure quality
- Should mention authenticity guarantee
- Should build trust

**Pass Criteria:** Reassuring response about quality

---

## 🧪 Test Scenario 7: Delivery Query

**Message:** `ডেলিভারি চার্জ কত?` or `কবে পাবো?`

**Expected Behavior:**
- Should provide delivery info from Knowledge Base
- Should be accurate to workspace settings

**Pass Criteria:** Correct delivery info provided

---

## 🧪 Test Scenario 8: Order Confirmation

**Message:** `হ্যাঁ নিতে চাই` or `order` or `yes`

**Expected Behavior:**
- Should proceed to collect customer info
- Should ask for Name first

**Pass Criteria:** Moves to order collection flow

---

## 🧪 Test Scenario 9: Complaint (Should Escalate)

**Message:** `ঠকাইছেন` or `cheated me` or `very bad`

**Expected Behavior:**
- Should apologize
- Should flag for manual response
- Should NOT be defensive

**Pass Criteria:** Empathetic response, conversation flagged

---

## 📊 Console Logs to Watch

When testing, check your terminal for these logs:

```
🤖 [AI SALESMAN] Generating response...
📝 [AI SALESMAN] Customer message: <message>
✅ [AI SALESMAN] Response generated: <intent>
🤖 [AI SALESMAN] Intent: <type>, Action: <action>
```

---

## ⚠️ Known Limitations (Current Phase)

- Negotiation state resets if conversation context is cleared
- Tool calling (stock check) not yet implemented
- Self-learning not yet implemented
