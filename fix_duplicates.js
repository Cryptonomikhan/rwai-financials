const fs = require('fs');
const path = require('path');

// Read the file
const filePath = path.join(process.cwd(), 'src/app/page.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Check if there are duplicate helper functions
if (content.indexOf('// Helper functions for advanced financial calculations') !== -1) {
  // Remove the duplicate helper functions section
  content = content.replace(/\/\/ Helper functions for advanced financial calculations[\s\S]*?};/g, '');
  
  // Write the modified content back to the file
  fs.writeFileSync(filePath, content);
  console.log('Successfully removed duplicate helper functions');
} 