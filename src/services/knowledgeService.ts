import { getFirestore, collection, addDoc, getDocs, query, where, orderBy, limit, DocumentData, CollectionReference, Query } from 'firebase/firestore';
import { EmbeddingService } from './embeddingService';

/**
 * Knowledge document interface for RAG implementation
 */
export interface KnowledgeDocument {
  id: string;
  type: 'design_principle' | 'past_analysis' | 'industry_pattern' | 'user_feedback';
  title: string;
  content: string;
  tags: string[];
  timestamp: any; // Firestore timestamp
  embedding: number[]; // Vector representation
}

/**
 * Service for managing the knowledge base for RAG (Retrieval-Augmented Generation)
 */
export class KnowledgeService {
  private static readonly CHUNK_SIZE = 500; // Characters per chunk
  private static readonly CHUNK_OVERLAP = 100; // Characters of overlap
  private static readonly COLLECTION_NAME = 'knowledge';

  /**
   * Add a document to the knowledge base with automatic chunking and embedding
   */
  public static async addDocument(
    title: string,
    content: string,
    type: 'design_principle' | 'past_analysis' | 'industry_pattern' | 'user_feedback',
    tags: string[] = []
  ): Promise<string[]> {
    try {
      // Chunk the document content
      const chunks = this.chunkText(content);
      const docIds: string[] = [];
      
      // Generate embeddings and store chunks in parallel
      const db = getFirestore();
      const knowledgeCollection = collection(db, this.COLLECTION_NAME);
      
      const storePromises = chunks.map(async (chunk, index) => {
        // Generate embedding for this chunk
        const embedding = await EmbeddingService.getEmbedding(chunk);
        
        // Prepare document data
        const docData = {
          title: `${title} ${chunks.length > 1 ? `(${index + 1}/${chunks.length})` : ''}`,
          content: chunk,
          type,
          tags,
          timestamp: new Date(),
          embedding
        };
        
        // Store in Firestore
        const docRef = await addDoc(knowledgeCollection, docData);
        return docRef.id;
      });
      
      const ids = await Promise.all(storePromises);
      return ids.filter(Boolean) as string[];
    } catch (error) {
      console.error('Error adding document to knowledge base:', error);
      throw error;
    }
  }
  
  /**
   * Split text into chunks with overlap
   */
  private static chunkText(text: string): string[] {
    const chunks: string[] = [];
    let startIndex = 0;
    
    while (startIndex < text.length) {
      // Calculate end index for this chunk
      const endIndex = Math.min(startIndex + this.CHUNK_SIZE, text.length);
      
      // Find a good break point (end of sentence or paragraph)
      let breakIndex = endIndex;
      if (breakIndex < text.length) {
        // Look for sentence or paragraph breaks
        const possibleBreaks = [
          text.lastIndexOf('. ', breakIndex),
          text.lastIndexOf('.\n', breakIndex),
          text.lastIndexOf('\n\n', breakIndex)
        ].filter(i => i > startIndex);
        
        if (possibleBreaks.length > 0) {
          // Use the latest good break point
          breakIndex = Math.max(...possibleBreaks) + 1;
        }
      }
      
      // Extract the chunk
      chunks.push(text.substring(startIndex, breakIndex).trim());
      
      // Move to the next chunk start, accounting for overlap
      startIndex = breakIndex - this.CHUNK_OVERLAP;
      if (startIndex < 0) startIndex = 0;
      
      // Avoid creating tiny chunks at the end
      if (text.length - startIndex < this.CHUNK_SIZE / 2) {
        if (chunks.length > 0) {
          // Append the last bit to the previous chunk if it exists
          chunks[chunks.length - 1] += " " + text.substring(startIndex).trim();
        } else {
          // Otherwise create a new chunk
          chunks.push(text.substring(startIndex).trim());
        }
        break;
      }
    }
    
    return chunks;
  }

  /**
   * Retrieve relevant knowledge for a query
   */
  public static async retrieveRelevantKnowledge(
    queryText: string, 
    filter?: { types?: string[], tags?: string[] },
    maxResults: number = 5
  ): Promise<KnowledgeDocument[]> {
    try {
      // Generate embedding for the query
      const queryEmbedding = await EmbeddingService.getEmbedding(queryText);
      
      // Get Firestore instance
      const db = getFirestore();
      const knowledgeCollection = collection(db, this.COLLECTION_NAME) as CollectionReference<KnowledgeDocument>;
      
      // Build the base query
      let baseQuery: Query<KnowledgeDocument> = query(knowledgeCollection);
      
      // Apply filters if provided
      if (filter?.types) {
        baseQuery = query(baseQuery, where('type', 'in', filter.types));
      }
      
      if (filter?.tags && filter.tags.length > 0) {
        baseQuery = query(baseQuery, where('tags', 'array-contains-any', filter.tags));
      }

      // Execute query with vector search
      const snapshot = await getDocs(baseQuery);
      
      // Perform vector similarity ranking in memory
      const results = await Promise.all(
        snapshot.docs.map(async (doc) => {
          const data = doc.data();
          const similarity = EmbeddingService.cosineSimilarity(queryEmbedding, data.embedding);
          return {
            ...data,
            id: doc.id,
            similarity
          };
        })
      );
      
      // Sort by similarity and return top results
      return results
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, maxResults)
        .map(({ similarity, ...doc }) => doc); // Remove similarity from final results
    } catch (error) {
      console.error('Error retrieving knowledge:', error);
      return [];
    }
  }
  
  /**
   * Store the current analysis as knowledge for future reference
   */
  public static async storeAnalysisAsKnowledge(
    designChallenge: string,
    decisions: string[],
    analysis: string[],
    tags: string[] = []
  ): Promise<string[]> {
    try {
      // Format the content nicely
      const content = `
Design Challenge: ${designChallenge}

Design Decisions:
${decisions.map((d, i) => `${i+1}. ${d}`).join('\n')}

Analysis:
${analysis.map((a, i) => `${i+1}. ${a}`).join('\n')}
      `;
      
      // Store as a knowledge document
      return await this.addDocument(
        `Analysis: ${designChallenge.substring(0, 50)}`,
        content,
        'past_analysis',
        [...tags, 'auto-generated']
      );
    } catch (error) {
      console.error('Error storing analysis as knowledge:', error);
      return [];
    }
  }

  /**
   * List all documents in the knowledge base
   */
  public static async listDocuments(
    filter?: { types?: string[], tags?: string[] },
    maxResults: number = 50
  ): Promise<KnowledgeDocument[]> {
    try {
      const db = getFirestore();
      const knowledgeCollection = collection(db, this.COLLECTION_NAME) as CollectionReference<KnowledgeDocument>;
      
      let baseQuery: Query<KnowledgeDocument> = query(knowledgeCollection, orderBy('timestamp', 'desc'), limit(maxResults));
      
      if (filter?.types) {
        baseQuery = query(baseQuery, where('type', 'in', filter.types));
      }
      
      if (filter?.tags && filter.tags.length > 0) {
        baseQuery = query(baseQuery, where('tags', 'array-contains-any', filter.tags));
      }
      
      const snapshot = await getDocs(baseQuery);
      
      return snapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id
      }));
    } catch (error) {
      console.error('Error listing documents:', error);
      return [];
    }
  }
} 