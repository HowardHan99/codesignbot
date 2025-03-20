/**
 * Service for caching OpenAI API responses to avoid duplicate calls
 */

export interface OpenAIRequestParams {
  systemPrompt: string;
  userPrompt: string;
  useGpt4?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export interface OpenAIResponse {
  response: string;
  timestamp: number;
  tokens?: {
    prompt: number;
    completion: number;
    total: number;
  };
}

export interface CacheEntry {
  key: string;
  response: OpenAIResponse;
  timestamp: number;
  expiresAt: number;
}

export class OpenAICacheService {
  private static cache: Map<string, CacheEntry> = new Map();
  private static readonly DEFAULT_TTL_MS = 1000 * 60 * 60; // 1 hour by default
  private static readonly MAX_CACHE_SIZE = 100; // Maximum number of cache entries
  
  /**
   * Generate a cache key for a request
   */
  private static generateCacheKey(params: OpenAIRequestParams): string {
    const normalized = {
      systemPrompt: params.systemPrompt,
      userPrompt: params.userPrompt,
      useGpt4: params.useGpt4 || false,
      temperature: params.temperature || 0.7,
      maxTokens: params.maxTokens || 150
    };
    
    return JSON.stringify(normalized);
  }
  
  /**
   * Get a cached response if available
   */
  public static getCachedResponse(params: OpenAIRequestParams): OpenAIResponse | null {
    const key = this.generateCacheKey(params);
    const entry = this.cache.get(key);
    
    if (!entry || entry.expiresAt < Date.now()) {
      if (entry) {
        this.cache.delete(key);
      }
      return null;
    }
    
    return entry.response;
  }
  
  /**
   * Cache a response
   */
  public static cacheResponse(
    params: OpenAIRequestParams, 
    response: OpenAIResponse,
    ttlMs: number = this.DEFAULT_TTL_MS
  ): void {
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      
      for (const [key, entry] of this.cache.entries()) {
        if (entry.timestamp < oldestTime) {
          oldestTime = entry.timestamp;
          oldestKey = key;
        }
      }
      
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
    
    const key = this.generateCacheKey(params);
    const now = Date.now();
    
    this.cache.set(key, {
      key,
      response,
      timestamp: now,
      expiresAt: now + ttlMs
    });
  }
  
  /**
   * Clear the entire cache or specific entries
   */
  public static clearCache(params?: OpenAIRequestParams): void {
    if (params) {
      const key = this.generateCacheKey(params);
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }
  
  /**
   * Get a response, either from cache or by making a new API call
   */
  public static async getResponse(
    params: OpenAIRequestParams,
    ttlMs: number = this.DEFAULT_TTL_MS
  ): Promise<OpenAIResponse> {
    const cachedResponse = this.getCachedResponse(params);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    const response = await fetch('/api/openaiwrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    
    if (!response.ok) {
      throw new Error(`OpenAI API call failed: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    if (!result.timestamp) {
      result.timestamp = Date.now();
    }
    
    this.cacheResponse(params, result, ttlMs);
    
    return result;
  }
} 