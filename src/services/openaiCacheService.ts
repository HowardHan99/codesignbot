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
   * @param params The OpenAI request parameters
   * @returns A string key
   */
  private static generateCacheKey(params: OpenAIRequestParams): string {
    // Create a standardized stringified version of the params
    // Sort keys to ensure consistent order
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
   * @param params The OpenAI request parameters
   * @returns The cached response or null if not found
   */
  public static getCachedResponse(params: OpenAIRequestParams): OpenAIResponse | null {
    const key = this.generateCacheKey(params);
    const entry = this.cache.get(key);
    
    // If no entry or it has expired, return null
    if (!entry || entry.expiresAt < Date.now()) {
      if (entry) {
        // Remove expired entry
        this.cache.delete(key);
      }
      return null;
    }
    
    console.log('OpenAI cache hit');
    return entry.response;
  }
  
  /**
   * Cache a response
   * @param params The OpenAI request parameters
   * @param response The response to cache
   * @param ttlMs Optional time-to-live in milliseconds
   */
  public static cacheResponse(
    params: OpenAIRequestParams, 
    response: OpenAIResponse,
    ttlMs: number = this.DEFAULT_TTL_MS
  ): void {
    // Manage cache size - if we're at capacity, remove oldest entry
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
    
    console.log('OpenAI response cached');
  }
  
  /**
   * Clear the entire cache or specific entries
   * @param params Optional specific parameters to clear
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
   * @param params The OpenAI request parameters
   * @param ttlMs Optional time-to-live for caching
   * @returns The API response
   */
  public static async getResponse(
    params: OpenAIRequestParams,
    ttlMs: number = this.DEFAULT_TTL_MS
  ): Promise<OpenAIResponse> {
    // Check cache first
    const cachedResponse = this.getCachedResponse(params);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Make the API call
    console.log('OpenAI cache miss, making API call');
    const response = await fetch('/api/openaiwrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    
    if (!response.ok) {
      throw new Error(`OpenAI API call failed: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    // Add timestamp if not present
    if (!result.timestamp) {
      result.timestamp = Date.now();
    }
    
    // Cache the response
    this.cacheResponse(params, result, ttlMs);
    
    return result;
  }
} 