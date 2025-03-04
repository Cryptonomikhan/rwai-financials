const fs = require('fs');
const path = require('path');

// Read the file
const filePath = path.join(process.cwd(), 'src/app/page.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Fix the component structure
// 1. Find the component declaration
const componentMatch = content.match(/const FinancialDashboard = \(\) => \{/);
if (componentMatch) {
  // Get the index of the component declaration
  const componentIndex = content.indexOf(componentMatch[0]);
  
  // Extract everything before the component declaration
  const beforeComponent = content.substring(0, componentIndex);
  
  // Extract the component itself
  const componentStart = content.substring(componentIndex);
  
  // Reconstruct the file with proper structure
  const newContent = beforeComponent + componentStart;
  
  // Write the modified content back to the file
  fs.writeFileSync(filePath, newContent);
  console.log('Successfully fixed file structure');
} 