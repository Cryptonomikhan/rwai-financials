const fs = require('fs');
const path = require('path');

// Read the file
const filePath = path.join(process.cwd(), 'src/app/page.tsx');
const content = fs.readFileSync(filePath, 'utf8');

// Replace <main> tags with <div> tags
const updatedContent = content
  .replace(/<main(\s+[^>]*)>/g, '<div$1>')
  .replace(/<\/main>/g, '</div>');

// Write back to the file
fs.writeFileSync(filePath, updatedContent);
console.log('Successfully replaced main tags with div tags'); 