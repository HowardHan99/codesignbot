import { Frame } from '@mirohq/websdk-types';
import { safeApiCall, logError } from '../../utils/errorHandlingUtils';
import { delay } from '../../utils/fileProcessingUtils';

/**
 * Centralized client for Miro API operations with error handling and rate limiting
 */
export class MiroApiClient {
  private static readonly API_DELAY = 100; // ms between API calls to avoid rate limiting
  private static readonly MAX_RETRIES = 3;
  private static lastCallTime = 0;
  
  /**
   * Executes a Miro API call with rate limiting and error handling
   * @param operation The operation name for logging
   * @param apiCall The function that makes the API call
   * @param fallbackValue Fallback value if the call fails
   * @returns The API call result or fallback value
   */
  public static async call<T>(
    operation: string,
    apiCall: () => Promise<T>,
    fallbackValue: T | null = null
  ): Promise<T | null> {
    // Apply rate limiting
    await this.applyRateLimit();
    
    // Try the API call with retries
    return await this.callWithRetries(operation, apiCall, fallbackValue);
  }
  
  /**
   * Apply rate limiting between API calls
   */
  private static async applyRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCallTime;
    
    if (timeSinceLastCall < this.API_DELAY) {
      const waitTime = this.API_DELAY - timeSinceLastCall;
      await delay(waitTime);
    }
    
    this.lastCallTime = Date.now();
  }
  
  /**
   * Execute an API call with retries
   */
  private static async callWithRetries<T>(
    operation: string,
    apiCall: () => Promise<T>,
    fallbackValue: T | null = null
  ): Promise<T | null> {
    let attempts = 0;
    let lastError: any = null;
    
    while (attempts < this.MAX_RETRIES) {
      try {
        const result = await apiCall();
        return result;
      } catch (error) {
        attempts++;
        lastError = error;
        
        // Log the error but keep trying
        console.warn(`Miro API call failed (attempt ${attempts}/${this.MAX_RETRIES}): ${operation}`, error);
        
        // Wait longer between retries
        await delay(this.API_DELAY * Math.pow(2, attempts));
      }
    }
    
    // All retries failed, log the error and return fallback
    logError(lastError, { attempts }, `Miro API: ${operation}`);
    return fallbackValue;
  }
  
  /**
   * Get all frames on the board
   */
  public static async getFrames(): Promise<Frame[]> {
    return await this.call<Frame[]>(
      'Get frames',
      async () => await miro.board.get({ type: 'frame' }),
      []
    ) || [];
  }
  
  /**
   * Find a frame by title
   * @param title The frame title to search for
   */
  public static async findFrameByTitle(title: string): Promise<Frame | null> {
    const frames = await this.getFrames();
    return frames.find(f => f.title === title) || null;
  }
  
  /**
   * Create a new frame
   * @param frameConfig Configuration for the new frame
   */
  public static async createFrame(frameConfig: {
    title: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }): Promise<Frame | null> {
    return await this.call<Frame>(
      'Create frame',
      async () => await miro.board.createFrame(frameConfig),
      null
    );
  }
  
  /**
   * Get all sticky notes on the board
   */
  public static async getStickyNotes(): Promise<any[]> {
    return await this.call<any[]>(
      'Get sticky notes',
      async () => await miro.board.get({ type: 'sticky_note' }),
      []
    ) || [];
  }
  
  /**
   * Create a sticky note
   * @param stickyConfig Configuration for the new sticky note
   */
  public static async createStickyNote(stickyConfig: {
    content: string;
    x: number;
    y: number;
    width?: number;
    style?: any;
  }): Promise<any | null> {
    console.log(`[DEBUG] MiroApiClient.createStickyNote called with:
    content: ${stickyConfig.content.substring(0, 50)}...
    position: x=${stickyConfig.x}, y=${stickyConfig.y}
    width: ${stickyConfig.width}
    style: ${JSON.stringify(stickyConfig.style)}`);
    
    return await this.call<any>(
      'Create sticky note',
      async () => {
        console.log(`[DEBUG] Calling miro.board.createStickyNote API`);
        try {
          const sticky = await miro.board.createStickyNote(stickyConfig);
          console.log(`[DEBUG] Miro API createStickyNote successful, id: ${sticky?.id}`);
          return sticky;
        } catch (error) {
          console.error(`[DEBUG] Miro API createStickyNote failed:`, error);
          throw error;
        }
      },
      null
    );
  }
  
  /**
   * Gets sticky notes within a frame
   * @param frameId The frame ID to search within
   */
  public static async getStickiesInFrame(frameId: string): Promise<any[]> {
    const allStickies = await this.getStickyNotes();
    return allStickies.filter(sticky => sticky.parentId === frameId);
  }
  
  /**
   * Deletes all items of specified types within a frame
   * @param frameId The ID of the frame containing the items to delete
   * @param itemTypes Array of item types to delete (e.g., 'sticky_note', 'shape', 'text')
   * @returns Number of items deleted
   */
  public static async deleteItemsInFrame(frameId: string, itemTypes: string[]): Promise<number> {
    const result = await this.call<number>(
      'Delete items in frame',
      async () => {
        let deletedCount = 0;
        
        // Process each specified item type
        for (const itemType of itemTypes) {
          // Get all items of this type
          const items = await miro.board.get({ type: itemType as any });
          
          // Filter to items in the specified frame
          // Use type assertion for parentId which exists on most item types
          const itemsInFrame = items.filter(item => {
            // Safely check if the item belongs to the frame
            return (item as any).parentId === frameId;
          });
          
          if (itemsInFrame.length === 0) {
            console.log(`No ${itemType} items found in frame ${frameId}`);
            continue;
          }
          
          console.log(`Deleting ${itemsInFrame.length} ${itemType} items from frame ${frameId}`);
          
          // Delete items in batches to avoid rate limiting
          const BATCH_SIZE = 10;
          for (let i = 0; i < itemsInFrame.length; i += BATCH_SIZE) {
            const batch = itemsInFrame.slice(i, i + BATCH_SIZE);
            
            try {
              // Remove each item individually
              for (const item of batch) {
                await miro.board.remove(item);
                deletedCount++;
              }
              
              // Small delay between batches
              if (i + BATCH_SIZE < itemsInFrame.length) {
                await delay(100);
              }
            } catch (error) {
              console.error(`Error deleting batch of ${itemType} items:`, error);
              throw error;
            }
          }
        }
        
        return deletedCount;
      },
      0
    );
    
    // Ensure we return a number (not null)
    return result ?? 0;
  }
} 