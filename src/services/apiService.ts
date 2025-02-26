import { safeApiCall, logError } from '../utils/errorHandlingUtils';
import { ConfigurationService } from './configurationService';
import { OpenAICacheService, OpenAIRequestParams, OpenAIResponse } from './openaiCacheService';

/**
 * Centralized service for handling all external API calls
 */
export class ApiService {
  /**
   * Call the OpenAI API with caching support
   * @param params The parameters for the OpenAI request
   * @param ttlMs Time-to-live for caching in milliseconds
   * @returns Promise resolving to the API response
   */
  public static async callOpenAI(
    params: OpenAIRequestParams,
    ttlMs?: number
  ): Promise<OpenAIResponse> {
    const defaultResponse: OpenAIResponse = { 
      response: '', 
      timestamp: Date.now(),
      tokens: { prompt: 0, completion: 0, total: 0 } 
    };
    
    return await safeApiCall(
      async () => {
        return await OpenAICacheService.getResponse(params, ttlMs);
      },
      defaultResponse,
      'OpenAI API Call',
      { 
        systemPromptLength: params.systemPrompt.length,
        userPromptLength: params.userPrompt.length,
        model: params.useGpt4 ? 'gpt-4' : 'gpt-3.5-turbo'
      }
    ) || defaultResponse;
  }
  
  /**
   * Transcribe an audio file
   * @param audioFile The audio file to transcribe
   * @returns Promise resolving to the transcription result
   */
  public static async transcribeAudio(audioFile: File): Promise<{
    transcription: string;
    duration: number;
  }> {
    const defaultResponse = { transcription: '', duration: 0 };
    
    return await safeApiCall(
      async () => {
        const formData = new FormData();
        formData.append('audio', audioFile);
        
        console.log(`Transcribing audio file: ${audioFile.name} (${audioFile.size} bytes)`);
        
        const response = await fetch('/api/transcribe', {
          method: 'POST',
          body: formData
        });
        
        if (!response.ok) {
          throw new Error(`Transcription failed: ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log(`Transcription complete: ${result.transcription.length} chars, ${result.duration}s`);
        
        return result;
      },
      defaultResponse,
      'Audio Transcription',
      { fileName: audioFile.name, fileSize: audioFile.size }
    ) || defaultResponse;
  }
  
  /**
   * Upload a file to storage
   * @param file The file to upload
   * @param path The path to upload to
   * @returns Promise resolving to the file URL
   */
  public static async uploadFile(file: File, path: string): Promise<string> {
    return await safeApiCall(
      async () => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('path', path);
        
        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData
        });
        
        if (!response.ok) {
          throw new Error(`File upload failed: ${response.statusText}`);
        }
        
        const result = await response.json();
        return result.url;
      },
      '',
      'File Upload',
      { fileName: file.name, path }
    ) || '';
  }
  
  /**
   * Generate embeddings for text using OpenAI
   * @param text The text to generate embeddings for
   * @returns Promise resolving to the embeddings
   */
  public static async generateEmbeddings(text: string): Promise<number[]> {
    return await safeApiCall(
      async () => {
        const response = await fetch('/api/embeddings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ text })
        });
        
        if (!response.ok) {
          throw new Error(`Embeddings generation failed: ${response.statusText}`);
        }
        
        const result = await response.json();
        return result.embeddings;
      },
      [],
      'Generate Embeddings',
      { textLength: text.length }
    ) || [];
  }
  
  /**
   * Make a generic API call with proper error handling
   * @param url The URL to call
   * @param method The HTTP method
   * @param data The data to send
   * @param headers Additional headers
   * @returns Promise resolving to the API response
   */
  public static async makeApiCall<T>(
    url: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    data?: any,
    headers?: Record<string, string>
  ): Promise<T | null> {
    return await safeApiCall<T>(
      async () => {
        const options: RequestInit = {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...headers
          }
        };
        
        if (data && method !== 'GET') {
          options.body = JSON.stringify(data);
        }
        
        const response = await fetch(url, options);
        
        if (!response.ok) {
          throw new Error(`API call failed: ${response.statusText}`);
        }
        
        return await response.json();
      },
      null,
      `API ${method}`,
      { url, method }
    );
  }
} 