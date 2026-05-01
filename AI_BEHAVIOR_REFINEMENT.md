# AI Behavior Refinement Plan (Food Business)

This document outlines the two distinct price inquiry protocols established with the business owner, enforcing the **Owner-Only Pricing** rule.

## Scenario 1: Generic Price Inquiry (No Context)
**Condition**: Customer asks for price without sending an image or selecting a product.
- **AI Response**:
  “কেকের দাম ফ্লেভার ও ডিজাইনের উপর নির্ভর করে 😊
  আপনি আপনার পছন্দের ডিজাইন বা কত পাউন্ডের কেক চাচ্ছেন তা জানালে আমি সঠিক দাম জানিয়ে দিতে পারব।”
- **System Action**: 
  - **NO FLAGGING**.
  - Continue to Product Discovery (Show categories/inspiration cards).
- **Rule**: AI is physically forbidden from providing price numbers.

## Scenario 2: Custom Design Inquiry (Specific Design/Image)
**Condition**: Customer sends an image or asks for the price of a specific cake currently under discussion.
- **AI Response**:
  (STRICT SILENCE "")
- **System Action**: 
  - **IMMEDIATE FLAGGING** (Flag for manual review).
  - The human owner will provide the final price based on customization.

---
*Status: LIVE and enforced.*
