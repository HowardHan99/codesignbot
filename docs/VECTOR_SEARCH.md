# Firebase Vector Search Implementation

## Overview

This document describes the implementation of vector search functionality in the CodeSignBot application using Firebase Firestore. Vector search allows for semantic similarity search across agent memories, enabling more intelligent and contextually relevant retrieval of information.

## Implementation Details

The vector search implementation follows a dual-approach strategy:

1. **Primary Method: Admin SDK** - Matches the pattern shown in the Firebase documentation
2. **Fallback Method: Client SDK** - Added as a fallback option if Admin SDK isn't available
3. **Final Fallback: In-memory Calculation** - Used when neither vector search method is available

### Key Components

#### SDK Imports

```javascript
// Client SDK for regular operations
import { getFirestore, collection, ... } from 'firebase/firestore';

// Admin SDK specifically for vector search
import { Firestore as AdminFirestore } from '@google-cloud/firestore';
```

#### Initialization Logic

```javascript
// Client SDK initialization
let firestoreDb = getFirestore(app);

// Admin SDK initialization (for vector search)
let adminDb = null;
if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  adminDb = new AdminFirestore({ projectId: firebaseConfig.projectId });
}
```

#### Vector Search Method

```javascript
// Using Admin SDK (preferred, matches documentation)
const adminCollection = adminDb.collection(COLLECTION_NAME);
const vectorQuery = adminCollection.findNearest({
  vectorField: 'embedding',       // Field containing the vectors
  queryVector: embedding,         // The query embedding
  limit: maxResults,              // Max results to return
  distanceMeasure: 'COSINE',      // Distance measure (COSINE is best for text)
  distanceResultField: 'vector_distance' // Field to store distance in results
});
```

#### Index Configuration

In `firestore.indexes.json`:

```json
{
  "indexes": [
    {
      "collectionGroup": "agent_memory",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "embedding", "vectorConfig": "distance" }
      ]
    }
  ]
}
```

## How To Use

### Basic Usage

The vector search is integrated into the `getRelevantMemories` method:

```javascript
// Search memories relevant to a query
const relevantMemories = await AgentMemoryService.getRelevantMemories(
  "Tell me about design approaches for complex problems",  // The query text
  3,                                                       // Max results to return
  ["conversation", "reflection", "long_term"]              // Memory types to include
);
```

### Expected Response

The method returns an array of `AgentMemory` objects, sorted by relevance:

```javascript
[
  {
    id: "documentId1",
    content: "Memory content text...",
    type: "conversation",
    timestamp: [Timestamp object],
    tags: ["memory_conversation", ...],
    metadata: { ... },
    relevance: 0.92,  // Similarity score (0-1, higher is better)
    embedding: [...]  // Vector embedding
  },
  // Additional memories...
]
```

## Requirements

For vector search to work:

1. **Firebase SDK Version**: 11.5.0 or newer (confirmed working with 11.6.0)

2. **Admin SDK Setup** (preferred method):
   - Install with: `npm install @google-cloud/firestore --save`
   - Set up a service account and credentials
   - Set the `GOOGLE_APPLICATION_CREDENTIALS` environment variable

3. **Vector Index**: 
   - Deploy the index configuration with `firebase deploy --only firestore:indexes`

## Differences Between Admin SDK and Client SDK

### Admin SDK (Server-side)

The Admin SDK (`@google-cloud/firestore`) is designed for server-side use and offers full vector search capabilities. It:

- Requires service account credentials
- Has broader access rights to the Firestore database
- Supports all vector search features as documented in the Firebase documentation
- Uses a different API pattern with direct collection access:
  ```javascript
  adminDb.collection(collectionName).findNearest({ /* params */ })
  ```

### Client SDK (Browser/Client-side)

The Client SDK (`firebase/firestore`) is designed for browser and client-side use and has limited vector search capabilities. It:

- Uses app-based authentication rather than service account credentials
- Has limited access rights based on security rules
- Has incomplete support for vector search in some versions
- Uses a different API pattern:
  ```javascript
  collection(firestoreDb, collectionName) // returns CollectionReference
  // Note: findNearest() may not be available on this reference
  ```

## Fallback Behavior

The service automatically falls back to simpler methods if vector search is unavailable:

1. Try Admin SDK vector search
2. If that fails, try Client SDK vector search
3. If both fail, use in-memory similarity calculation

Each step is logged to help with debugging:

```
Attempting vector search with Firestore Admin SDK...
Admin SDK not available, skipping Admin SDK vector search attempt
Attempting vector search with Firestore Client SDK (fallback)...
Client SDK does not support vector search (findNearest method not available)
Vector search not available or failed, falling back to in-memory similarity calculation
```

## Troubleshooting

If vector search is not working:

1. **Check SDK Versions**:
   - Ensure Firebase JS SDK is version 11.5.0+
   - Ensure Admin SDK is installed and properly configured

2. **Check Environment Variables**:
   - Verify `GOOGLE_APPLICATION_CREDENTIALS` is set and points to a valid service account key file

3. **Check Index Deployment**:
   - Ensure vector indexes are deployed to Firestore
   - Check for any errors in the Firebase console

4. **Review Logs**:
   - The code includes detailed logging that can help identify where in the fallback chain the system is operating

## Conclusion

The vector search implementation aligns with the Firebase documentation, providing an efficient way to retrieve memories based on semantic similarity. The fallback strategies ensure the service continues to function even without vector search availability. 