import { getFirestore, collection, addDoc, getDocs, query, where, orderBy, limit, DocumentData, CollectionReference, Query, QueryDocumentSnapshot } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';
import { EmbeddingService } from './embeddingService';
import { firebaseConfig } from '../utils/config';

// Initialize Firebase if it hasn't been already
let firestoreDb: any;
try {
  // Try to initialize Firebase (will throw if already initialized)
  const app = initializeApp(firebaseConfig);
  firestoreDb = getFirestore(app);
  console.log('Firestore initialized in knowledgeService');
} catch (error) {
  // Firebase already initialized, just get Firestore
  firestoreDb = getFirestore();
  console.log('Using existing Firestore instance');
}

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
  metadata?: Record<string, any>;
}

/**
 * Service for managing the knowledge base for RAG (Retrieval-Augmented Generation)
 */
export class KnowledgeService {
  private static readonly CHUNK_SIZE = 500; // Characters per chunk
  private static readonly CHUNK_OVERLAP = 100; // Characters of overlap
  private static readonly COLLECTION_NAME = 'DesignKnowledge';

  /**
   * Add a document to the knowledge base with automatic chunking and embedding
   */
  public static async addDocument(
    title: string,
    content: string,
    type: 'design_principle' | 'past_analysis' | 'industry_pattern' | 'user_feedback',
    tags: string[] = [],
    metadata: Record<string, any> = {}
  ): Promise<string[]> {
    console.log(`📝 Adding document: "${title}" (${content.length} chars)`);
    console.log(`Type: ${type}, Tags: ${tags.join(', ')}`);
    
    try {
      // Chunk the document content
      console.log('🔄 Chunking document...');
      const chunks = this.chunkText(content);
      console.log(`✓ Created ${chunks.length} chunks`);
      console.log(`Average chunk size: ${Math.round(chunks.reduce((sum, chunk) => sum + chunk.length, 0) / chunks.length)} chars`);
      
      const docIds: string[] = [];
      
      // Generate embeddings and store chunks in parallel
      const knowledgeCollection = collection(firestoreDb, this.COLLECTION_NAME);
      
      console.log('🧮 Generating embeddings and storing chunks...');
      let hasStorageError = false;
      let firstStorageError = null;
      
      const storePromises = chunks.map(async (chunk, index) => {
        try {
          // Generate embedding for this chunk
          console.log(`Processing chunk ${index + 1}/${chunks.length} (${chunk.length} chars)`);
          const embedding = await EmbeddingService.getEmbedding(chunk);
          console.log(`✓ Generated embedding for chunk ${index + 1}`);
          
          // Prepare document data
          const docData = {
            title: `${title} ${chunks.length > 1 ? `(${index + 1}/${chunks.length})` : ''}`,
            content: chunk,
            type,
            tags,
            timestamp: new Date(),
            embedding,
            metadata: {
              ...metadata,
              chunkIndex: index,
              totalChunks: chunks.length
            }
          };
          
          // Store in Firestore
          console.log(`📥 Storing chunk ${index + 1} in Firestore...`);
          try {
            const docRef = await addDoc(knowledgeCollection, docData);
            console.log(`✓ Stored chunk ${index + 1}, ID: ${docRef.id}`);
            return docRef.id;
          } catch (error) {
            console.error(`❌ ERROR STORING CHUNK ${index + 1} IN FIRESTORE:`, error);
            
            // Check if it's a size-related error
            const errorMessage = error instanceof Error ? error.message : String(error);
            const isSizeError = errorMessage.includes('too large') || 
                               errorMessage.includes('deadline exceeded') || 
                               errorMessage.includes('400');
            
            if (isSizeError) {
              console.error('🚨 Likely document size issue. Trying with reduced content size...');
              
              try {
                // Create a document with reduced content but full embedding
                const minimalDocData = {
                  title: docData.title,
                  content: chunk.substring(0, Math.min(chunk.length, 1000)), // Limit content to 1000 chars
                  type,
                  tags,
                  timestamp: new Date(),
                  embedding, // Keep the full embedding
                  metadata: {
                    isReduced: true,
                    chunkIndex: index,
                    totalChunks: chunks.length,
                    fullContentLength: chunk.length
                  }
                };
                
                console.log(`📥 Attempting to store with reduced content (${minimalDocData.content.length} chars)...`);
                const docRef = await addDoc(knowledgeCollection, minimalDocData);
                console.log(`✓ Stored reduced content chunk ${index + 1}, ID: ${docRef.id}`);
                return docRef.id;
              } catch (fallbackError) {
                console.error(`❌ Failed to store chunk ${index + 1} even with reduced content:`, fallbackError);
              }
            }
            
            // Track first error for later display
            if (!hasStorageError) {
              hasStorageError = true;
              firstStorageError = error;
            }
            if (error instanceof Error) {
              console.error('🔥 FIRESTORE ERROR DETAILS:', {
                message: error.message,
                name: error.name,
                stack: error.stack,
                code: (error as any).code
              });
            }
            console.error('📄 DOCUMENT DATA SIZE INFO:', {
              title: docData.title,
              contentLength: docData.content.length,
              embeddingLength: docData.embedding.length,
              embeddingSize: docData.embedding.length * 8 + ' bytes',
              estimatedTotalSize: (JSON.stringify(docData).length * 2) + ' bytes' // Rough estimation
            });
            return null;
          }
        } catch (error) {
          console.error(`❌ Error processing chunk ${index + 1}:`, error);
          console.error('Chunk content:', chunk.substring(0, 100) + '...');
          if (error instanceof Error) {
            console.error('Error details:', {
              message: error.message,
              stack: error.stack,
              name: error.name
            });
          }
          return null;
        }
      });
      
      const ids = await Promise.all(storePromises);
      const successfulIds = ids.filter(Boolean) as string[];
      
      console.log('\n📊 Document processing summary:');
      console.log(`Total chunks: ${chunks.length}`);
      console.log(`Successfully processed: ${successfulIds.length}`);
      console.log(`Failed: ${chunks.length - successfulIds.length}`);
      
      if (successfulIds.length === 0) {
        console.error('❗ CRITICAL ERROR: Failed to process any chunks successfully');
        if (firstStorageError) {
          console.error('❗ FIRST STORAGE ERROR:', firstStorageError);
        }
        throw new Error('Failed to process any chunks successfully. Check Firestore permissions and rules.');
      }
      
      return successfulIds;
    } catch (error) {
      console.error('❌ Error adding document to knowledge base:', error);
      if (error instanceof Error) {
        console.error('Error details:', {
          message: error.message,
          stack: error.stack,
          name: error.name
        });
      }
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
    embedding: number[],
    maxResults: number = 5,
    filters?: { [key: string]: any }
  ): Promise<KnowledgeDocument[]> {
    const knowledgeCollection = collection(firestoreDb, this.COLLECTION_NAME);

    // Build base query with filters
    let baseQuery: Query<DocumentData> = knowledgeCollection;
    if (filters) {
      Object.entries(filters).forEach(([field, value]) => {
        baseQuery = query(baseQuery, where(field, '==', value));
      });
    }

    // Fetch documents
    const querySnapshot = await getDocs(baseQuery);
    const documents: QueryDocumentSnapshot<DocumentData>[] = [];
    querySnapshot.forEach((doc) => {
      documents.push(doc);
    });

    // Calculate similarity scores and rank in memory
    const scoredDocs = documents.map((doc) => {
      const data = doc.data();
      const docEmbedding = data.embedding as number[];
      
      // Calculate cosine similarity between embeddings
      const dotProduct = embedding.reduce((sum, val, i) => sum + val * docEmbedding[i], 0);
      const mag1 = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      const mag2 = Math.sqrt(docEmbedding.reduce((sum, val) => sum + val * val, 0));
      const similarity = dotProduct / (mag1 * mag2);
      
      return { 
        doc: {
          id: doc.id,
          title: data.title as string,
          content: data.content as string,
          type: data.type as string,
          tags: data.tags as string[],
          embedding: docEmbedding,
          timestamp: data.timestamp as number
        } as KnowledgeDocument, 
        similarity 
      };
    });

    // Sort by similarity and take top results
    const sortedDocs = scoredDocs
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, maxResults);

    return sortedDocs.map(({ doc }) => doc);
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
      const knowledgeCollection = collection(firestoreDb, this.COLLECTION_NAME) as CollectionReference<KnowledgeDocument>;
      
      // Start with a basic query
      let baseQuery = query(knowledgeCollection);
      
      // Add filters if provided
      if (filter?.types?.length) {
        baseQuery = query(baseQuery, where('type', 'in', filter.types));
      }
      
      if (filter?.tags?.length) {
        baseQuery = query(baseQuery, where('tags', 'array-contains-any', filter.tags));
      }
      
      // Add ordering and limit at the end
      baseQuery = query(baseQuery, orderBy('timestamp', 'desc'), limit(maxResults));
      
      const snapshot = await getDocs(baseQuery);
      
      return snapshot.docs.map(doc => ({
        ...doc.data() as KnowledgeDocument,
        id: doc.id
      }));
    } catch (error) {
      console.error('Error listing documents:', error);
      return [];
    }
  }
} 