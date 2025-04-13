/**
 * Service for storing and retrieving agent memories
 * Uses a dedicated collection for agent memories
 */

// Client SDK imports
import { 
  getFirestore, 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit, 
  DocumentData, 
  Timestamp, 
  QueryDocumentSnapshot,
  CollectionReference 
} from 'firebase/firestore';

// Admin SDK import for vector search
import { Firestore as AdminFirestore } from '@google-cloud/firestore';

import { initializeApp } from 'firebase/app';
import { firebaseConfig } from '../utils/config';
import { EmbeddingService } from './embeddingService';

// Try to import VectorQuery types - TypeScript might show errors if not available in your SDK version
// but this is just to match what the documentation shows
// Comment out the direct import and use a type declaration instead
// import type { VectorQuery } from 'firebase/firestore';

// Define the VectorQuery interface to match what's expected in the documentation
// Note: The actual Firebase documentation examples use the Admin SDK (@google-cloud/firestore)
// which has a different API than the client-side SDK (firebase/firestore)
// This interface helps bridge the gap for TypeScript
interface VectorQuery {
  get(): Promise<{
    docs: any[];
    empty: boolean;
    size: number;
  }>;
}

// Force test mode for embedding service during testing
// This ensures we use mock embeddings instead of calling the API
if (process.env.NODE_ENV === 'test' || process.env.TEST_MODE !== 'true') {
  process.env.TEST_MODE = 'true';
  console.log('AgentMemoryService: Set TEST_MODE=true for embedding service');
}

// Initialize Firebase client SDK
let firestoreDb: any;
try {
  // Try to initialize Firebase client SDK (will throw if already initialized)
  const app = initializeApp(firebaseConfig);
  firestoreDb = getFirestore(app);
  console.log('Firestore client SDK initialized in agentMemoryService');
} catch (error) {
  // Firebase already initialized, just get Firestore
  firestoreDb = getFirestore();
  console.log('Using existing Firestore client SDK instance for agentMemoryService');
}

// Check if we're using the Admin SDK
// const isAdminSdk = typeof firestoreDb.collection === 'function';
// console.log('Using Admin SDK:', isAdminSdk);

// Initialize Admin SDK for vector search
let adminDb: any = null;
try {
  // Only initialize if we have the necessary credentials
  // In a production environment, you would have service account credentials set up
  // For local development, use the Admin SDK in a more controlled environment
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.log('Initializing Firestore Admin SDK for vector search support');
    adminDb = new AdminFirestore({
      projectId: firebaseConfig.projectId
    });
    console.log('Firestore Admin SDK initialized for vector search');
  } else {
    console.log('No Google credentials found, Admin SDK will not be available for vector search');
    console.log('Consider adding a service account for full vector search support');
  }
} catch (error) {
  console.warn('Failed to initialize Firestore Admin SDK:', error);
}

/**
 * Memory types supported by the agent
 */
export type MemoryType = 'short_term' | 'long_term' | 'conversation' | 'reflection';

/**
 * Interface for agent memory
 */
export interface AgentMemory {
  id: string;
  content: string;
  type: MemoryType;
  timestamp: Date | Timestamp | number;
  relevance?: number;
  tags: string[];
  metadata?: Record<string, any>;
  embedding?: number[];
}

/**
 * Service for storing and managing agent memories
 */
export class AgentMemoryService {
  // Using a dedicated collection for agent memories
  private static readonly COLLECTION_NAME = 'AgentMemory';//DON'T CHANGE THIS
  
  /**
   * Store a new memory for the agent
   */
  public static async storeMemory(
    content: string,
    type: MemoryType,
    metadata: Record<string, any> = {},
    extraTags: string[] = []
  ): Promise<string> {
    console.log(`📝 Storing ${type} memory: "${content.substring(0, 50)}${content.length > 50 ? '...' : ''}"`);
    
    try {
      // Generate embedding for the memory to enable similarity search
      console.log('Generating embedding for memory...');
      const embedding = await EmbeddingService.getEmbedding(content);
      console.log(`✓ Generated memory embedding (${embedding.length} dimensions)`);
      
      // Prepare memory document data
      const memoryData = {
        title: `Memory: ${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`,
        content: content,
        type: type, 
        tags: [`memory_${type}`, ...extraTags],
        timestamp: new Date(),
        embedding: embedding,
        metadata: {
          memoryType: type,
          createdAt: new Date().toISOString(),
          ...metadata
        }
      };
      
      // Store in dedicated agent_memory collection
      console.log('Storing memory in Firestore...');
      const memoryCollection = collection(firestoreDb, this.COLLECTION_NAME);
      const docRef = await addDoc(memoryCollection, memoryData);
      console.log(`✓ Memory stored with ID: ${docRef.id}`);
      
      return docRef.id;
    } catch (error) {
      console.error('❌ Error storing memory:', error);
      if (error instanceof Error) {
        console.error('Error details:', {
          message: error.message,
          name: error.name,
          stack: error.stack
        });
      }
      throw error;
    }
  }
  
  /**
   * Retrieve memories by type
   */
  public static async getMemoriesByType(
    type: MemoryType,
    maxResults: number = 10
  ): Promise<AgentMemory[]> {
    console.log(`🔍 Retrieving ${maxResults} ${type} memories`);
    
    try {
      const memoryCollection = collection(firestoreDb, this.COLLECTION_NAME);
      
      // Build query for the specified memory type
      // Note: You may need to create a composite index for this query
      const memoryQuery = query(
        memoryCollection,
        where('type', '==', type),
        orderBy('timestamp', 'desc'),
        limit(maxResults)
      );
      
      // Execute query
      const querySnapshot = await getDocs(memoryQuery);
      
      // Process results
      const memories: AgentMemory[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        memories.push({
          id: doc.id,
          content: data.content,
          type: type,
          timestamp: data.timestamp,
          tags: data.tags,
          metadata: data.metadata,
          embedding: data.embedding
        });
      });
      
      console.log(`✓ Retrieved ${memories.length} ${type} memories`);
      return memories;
    } catch (error) {
      console.error(`❌ Error retrieving ${type} memories:`, error);
      
      // Fallback to simpler query without ordering if we hit an index error
      if (error instanceof Error && error.message?.includes('index')) {
        console.log('Index error detected. Using fallback query without ordering...');
        return this.getMemoriesByTypeFallback(type, maxResults);
      }
      
      return [];
    }
  }
  
  /**
   * Utility function to get milliseconds from different timestamp formats
   */
  private static getTimestampMs(timestamp: Date | Timestamp | number | any): number {
    if (timestamp instanceof Date) {
      return timestamp.getTime();
    } else if (
      typeof timestamp === 'object' && 
      timestamp !== null &&
      'seconds' in timestamp && 
      typeof timestamp.seconds === 'number'
    ) {
      // Handle Firestore Timestamp
      return timestamp.seconds * 1000;
    } else if (typeof timestamp === 'number') {
      return timestamp;
    }
    // Default value if timestamp is invalid
    return 0;
  }
  
  /**
   * Fallback method to retrieve memories without requiring a composite index
   * (Useful during development)
   */
  private static async getMemoriesByTypeFallback(
    type: MemoryType,
    maxResults: number = 10
  ): Promise<AgentMemory[]> {
    try {
      const memoryCollection = collection(firestoreDb, this.COLLECTION_NAME);
      
      // Simpler query that doesn't require a composite index
      const memoryQuery = query(
        memoryCollection,
        where('type', '==', type)
      );
      
      const querySnapshot = await getDocs(memoryQuery);
      
      // Process results
      const memories: AgentMemory[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        memories.push({
          id: doc.id,
          content: data.content,
          type: type,
          timestamp: data.timestamp,
          tags: data.tags || [],
          metadata: data.metadata,
          embedding: data.embedding
        });
      });
      
      // Sort by timestamp in memory
      memories.sort((a, b) => {
        const timeA = this.getTimestampMs(a.timestamp);
        const timeB = this.getTimestampMs(b.timestamp);
        
        return timeB - timeA; // Descending order (newest first)
      });
      
      const limitedMemories = memories.slice(0, maxResults);
      console.log(`✓ Retrieved ${limitedMemories.length} ${type} memories with fallback method`);
      return limitedMemories;
    } catch (error) {
      console.error(`❌ Error retrieving ${type} memories with fallback method:`, error);
      if (error instanceof Error) {
        console.error('Error details:', error.message);
      }
      return [];
    }
  }
  
  /**
   * Retrieve memories relevant to a specific context using vector similarity
   * Implementation follows the official Firebase vector search documentation
   */
  public static async getRelevantMemories(
    context: string,
    maxResults: number = 5,
    types: MemoryType[] = ['short_term', 'long_term', 'conversation']
  ): Promise<AgentMemory[]> {
    console.log(`🧠 Retrieving memories relevant to: "${context.substring(0, 50)}${context.length > 50 ? '...' : ''}"`);
    
    try {
      // Generate embedding for the context
      const embedding = await EmbeddingService.getEmbedding(context);
      console.log(`Generated query embedding with ${embedding.length} dimensions`);
      
      // Try vector search with Admin SDK first if available
      if (adminDb) {
        try {
          console.log('Attempting vector search with Firestore Admin SDK...');
          
          // Get collection reference using Admin SDK
          const adminCollection = adminDb.collection(this.COLLECTION_NAME);
          
          // Create vector query using Admin SDK pattern (matches documentation)
          console.log('Creating vector query with Admin SDK...');
          const vectorQuery = adminCollection.findNearest({
            vectorField: 'embedding',
            queryVector: embedding,
            limit: maxResults,
            distanceMeasure: 'COSINE',
            distanceResultField: 'vector_distance'
          });
          
          // Execute the query
          console.log('Executing vector query...');
          const snapshot = await vectorQuery.get();
          console.log('Vector query completed');
          
          // Process results if available
          if (snapshot && !snapshot.empty) {
            console.log(`Vector search found ${snapshot.size} results`);
            
            // Convert to our memory format
            const memories: AgentMemory[] = [];
            
            snapshot.forEach((doc: any) => {
              const data = doc.data();
              console.log(`Processing result document: ${doc.id}`);
              
              // Only include memories of the requested types
              if (types && types.length > 0 && !types.includes(data.type)) {
                console.log(`Skipping document ${doc.id} - type ${data.type} not in requested types`);
                return;
              }
              
              // Add to our results
              memories.push({
                id: doc.id,
                content: data.content,
                type: data.type as MemoryType,
                timestamp: data.timestamp,
                tags: data.tags || [],
                metadata: data.metadata,
                relevance: 1 - (data.vector_distance || 0), // Convert distance to similarity
                embedding: data.embedding as number[]
              });
              
              console.log(`Added document ${doc.id} with similarity ${1 - (data.vector_distance || 0)}`);
            });
            
            // Sort by relevance (most similar first)
            memories.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
            
            console.log(`✓ Retrieved ${memories.length} relevant memories using vector search`);
            return memories.slice(0, maxResults);
          } else {
            console.log('Vector search returned no results');
          }
        } catch (adminError) {
          console.warn('Admin SDK vector search failed:', adminError);
          if (adminError instanceof Error) {
            console.warn('Admin SDK error details:', adminError.message);
            
            if (adminError.message.includes('index')) {
              console.warn(`
                Missing vector search index. Ensure you have deployed the proper index:
                {
                  "indexes": [
                    {
                      "collectionGroup": "${this.COLLECTION_NAME}",
                      "queryScope": "COLLECTION",
                      "fields": [
                        { "fieldPath": "embedding", "vectorConfig": "distance" }
                      ]
                    }
                  ]
                }
              `);
            }
          }
        }
      } else {
        console.log('Admin SDK not available, skipping Admin SDK vector search attempt');
      }
      
      // Try vector search with Client SDK as fallback
      try {
        console.log('Attempting vector search with Firestore Client SDK (fallback)...');
        
        // Get reference to memory collection using Client SDK
        const memoryCollection = collection(firestoreDb, this.COLLECTION_NAME);
        
        // Check if the client SDK has vector search capability
        const collectionAny = memoryCollection as any;
        
        if (typeof collectionAny.findNearest === 'function') {
          console.log('Creating vector query with Client SDK...');
          
          // Attempt vector search with Client SDK
          const vectorQuery = collectionAny.findNearest({
            vectorField: 'embedding',
            queryVector: embedding,
            limit: maxResults,
            distanceMeasure: 'COSINE',
            distanceResultField: 'vector_distance'
          });
          
          console.log('Executing vector query...');
          const snapshot = await vectorQuery.get();
          
          if (snapshot && snapshot.docs && snapshot.docs.length > 0) {
            console.log(`Vector search found ${snapshot.docs.length} results`);
            
            // Process results
            const memories: AgentMemory[] = [];
            
            snapshot.docs.forEach((doc: any) => {
              const data = doc.data();
              
              // Filter by type
              if (types && types.length > 0 && !types.includes(data.type)) {
                return;
              }
              
              memories.push({
                id: doc.id,
                content: data.content,
                type: data.type as MemoryType,
                timestamp: data.timestamp,
                tags: data.tags || [],
                metadata: data.metadata,
                relevance: 1 - (data.vector_distance || 0),
                embedding: data.embedding as number[]
              });
            });
            
            memories.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
            
            console.log(`✓ Retrieved ${memories.length} relevant memories using Client SDK vector search`);
            return memories.slice(0, maxResults);
          }
        } else {
          console.log('Client SDK does not support vector search (findNearest method not available)');
        }
      } catch (clientError) {
        console.warn('Client SDK vector search failed:', clientError);
      }
      
      // Fall back to in-memory calculation if both approaches fail
      console.log('Vector search not available or failed, falling back to in-memory similarity calculation');
      return this.getRelevantMemoriesFallback(context, embedding, maxResults, types);
      
    } catch (error) {
      console.error('❌ Error retrieving relevant memories:', error);
      if (error instanceof Error) {
        console.error('Error details:', error.message);
      }
      return [];
    }
  }
  
  /**
   * Fallback method for retrieving relevant memories using in-memory similarity calculation
   * Used when vector search is not available or fails
   */
  private static async getRelevantMemoriesFallback(
    context: string,
    embedding: number[],
    maxResults: number = 5,
    types: MemoryType[] = ['short_term', 'long_term', 'conversation']
  ): Promise<AgentMemory[]> {
    console.log('Using fallback in-memory similarity calculation');
    
    try {
      // Filter by memory types if specified
      let memoryQuery;
      if (types && types.length > 0) {
        memoryQuery = query(
          collection(firestoreDb, this.COLLECTION_NAME),
          where('type', 'in', types)
        );
      } else {
        memoryQuery = query(
          collection(firestoreDb, this.COLLECTION_NAME)
        );
      }
      
      const querySnapshot = await getDocs(memoryQuery);
      
      // Calculate similarity and rank the memories
      const scoredMemories: {memory: AgentMemory, similarity: number}[] = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        
        // Skip if the document doesn't have an embedding
        if (!data.embedding || !Array.isArray(data.embedding)) {
          return;
        }
        
        // Calculate cosine similarity
        const docEmbedding = data.embedding as number[];
        const dotProduct = embedding.reduce((sum, val, i) => sum + val * docEmbedding[i], 0);
        const mag1 = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
        const mag2 = Math.sqrt(docEmbedding.reduce((sum, val) => sum + val * val, 0));
        const similarity = dotProduct / (mag1 * mag2);
        
        // Add to scored memories
        scoredMemories.push({
          memory: {
            id: doc.id,
            content: data.content,
            type: data.type as MemoryType,
            timestamp: data.timestamp,
            tags: data.tags || [],
            metadata: data.metadata,
            relevance: similarity,
            embedding: data.embedding as number[]
          },
          similarity
        });
      });
      
      // Sort by similarity score (highest first)
      const sortedMemories = scoredMemories
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, maxResults)
        .map(item => item.memory);
      
      console.log(`✓ Retrieved ${sortedMemories.length} relevant memories with fallback method`);
      return sortedMemories;
    } catch (error) {
      console.error('❌ Error retrieving relevant memories with fallback method:', error);
      if (error instanceof Error) {
        console.error('Error details:', error.message);
      }
      return [];
    }
  }
  
  /**
   * Clear all memories of a specific type
   */
  public static async clearMemoriesByType(type: MemoryType): Promise<boolean> {
    console.warn(`Clearing all memories of type: ${type}`);
    console.warn('This operation is not implemented with batched deletes.');
    console.warn('You should implement a server-side function to do this safely.');
    return false;
  }
}

// Example usage:
// AgentMemoryService.storeMemory(
//   "User asked about wicked problems in design thinking.",
//   "conversation",
//   {
//     session: "session123",
//     importance: "high"
//   }
// ); 