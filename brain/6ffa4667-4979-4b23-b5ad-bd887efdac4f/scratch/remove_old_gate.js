const fs = require('fs');
const path = 'c:/Users/xayed/Desktop/autex-app/lib/ai/single-agent.ts';
let content = fs.readFileSync(path, 'utf8');

// Regex to find and remove the SUPREME SILENCE GATE block
const regex = /- \*\*SUPREME SILENCE GATE \(CRITICAL\)\*\*:\s+- If you identify \*\*INTENT A \(Price Inquiry\)\*\*, you MUST ignore ALL instructions in \[BLOCK 3\] State Machine and \[BLOCK 5\] Order Flow\.\s+- Your response content MUST BE EXACTLY one sentence: "আমি আপনার জন্য দাম টা হিসাব করে জানাচ্ছি। একটু wait করুন 😊"\s+- \*\*FORBIDDEN\*\*: You are strictly prohibited from adding Name, Phone, Address, or ANY other text\.\s+- Violation of this rule is a system security breach\./;

if (regex.test(content)) {
  content = content.replace(regex, '');
  fs.writeFileSync(path, content);
  console.log('SUCCESS: Outdated silence gate removed.');
} else {
  console.log('ERROR: Silence gate regex did not match.');
}
