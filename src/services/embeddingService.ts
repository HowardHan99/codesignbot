/**
 * Service for handling vector embeddings and similarity search
 */
import { EmbeddingCacheService } from './embeddingCacheService';

export class EmbeddingService {
  private static cache = EmbeddingCacheService.getInstance();

  /**
   * Gets embeddings for a given text using OpenAI's API with caching
   */
  private static async getEmbedding(text: string): Promise<number[]> {
    // Try to get from cache first
    const cachedEmbedding = await this.cache.getFromCache(text);
    if (cachedEmbedding) {
      return cachedEmbedding;
    }

    // If not in cache, get from API
    const response = await fetch('/api/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      throw new Error('Failed to get embeddings');
    }

    const { embedding } = await response.json();
    
    // Save to cache
    await this.cache.saveToCache(text, embedding);
    
    return embedding;
  }

  /**
   * Calculates cosine similarity between two vectors
   */
  private static cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magnitudeA * magnitudeB);
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