/**
 * CommonJS version of the Agent Memory test runner
 * This can be run directly with Node.js without special flags
 */

// This wrapper allows running ES module code in CommonJS
require('esm')(module)('../tests/runAgentMemoryTest.js');

console.log('Started test runner using ESM wrapper...'); 