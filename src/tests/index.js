/**
 * Tests Index - Central hub for all testing functionality
 * 
 * This file provides an easy way to access and run all test scripts
 * for the DesignKnowledge RAG and Agent Memory systems.
 */

import { testVectorSearch } from './testVectorSearch';
import { testAgentMemory } from './testAgentMemory';
import { testDirectFirestore } from './testDirectFirestore';
import { testFirestoreAuth } from './testFirestoreAuth';

/**
 * Available test modules
 */
const TESTS = {
  // Vector search and RAG tests
  vectorSearch: {
    name: 'Vector Search Test',
    description: 'Tests the vector similarity search for the wicked problem document',
    run: testVectorSearch
  },
  directFirestore: {
    name: 'Direct Firestore Write',
    description: 'Tests basic Firestore write functionality with minimal data',
    run: testDirectFirestore
  },
  firestoreAuth: {
    name: 'Firestore Auth & Permissions',
    description: 'Tests authentication and permissions for Firestore',
    run: testFirestoreAuth
  },
  
  // Agent Memory tests
  agentMemory: {
    name: 'Agent Memory Test',
    description: 'Tests storing and retrieving agent memories of various types',
    run: testAgentMemory
  }
};

/**
 * Run a specific test by name
 */
async function runTest(testName) {
  if (!TESTS[testName]) {
    console.error(`❌ Test "${testName}" not found. Available tests: ${Object.keys(TESTS).join(', ')}`);
    return false;
  }
  
  const test = TESTS[testName];
  console.log(`\n🧪 RUNNING TEST: ${test.name}`);
  console.log(`Description: ${test.description}`);
  console.log('======================================================');
  
  try {
    const result = await test.run();
    console.log('======================================================');
    console.log(`✅ Test ${testName} completed!`);
    return result;
  } catch (error) {
    console.error(`❌ Test ${testName} failed with error:`, error);
    return false;
  }
}

/**
 * List all available tests
 */
function listTests() {
  console.log('\n📋 AVAILABLE TESTS:');
  console.log('======================================================');
  
  Object.entries(TESTS).forEach(([key, test]) => {
    console.log(`- ${key}: ${test.name}`);
    console.log(`  ${test.description}`);
    console.log('');
  });
}

// If this file is executed directly, show the list of available tests
if (typeof window !== 'undefined' && window.document) {
  // Browser environment
  console.log('💻 Running in browser environment');
  console.log('Import specific tests to run them:');
  console.log('import { testAgentMemory } from "./tests/testAgentMemory";');
  console.log('testAgentMemory();');
} else {
  // Node.js environment
  listTests();
  console.log('To run a test, use:');
  console.log('import { runTest } from "./tests";');
  console.log('runTest("agentMemory");');
}

export { listTests, runTest, TESTS, testVectorSearch, testAgentMemory, testDirectFirestore, testFirestoreAuth }; 