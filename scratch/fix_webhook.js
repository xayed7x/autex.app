import fs from 'fs';

const filePath = 'c:\\Users\\xayed\\Desktop\\autex-app\\app\\api\\webhooks\\facebook\\route.ts';
let content = fs.readFileSync(filePath, 'utf8');

// The lines we want to change are very specific
const pattern = /\.update\({ last_message_at: new Date\(timestamp\)\.toISOString\(\) }\)/g;

// We only want to change the ones at lines 986 and 1553 (roughly)
// But to be safe, we can just replace all of them since we want the conversation to stay unread if any message comes?
// No, bot messages shouldn't mark it as unread for the admin.
// Wait, the webhook only updates conversations when a CUSTOMER message comes in those specific blocks.

content = content.replace(pattern, `.update({ 
        last_message_at: new Date(timestamp).toISOString(),
        is_read: false 
      })`);

fs.writeFileSync(filePath, content);
console.log('Successfully updated webhook file');
