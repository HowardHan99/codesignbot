# Test Suite for DesignKnowledge and Agent Memory

This directory contains a comprehensive set of tests for verifying the functionality of:
- Vector search in the DesignKnowledge collection
- Agent memory storage and retrieval
- Firestore authentication and permissions
- Direct Firestore operations

## Available Tests

| Test | Description | File |
|------|-------------|------|
| Vector Search | Tests similarity search for finding "wicked problem" documents | `testVectorSearch.js` |
| Agent Memory | Tests storing and retrieving different types of agent memories | `testAgentMemory.js` |
| Firestore Auth | Tests authentication and permissions for Firestore | `testFirestoreAuth.js` |
| Direct Firestore | Tests direct Firestore write operations with minimal data | `testDirectFirestore.js` |
| Node.js Vector Search | Standalone Node.js script for testing vector search | `runVectorSearchTest.mjs` |

## Running Tests

### In the Browser/Application:

```javascript
// Import the central test runner
import { runTest, listTests } from './tests';

// List all available tests
listTests();

// Run a specific test
runTest('agentMemory').then(result => {
  console.log('Test completed with result:', result);
});

// Or import and run a test directly
import { testVectorSearch } from './tests/testVectorSearch';
testVectorSearch().then(results => {
  console.log('Found documents:', results.length);
});
```

### From Node.js Command Line:

For the standalone Node.js test:

```bash
# Install dependencies if needed
npm install node-fetch@2

# Set your OpenAI API key for embedding generation
export OPENAI_API_KEY="your-api-key"

# Run the vector search test
node --experimental-modules src/tests/runVectorSearchTest.mjs
```

## Test Details

### Vector Search Test

Searches for documents related to "wicked problems" and verifies that the relevant document with ID "5GLelxXjELIhyiZ7fISj" is found.

### Agent Memory Test

Tests the complete agent memory workflow:
1. Storing memories of different types (conversation, short-term, long-term, reflection)
2. Retrieving memories by type
3. Performing semantic search to find relevant memories

### Firestore Auth Test

Tests authentication and permissions for Firestore:
1. Tries to authenticate anonymously
2. Tests read permissions for the DesignKnowledge collection
3. Tests write permissions by adding a minimal document

### Direct Firestore Test

A minimal test that bypasses most of the RAG pipeline to write directly to Firestore with a simple document.

## Troubleshooting

If tests fail due to permission issues, ensure your Firestore security rules allow read/write access to the DesignKnowledge collection:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /DesignKnowledge/{document=**} {
      allow read, write: if true;  // For testing only!
    }
  }
}
``` 