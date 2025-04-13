import { getDatabase, ref, get, set } from 'firebase/database';

interface EmbeddingCache {
  [key: string]: {
    embedding: number[];
    timestamp: number;
  };
}

/**
 * Service for caching embeddings both in memory and Firebase
 */
export class EmbeddingCacheService {
  private static instance: EmbeddingCacheService;
  private memoryCache: EmbeddingCache = {};
  private readonly CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
  private readonly MEMORY_CACHE_SIZE = 1000; // Maximum number of items in memory cache

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
   * Gets an embedding from cache (memory or Firebase)
   */
  public async getFromCache(text: string): Promise<number[] | null> {
    const key = this.generateKey(text);

    // Check memory cache first
    if (this.memoryCache[key] && this.isValid(this.memoryCache[key].timestamp)) {
      console.log('Cache hit: Memory cache');
      return this.memoryCache[key].embedding;
    }

    // Check Firebase cache
    try {
      const db = getDatabase();
      const cacheRef = ref(db, `embeddings/${key}`);
      const snapshot = await get(cacheRef);

      if (snapshot.exists()) {
        const data = snapshot.val();
        if (this.isValid(data.timestamp)) {
          console.log('Cache hit: Firebase cache');
          // Update memory cache
          this.memoryCache[key] = data;
          return data.embedding;
        }
      }
    } catch (error) {
      console.error('Error reading from Firebase cache:', error);
    }

    return null;
  }

  /**
   * Saves an embedding to both memory and Firebase cache
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

    // Save to Firebase
    try {
      const db = getDatabase();
      const cacheRef = ref(db, `embeddings/${key}`);
      await set(cacheRef, data);
    } catch (error) {
      console.error('Error saving to Firebase cache:', error);
    }
  }

  /**
   * Clears expired items from both memory and Firebase cache
   */
  public async clearExpiredCache(): Promise<void> {
    const now = Date.now();

    // Clear memory cache
    Object.entries(this.memoryCache).forEach(([key, value]) => {
      if (!this.isValid(value.timestamp)) {
        delete this.memoryCache[key];
      }
    });

    // Clear Firebase cache
    try {
      const db = getDatabase();
      const cacheRef = ref(db, 'embeddings');
      const snapshot = await get(cacheRef);

      if (snapshot.exists()) {
        const updates: { [key: string]: null } = {};
        Object.entries(snapshot.val()).forEach(([key, value]: [string, any]) => {
          if (!this.isValid(value.timestamp)) {
            updates[key] = null;
          }
        });

        // Batch remove expired items
        if (Object.keys(updates).length > 0) {
          await set(cacheRef, updates);
        }
      }
    } catch (error) {
      console.error('Error clearing Firebase cache:', error);
    }
  }
} 