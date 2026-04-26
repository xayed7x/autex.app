const fs = require('fs');
const content = fs.readFileSync('lib/ai/single-agent.ts', 'utf8');
const lines = content.split('\n');
lines.forEach((line, i) => {
  const matches = line.matchAll(/(?<!\\)`/g);
  for (const match of matches) {
    console.log(`Line ${i + 1}: Unescaped backtick at index ${match.index}`);
  }
});
