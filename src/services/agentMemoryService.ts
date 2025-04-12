/**
 * Service for storing and retrieving agent memories
 * Uses a dedicated collection for agent memories
 */

import { getFirestore, collection, addDoc, getDocs, query, where, orderBy, limit, DocumentData } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';
import { firebaseConfig } from '../utils/config';
import { EmbeddingService } from './embeddingService';

// Initialize Firebase if it hasn't been already
let firestoreDb: any;
try {
  // Try to initialize Firebase (will throw if already initialized)
  const app = initializeApp(firebaseConfig);
  firestoreDb = getFirestore(app);
  console.log('Firestore initialized in agentMemoryService');
} catch (error) {
  // Firebase already initialized, just get Firestore
  firestoreDb = getFirestore();
  console.log('Using existing Firestore instance for agentMemoryService');
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
  timestamp: Date | number;
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
  private static readonly COLLECTION_NAME = 'AgentMemory';
  
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
          tags: data.tags,
          metadata: data.metadata,
          embedding: data.embedding
        });
      });
      
      // Sort by timestamp in memory
      memories.sort((a, b) => {
        // Handle various timestamp formats
        const getTimestampMs = (timestamp: any): number => {
          if (timestamp instanceof Date) {
            return timestamp.getTime();
          } else if (typeof timestamp === 'object' && timestamp !== null) {
            // Handle Firestore Timestamp
            if ('seconds' in timestamp && typeof timestamp.seconds === 'number') {
              return timestamp.seconds * 1000;
            }
          }
          // Default value if timestamp is invalid
          return 0;
        };
        
        const timeA = getTimestampMs(a.timestamp);
        const timeB = getTimestampMs(b.timestamp);
        
        return timeB - timeA; // Descending order (newest first)
      });
      
      const limitedMemories = memories.slice(0, maxResults);
      console.log(`✓ Retrieved ${limitedMemories.length} ${type} memories with fallback method`);
      return limitedMemories;
    } catch (error) {
      console.error(`❌ Error retrieving ${type} memories with fallback method:`, error);
      return [];
    }
  }
  
  /**
   * Retrieve memories relevant to a specific context using vector similarity
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
        const docEmbedding = data.embedding;
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
            tags: data.tags,
            metadata: data.metadata,
            relevance: similarity,
            embedding: data.embedding
          },
          similarity
        });
      });
      
      // Sort by similarity score (highest first)
      const sortedMemories = scoredMemories
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, maxResults)
        .map(item => item.memory);
      
      console.log(`✓ Retrieved ${sortedMemories.length} relevant memories`);
      return sortedMemories;
    } catch (error) {
      console.error('❌ Error retrieving relevant memories:', error);
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