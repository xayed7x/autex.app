const fs = require('fs');
const path = 'c:/Users/xayed/Desktop/autex-app/lib/ai/single-agent.ts';
let content = fs.readFileSync(path, 'utf8');

// 1. Fix Ambiguity rule
content = content.replace(/- \*\*Ambiguity\/Gibberish\*\*: If a message is unclear, stay SILENT and call `flag_for_review` with reason "Ambiguity"\./, '- **Ambiguity/Gibberish**: If a message is unclear, stay SILENT (empty string). Do NOT call `flag_for_review`.');

// 2. Fix Scenario 2 Mandatory Flag
content = content.replace(/- \*\*ACTION \(MANDATORY\)\*\*: You MUST call `flag_for_review` immediately\./, '- **ACTION**: Do NOT call `flag_for_review` (Disabled for testing).');

fs.writeFileSync(path, content);
console.log('SUCCESS: Manual flags disabled.');
