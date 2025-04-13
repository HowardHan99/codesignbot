/**
 * Service for handling vector embeddings and similarity search
 */
import { EmbeddingCacheService } from './embeddingCacheService';

// Constants
const API_BASE_URL = typeof window !== 'undefined' 
  ? '/api/embeddings'
  : 'http://localhost:3000/api/embeddings';

// Configuration for test/production environments
const IS_TEST_ENV = process.env.NODE_ENV === 'test' || process.env.TEST_MODE === 'true';

export class EmbeddingService {
  private static cache = EmbeddingCacheService.getInstance();

  /**
   * Gets embeddings for a given text using OpenAI's API with caching
   */
  public static async getEmbedding(text: string): Promise<number[]> {
    console.log(`Getting embedding for text (${text.length} chars): ${text.substring(0, 100)}...`);
    
    try {
      // Try to get from cache first
      console.log('Checking embedding cache...');
      const cachedEmbedding = await this.cache.getFromCache(text);
      if (cachedEmbedding) {
        console.log('✓ Found embedding in cache');
        return cachedEmbedding;
      }
      console.log('Cache miss, fetching from API...');

      // If running in test mode or Node.js environment without the API available,
      // generate deterministic mock embeddings instead of calling the API
      if (IS_TEST_ENV || (typeof window === 'undefined' && !process.env.OPENAI_API_KEY)) {
        console.log('Using mock embeddings for testing environment');
        const mockEmbedding = this.generateMockEmbedding(text);
        
        // Save to cache
        console.log('Saving mock embedding to cache...');
        await this.cache.saveToCache(text, mockEmbedding);
        console.log('✓ Saved to cache');
        
        return mockEmbedding;
      }

      // If not in cache, get from API
      const response = await fetch(API_BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        console.error('Failed to get embeddings:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData.error
        });
        throw new Error(`Embedding API error: ${errorData.error || response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.embedding || !Array.isArray(data.embedding)) {
        console.error('Invalid embedding response:', data);
        throw new Error('Invalid embedding response from API');
      }

      console.log(`✓ Generated embedding (${data.embedding.length} dimensions)`);
      
      // Save to cache
      console.log('Saving embedding to cache...');
      await this.cache.saveToCache(text, data.embedding);
      console.log('✓ Saved to cache');
      
      return data.embedding;
    } catch (error) {
      console.error('Error in getEmbedding:', error);
      if (error instanceof Error) {
        console.error('Error details:', {
          message: error.message,
          stack: error.stack,
          name: error.name
        });
      }
      
      // If all else fails, return mock embeddings as a fallback
      console.log('Falling back to mock embeddings');
      return this.generateMockEmbedding(text);
    }
  }

  /**
   * Generates deterministic mock embeddings for testing purposes
   * @param text Input text to generate a mock embedding for
   * @param dimensions Number of dimensions for the mock embedding (default: 1536)
   */
  private static generateMockEmbedding(text: string, dimensions = 1536): number[] {
    // Create a simple but deterministic hash of the text
    const hash = (str: string): number => {
      let h = 0;
      for (let i = 0; i < str.length; i++) {
        h = ((h << 5) - h) + str.charCodeAt(i);
        h |= 0; // Convert to 32bit integer
      }
      return h;
    };
    
    // Use the hash to seed a simple PRNG
    const seededRandom = (seed: number): () => number => {
      let s = seed;
      return () => {
        s = Math.sin(s) * 10000;
        return s - Math.floor(s);
      };
    };
    
    const textHash = hash(text);
    const random = seededRandom(textHash);
    
    // Generate a vector with the specified number of dimensions
    const embedding = Array(dimensions).fill(0).map(() => random() * 2 - 1);
    
    // Normalize the vector to unit length (important for cosine similarity)
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => val / magnitude);
  }

  /**
   * Calculates cosine similarity between two vectors
   */
  public static cosineSimilarity(a: number[], b: number[]): number {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      console.error('Invalid vectors for similarity calculation:', {
        aIsArray: Array.isArray(a),
        bIsArray: Array.isArray(b),
        aLength: Array.isArray(a) ? a.length : 'n/a',
        bLength: Array.isArray(b) ? b.length : 'n/a'
      });
      throw new Error('Invalid vectors for similarity calculation');
    }

    try {
      const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
      const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
      const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
      
      if (magnitudeA === 0 || magnitudeB === 0) {
        console.error('Zero magnitude vector detected:', {
          magnitudeA,
          magnitudeB
        });
        throw new Error('Cannot calculate similarity with zero magnitude vector');
      }
      
      return dotProduct / (magnitudeA * magnitudeB);
    } catch (error) {
      console.error('Error calculating similarity:', error);
      throw error;
    }
  }

  /**
   * Finds the most relevant previous analyses for the current design decisions
   * @param currentDecisions - Current design decisions to analyze
   * @param previousAnalyses - Array of previous analyses to search through
   * @param topK - Number of most relevant analyses to return
   */
  public static async findRelevantAnalyses(
    currentDecisions: string[],
    previousAnalyses: Array<{
      decisions: string[];
      analysis: { full: string[]; simplified: string[] };
    }>,
    topK: number = 3
  ): Promise<Array<{ decisions: string[]; analysis: { full: string[]; simplified: string[] } }>> {
    try {
      // Clean expired cache entries periodically
      await this.cache.clearExpiredCache();

      // Get embedding for current decisions
      const currentText = currentDecisions.join(' ');
      const currentEmbedding = await this.getEmbedding(currentText);

      // Get embeddings for all previous analyses in parallel with caching
      const previousEmbeddings = await Promise.all(
        previousAnalyses.map(async (analysis) => {
          const text = analysis.decisions.join(' ');
          return {
            analysis,
            embedding: await this.getEmbedding(text),
          };
        })
      );

      // Calculate similarities and sort
      const withSimilarities = previousEmbeddings
        .map((item) => ({
          analysis: item.analysis,
          similarity: this.cosineSimilarity(currentEmbedding, item.embedding),
        }))
        .sort((a, b) => b.similarity - a.similarity)
        // Filter out low similarity matches (optional)
        .filter(item => item.similarity > 0.3);

      // Return top K most similar analyses
      return withSimilarities.slice(0, topK).map((item) => item.analysis);
    } catch (error) {
      console.error('Error finding relevant analyses:', error);
      return [];
    }
  }
} 