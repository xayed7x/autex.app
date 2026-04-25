const fs = require('fs');
const path = 'c:/Users/xayed/Desktop/autex-app/lib/ai/single-agent.ts';
let content = fs.readFileSync(path, 'utf8');

// Regex to match the block regardless of exact indentation or line endings
const regex = /-\s+If the wait message was NOT sent: Include it\.\s+- If the customer asked a NEW question \(e\.g\., delivery, location, stock\): ANSWER it directly based on the \[BUSINESS CONTEXT\]\.\s+- If the customer only sent passive text \(e\.g\., "okay", "thanks"\) AND the wait message was already sent: Stay SILENT \(empty string\)\./;

const replacement = `- If the wait message was NOT sent: Include it.
      - If the wait message WAS already sent:
        - If the customer asks for the **PRICE** again (e.g., "dam koto", "price?"): Stay SILENT (empty string). You already told them you are calculating it.
        - If the customer asks a **NEW/DIFFERENT** question (e.g., "Delivery charge koto?", "Shop kothay?", "Stock ase?"): ANSWER it directly based on the [BUSINESS CONTEXT].
        - If the customer only sent passive text (e.g., "okay", "thanks"): Stay SILENT (empty string).`;

if (regex.test(content)) {
  const newContent = content.replace(regex, replacement);
  fs.writeFileSync(path, newContent);
  console.log('SUCCESS: Content replaced via regex.');
} else {
  console.log('ERROR: Regex did not match.');
}
