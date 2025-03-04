const fs = require('fs');
const path = require('path');

// Read the file
const filePath = path.join(process.cwd(), 'src/app/page.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Fix the JSX structure issues
// 1. Fix the label closing tag issue at line 1060
content = content.replace(/<\/label>\s*<\/label>/g, '</label>');

// 2. Fix the main tag closing issue
content = content.replace(/<\/div>\s*<\/main>\s*\);/g, '</div>\n    </main>\n  );');

// Write the modified content back to the file
fs.writeFileSync(filePath, content);
console.log('Successfully fixed JSX structure issues'); 