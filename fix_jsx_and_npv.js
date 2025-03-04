const fs = require('fs');
const path = require('path');

// Read the file
const filePath = path.join(process.cwd(), 'src/app/page.tsx');
const content = fs.readFileSync(filePath, 'utf8');

// 1. Add the missing calculateNPV function after the calculateIRR function
let updatedContent = content.replace(
  /const calculateIRR[\s\S]*?};/,
  match => {
    return match + `\n\n// Calculate NPV (Net Present Value) with given discount rate
const calculateNPV = (cashFlows: number[], discountRate: number): number => {
  return cashFlows.reduce((npv, cashFlow, t) => {
    return npv + cashFlow / Math.pow(1 + discountRate, t/12);
  }, 0);
};`;
  }
);

// 2. Fix JSX namespace issue by ensuring JSX namespace is properly set up
// First, check if namespace is already declared correctly
if (!updatedContent.includes('declare global {')) {
  // Add proper JSX namespace declaration if missing
  updatedContent = updatedContent.replace(
    /import React[\s\S]*?from 'chart.js';/,
    match => {
      return match + `\n\n// Ensure JSX namespace is declared
declare global {
  namespace JSX {
    interface IntrinsicElements {
      div: React.DetailedHTMLProps<React.HTMLAttributes<HTMLDivElement>, HTMLDivElement>;
      // Other elements already present in the file
    }
  }
}`;
    }
  );
}

// Write back to the file
fs.writeFileSync(filePath, updatedContent);
console.log('Successfully added calculateNPV function and fixed JSX namespace issues'); 