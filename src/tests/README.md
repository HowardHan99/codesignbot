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
| Comprehensive Memory | Extensive test of the full memory system workflow | `runAgentMemoryTest.js` |
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

// Or run the comprehensive memory test
runTest('agentMemoryComprehensive').then(result => {
  console.log('Comprehensive test complete!');
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

### Comprehensive Agent Memory Test

An extensive test that simulates a complete agent memory workflow:
1. Stores a conversation history with multiple turns
2. Records agent reflections about the user
3. Creates long-term memories about user interests
4. Retrieves memories by type with chronological ordering
5. Performs semantic search with multiple queries
6. Provides detailed test reports and metrics

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

## Implementation Details

### RAG (Retrieval Augmented Generation) System

The DesignKnowledge RAG system is implemented with the following components:

1. **Document Processing** (`KnowledgeService.addDocument`):
   - Splits text into chunks with intelligent break points
   - Generates vector embeddings for each chunk using OpenAI's embedding API
   - Stores the chunks and embeddings in Firestore

2. **Vector Similarity Search** (`KnowledgeService.retrieveRelevantKnowledge`):
   - Converts a query to a vector embedding
   - Retrieves documents from Firestore with any specified filters
   - Calculates cosine similarity in memory between the query and all document embeddings
   - Returns the most similar documents

3. **Document Structure**:
   ```typescript
   interface KnowledgeDocument {
     id: string;
     type: 'design_principle' | 'past_analysis' | 'industry_pattern' | 'user_feedback';
     title: string;
     content: string;
     tags: string[];
     timestamp: any;
     embedding: number[]; // Vector representation
     metadata?: Record<string, any>;
   }
   ```

### Agent Memory System

The Agent Memory system extends the RAG infrastructure with dedicated memory types:

1. **Memory Types** (`AgentMemoryService`):
   - `conversation`: Records of user-agent interaction history
   - `short_term`: Immediate context and observations
   - `long_term`: Persistent knowledge about the user or domain
   - `reflection`: Agent's thoughts about the user or interaction

2. **Storage Mechanism**:
   - Uses the same Firestore collection as knowledge documents
   - Distinguishes memories with special tags
   - Stores full vector embeddings for semantic search

3. **Retrieval Capabilities**:
   - `getMemoriesByType`: Retrieves memories of a specific type (chronological)
   - `getRelevantMemories`: Finds memories similar to a query across all types

4. **Memory Structure**:
   ```typescript
   interface AgentMemory {
     id: string;
     content: string;
     type: 'short_term' | 'long_term' | 'conversation' | 'reflection';
     timestamp: Date | number;
     relevance?: number;
     tags: string[];
     metadata?: Record<string, any>;
     embedding?: number[];
   }
   ```

### Integration Into Agent Workflow

Both systems are designed to be integrated into an agent's workflow as follows:

1. **Knowledge Integration**:
   ```javascript
   // Retrieving relevant knowledge for a user query
   const relevantKnowledge = await KnowledgeService.retrieveRelevantKnowledge(
     await EmbeddingService.getEmbedding(userQuery),
     5
   );
   
   // Format knowledge for context
   const knowledgeContext = relevantKnowledge
     .map(k => `Knowledge: ${k.content}`)
     .join('\n\n');
   ```

2. **Memory Integration**:
   ```javascript
   // Store a new interaction in memory
   await AgentMemoryService.storeMemory(
     `User asked: ${userQuery}`,
     "conversation",
     { timestamp: new Date() }
   );
   
   // Retrieve relevant memories
   const relevantMemories = await AgentMemoryService.getRelevantMemories(userQuery, 3);
   
   // Format memories for context
   const memoryContext = relevantMemories
     .map(mem => `Memory [${mem.type}]: ${mem.content}`)
     .join('\n\n');
   ```

3. **Combined Context Generation**:
   ```javascript
   // Generate full context for LLM
   const fullContext = `
   User Query: ${userQuery}
   
   Agent Memories:
   ${memoryContext}
   
   Relevant Knowledge:
   ${knowledgeContext}
   `;
   
   // Use this context in your AI completion call
   const response = await generateCompletion(fullContext);
   ``` 