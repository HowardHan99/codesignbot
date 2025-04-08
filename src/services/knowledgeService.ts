import { getDatabase, ref, push, get, set, serverTimestamp } from 'firebase/database';
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
  timestamp: any; // Firebase timestamp
  embedding: number[]; // Vector representation
}

/**
 * Service for managing the knowledge base for RAG (Retrieval-Augmented Generation)
 */
export class KnowledgeService {
  private static readonly CHUNK_SIZE = 500; // Characters per chunk
  private static readonly CHUNK_OVERLAP = 100; // Characters of overlap

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
      const db = getDatabase();
      
      const storePromises = chunks.map(async (chunk, index) => {
        // Generate embedding for this chunk
        const embedding = await EmbeddingService.getEmbedding(chunk);
        
        // Prepare document data
        const docData = {
          title: `${title} ${chunks.length > 1 ? `(${index + 1}/${chunks.length})` : ''}`,
          content: chunk,
          type,
          tags,
          timestamp: serverTimestamp(),
          embedding
        };
        
        // Store in Firebase
        const knowledgeRef = ref(db, 'knowledge');
        const newDocRef = push(knowledgeRef);
        await set(newDocRef, docData);
        
        return newDocRef.key;
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
    query: string, 
    filter?: { types?: string[], tags?: string[] },
    limit: number = 5
  ): Promise<KnowledgeDocument[]> {
    try {
      // Generate embedding for the query
      const queryEmbedding = await EmbeddingService.getEmbedding(query);
      
      // Get knowledge documents from Firebase
      const db = getDatabase();
      const knowledgeRef = ref(db, 'knowledge');
      const snapshot = await get(knowledgeRef);
      
      if (!snapshot.exists()) {
        return [];
      }
      
      // Filter and rank by similarity
      const documents: (KnowledgeDocument & { similarity: number })[] = [];
      
      snapshot.forEach((doc) => {
        const data = doc.val();
        
        // Apply type and tag filters if provided
        if (filter?.types && !filter.types.includes(data.type)) {
          return;
        }
        
        if (filter?.tags && filter.tags.length > 0) {
          const hasMatchingTag = data.tags.some((tag: string) => 
            filter.tags!.includes(tag)
          );
          if (!hasMatchingTag) {
            return;
          }
        }
        
        // Calculate similarity
        const similarity = EmbeddingService.cosineSimilarity(
          queryEmbedding,
          data.embedding
        );
        
        // Add to results if similarity is above threshold
        if (similarity > 0.3) {
          documents.push({
            id: doc.key as string,
            ...data,
            similarity
          });
        }
      });
      
      // Sort by similarity and limit results
      return documents
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);
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
    limit: number = 50
  ): Promise<KnowledgeDocument[]> {
    try {
      const db = getDatabase();
      const knowledgeRef = ref(db, 'knowledge');
      const snapshot = await get(knowledgeRef);
      
      if (!snapshot.exists()) {
        return [];
      }
      
      const documents: KnowledgeDocument[] = [];
      
      snapshot.forEach((doc) => {
        const data = doc.val();
        
        // Apply type and tag filters if provided
        if (filter?.types && !filter.types.includes(data.type)) {
          return;
        }
        
        if (filter?.tags && filter.tags.length > 0) {
          const hasMatchingTag = data.tags.some((tag: string) => 
            filter.tags!.includes(tag)
          );
          if (!hasMatchingTag) {
            return;
          }
        }
        
        documents.push({
          id: doc.key as string,
          ...data
        });
      });
      
      // Sort by timestamp (newest first) and limit results
      return documents
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);
    } catch (error) {
      console.error('Error listing documents:', error);
      return [];
    }
  }
} 