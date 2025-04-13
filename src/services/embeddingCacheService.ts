// Remove Firebase import
// import { getDatabase, ref, get, set } from 'firebase/database';

interface EmbeddingCache {
  [key: string]: {
    embedding: number[];
    timestamp: number;
  };
}

/**
 * Service for caching embeddings in memory
 * Previously also cached to Firebase Realtime Database, but that has been removed
 */
export class EmbeddingCacheService {
  private static instance: EmbeddingCacheService;
  private memoryCache: EmbeddingCache = {};
  private readonly CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
  private readonly MEMORY_CACHE_SIZE = 2000; // Increased maximum number of items in memory cache

  private constructor() {}

  public static getInstance(): EmbeddingCacheService {
    if (!EmbeddingCacheService.instance) {
      EmbeddingCacheService.instance = new EmbeddingCacheService();
    }
    return EmbeddingCacheService.instance;
  }

  /**
   * Generates a cache key for a text string
   */
  private generateKey(text: string): string {
    // Simple hash function for text
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `embedding_${hash}`;
  }

  /**
   * Checks if a cached item is still valid
   */
  private isValid(timestamp: number): boolean {
    return Date.now() - timestamp < this.CACHE_DURATION;
  }

  /**
   * Gets an embedding from memory cache
   */
  public async getFromCache(text: string): Promise<number[] | null> {
    const key = this.generateKey(text);

    // Check memory cache
    if (this.memoryCache[key] && this.isValid(this.memoryCache[key].timestamp)) {
      console.log('Cache hit: Memory cache');
      return this.memoryCache[key].embedding;
    }

    return null;
  }

  /**
   * Saves an embedding to memory cache
   */
  public async saveToCache(text: string, embedding: number[]): Promise<void> {
    const key = this.generateKey(text);
    const data = {
      embedding,
      timestamp: Date.now()
    };

    // Save to memory cache
    this.memoryCache[key] = data;

    // Trim memory cache if it's too large
    const keys = Object.keys(this.memoryCache);
    if (keys.length > this.MEMORY_CACHE_SIZE) {
      const oldestKey = keys.reduce((a, b) => 
        this.memoryCache[a].timestamp < this.memoryCache[b].timestamp ? a : b
      );
      delete this.memoryCache[oldestKey];
    }
  }

  /**
   * Clears expired items from memory cache
   */
  public async clearExpiredCache(): Promise<void> {
    // Clear memory cache
    Object.entries(this.memoryCache).forEach(([key, value]) => {
      if (!this.isValid(value.timestamp)) {
        delete this.memoryCache[key];
      }
    });
  }

  /**
   * MIGRATION: Clears Firebase embeddings cache
   * Call this once to clear out Firebase cache
   * @requires Firebase imports to be temporarily restored
   */
  public static async clearFirebaseEmbeddingsCache(): Promise<void> {
    try {
      // Implement when needed by temporarily restoring imports
      console.log('Firebase embeddings migration is not implemented in this version');
      // For implementation, uncomment and use:
      // const db = getDatabase();
      // const cacheRef = ref(db, 'embeddings');
      // await set(cacheRef, null);
    } catch (error) {
      console.error('Error clearing Firebase embeddings cache:', error);
    }
  }
} 