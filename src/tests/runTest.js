#!/usr/bin/env node

/**
 * Wrapper script to run tests with Babel support.
 * This allows running ES module syntax in Node.js without special configuration.
 * 
 * Usage: node runTest.js <test-name>
 * Example: node runTest.js agentMemory
 */

// Make sure babel is installed
try {
  require('@babel/register');
} catch (e) {
  console.error('Babel is required. Please install it with:');
  console.error('npm install --save-dev @babel/register @babel/preset-env');
  process.exit(1);
}

// Register Babel to handle ES modules
require('@babel/register')({
  presets: ['@babel/preset-env'],
  ignore: [/node_modules/],
  extensions: ['.js', '.ts'],
  cache: false
});

// Get the test to run from command line arguments
const testName = process.argv[2] || 'agentMemory';

console.log(`Running test: ${testName}`);

try {
  // Import the test index file (with ES module support via Babel)
  const { runTest, listTests } = require('./index');
  
  if (testName === 'list') {
    // Just list available tests
    listTests();
  } else {
    // Run the specified test
    runTest(testName)
      .then(result => {
        console.log('\nTest completed successfully!');
        process.exit(0);
      })
      .catch(err => {
        console.error('Test failed with error:', err);
        process.exit(1);
      });
  }
} catch (error) {
  console.error('Error loading test:', error);
  process.exit(1);
} 