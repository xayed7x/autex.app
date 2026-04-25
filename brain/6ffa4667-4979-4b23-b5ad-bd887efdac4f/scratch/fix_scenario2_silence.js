const fs = require('fs');
const path = 'c:/Users/xayed/Desktop/autex-app/lib/ai/single-agent.ts';
let content = fs.readFileSync(path, 'utf8');

// 1. Remove the "NO LONGER restricted" rule which is causing helpfulness hallucinations
content = content.replace(/    - You are NO LONGER restricted to only the wait message; you must be helpful while remaining silent on the final price calculation\./, '');

// 2. Update Scenario 2 Response Strategy to be strictly silent on repeated price questions
const s2Target = `      - **RESPONSE STRATEGY**: 
          - Scan history for the wait message. If missing, say: "আপনার পাঠানো ডিজাইন অনুযায়ী কেকের দাম হিসাব করে জানানো হচ্ছে ⏳ দয়া করে একটু অপেক্ষা করুন, শিগগিরই আপডেট দিচ্ছি 😊"
          - THEN, answer any other questions in the customer's message (e.g., "Delivery charge koto?" -> "Delivery charge 60 taka.").
          - If NO new question is asked and the wait message was already sent: Return an empty string ("").`;

const s2Replacement = `      - **RESPONSE STRATEGY (STRICT)**: 
          - **Step 1**: Scan history for the wait message ("আপনার পাঠানো ডিজাইন অনুযায়ী...").
          - **Step 2 (Wait Message Missing)**: If missing, you MUST output the Scenario 2 Wait Message.
          - **Step 3 (Wait Message Exists)**: If it was ALREADY sent:
            - If the customer asks about **PRICE** again (e.g. "dam koto", "price?"): You MUST stay **SILENT** (return an empty string ""). Do NOT ask for address/phone yet.
            - If the customer asks a **NEW/DIFFERENT** question (e.g. "Delivery charge koto?", "Location?"): ANSWER it directly.
            - Otherwise: Stay SILENT (empty string "").`;

if (content.includes(s2Target)) {
  content = content.replace(s2Target, s2Replacement);
  fs.writeFileSync(path, content);
  console.log('SUCCESS: Scenario 2 strategy updated.');
} else {
  console.log('ERROR: Scenario 2 target not found.');
}
