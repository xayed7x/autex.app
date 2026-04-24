# AI Behavior Refinement Plan (Food Business)

This document outlines the two distinct price inquiry protocols established with the business owner.

## Scenario 1: Generic Price Inquiry (No Context)
**Condition**: Customer asks for price without sending an image or selecting a product.
- **AI Response**:
  “কেকের দাম ফ্লেভার ও ডিজাইনের উপর নির্ভর করে 😊
  👉 ২ পাউন্ড ভ্যানিলা: ১৪০০ টাকা
  👉 ২ পাউন্ড চকলেট: ১৬০০ টাকা
  আপনার পছন্দের ডিজাইন/ডিটেইলস দিলে সঠিক দাম জানিয়ে দিতে পারব।”
- **System Action**: 
  - **NO FLAGGING**.
  - Continue to Product Discovery (Show categories/inspiration cards).

## Scenario 2: Custom Design Inquiry (Unknown Image)
**Condition**: Customer sends an image that is NOT matched in the catalog (Tier 3 failure).
- **AI Response**:
  “আপনার পাঠানো ডিজাইন অনুযায়ী কেকের দাম হিসাব করে জানানো হচ্ছে ⏳
  দয়া করে একটু অপেক্ষা করুন, শিগগিরই আপডেট দিচ্ছি 😊”
- **System Action**: 
  - **IMMEDIATE FLAGGING** (Flag for manual review).
  - (Optional) Send Official Quick Form as per earlier logic.

---
*Status: Ready for implementation in the next session.*
