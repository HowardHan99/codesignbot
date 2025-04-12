/**
 * Service for storing and retrieving agent memories
 * Uses the same vector storage infrastructure as the knowledge base
 */

import { getFirestore, collection, addDoc, getDocs, query, where, orderBy, limit, DocumentData } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';
import { firebaseConfig } from '../utils/config';
import { EmbeddingService } from './embeddingService';
import { KnowledgeService } from './knowledgeService';

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
  // Using the same collection as knowledge but with different tags and types
  private static readonly COLLECTION_NAME = 'DesignKnowledge';
  private static readonly MEMORY_TAG = 'agent_memory';
  
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
        tags: [this.MEMORY_TAG, `memory_${type}`, ...extraTags],
        timestamp: new Date(),
        embedding: embedding,
        metadata: {
          memoryType: type,
          createdAt: new Date().toISOString(),
          ...metadata
        }
      };
      
      // Store in Firestore
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
      const memoryQuery = query(
        memoryCollection,
        where('tags', 'array-contains', `memory_${type}`),
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
      
      // Create tags filter based on memory types
      const typeTags = types.map(type => `memory_${type}`);
      
      // Use KnowledgeService's similarity search with memory-specific filters
      const filters = { 
        tags: [this.MEMORY_TAG] // We only want documents tagged as memories
      };
      
      const relevantDocuments = await KnowledgeService.retrieveRelevantKnowledge(
        embedding,
        maxResults,
        filters
      );
      
      // Convert knowledge documents to agent memories
      const memories: AgentMemory[] = relevantDocuments.map(doc => ({
        id: doc.id,
        content: doc.content,
        type: (doc.metadata?.memoryType as MemoryType) || 'long_term',
        timestamp: doc.timestamp,
        tags: doc.tags,
        metadata: doc.metadata,
        embedding: doc.embedding
      }));
      
      console.log(`✓ Retrieved ${memories.length} relevant memories`);
      return memories;
    } catch (error) {
      console.error('❌ Error retrieving relevant memories:', error);
      return [];
    }
  }
  
  /**
   * Clear all memories of a specific type
   */
  public static async clearMemoriesByType(type: MemoryType): Promise<boolean> {
    // This would require a delete operation, which we're leaving out for now
    // as it would need to delete multiple documents via a transaction or batch
    console.warn('Memory deletion not implemented yet');
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