const fs = require('fs');
const path = 'c:/Users/xayed/Desktop/autex-app/lib/ai/single-agent.ts';
let content = fs.readFileSync(path, 'utf8');

const target = `      - If the customer asked a NEW question (e.g., delivery, location, stock): ANSWER it directly based on the [BUSINESS CONTEXT].
      - If the customer only sent passive text (e.g., "okay", "thanks") AND the wait message was already sent: Stay SILENT (empty string).`;

const replacement = `      - If the wait message WAS already sent:
        - If the customer asks for the **PRICE** again (e.g., "dam koto", "price?"): Stay SILENT (empty string). You already told them you are calculating it.
        - If the customer asks a **NEW/DIFFERENT** question (e.g., "Delivery charge koto?", "Shop kothay?", "Stock ase?"): ANSWER it directly based on the [BUSINESS CONTEXT].
        - If the customer only sent passive text (e.g., "okay", "thanks"): Stay SILENT (empty string).`;

if (content.includes(target)) {
  content = content.replace(target, replacement);
  fs.writeFileSync(path, content);
  console.log('SUCCESS: Content replaced.');
} else {
  console.log('ERROR: Target not found.');
  // Try with normalized line endings
  const targetLF = target.replace(/\r\n/g, '\n');
  const contentLF = content.replace(/\r\n/g, '\n');
  if (contentLF.includes(targetLF)) {
    console.log('SUCCESS: Target found with LF normalization.');
    const resultLF = contentLF.replace(targetLF, replacement.replace(/\r\n/g, '\n'));
    fs.writeFileSync(path, resultLF);
  } else {
    console.log('CRITICAL: Even with LF normalization, target not found.');
  }
}
