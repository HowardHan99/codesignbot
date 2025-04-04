import { Frame } from '@mirohq/websdk-types';
import { ConfigurationService } from '../configurationService';
import { MiroApiClient } from './miroApiClient';
import { safeApiCall } from '../../utils/errorHandlingUtils';
import { ProcessedDesignPoint, ProcessedPointWithRelevance } from '../../types/common';
import { RelevanceService } from '../relevanceService';
import { delay } from '../../utils/fileProcessingUtils';

/**
 * Type for sticky note color categories
 */
type ColorCategory = 'highRelevance' | 'mediumRelevance' | 'lowRelevance';

/**
 * Service for handling sticky note creation and positioning in Miro
 */
export class StickyNoteService {
  // Configurable character limit for sticky notes
  private static STICKY_CHAR_LIMIT = 250; // Increased from 80 to 250

  /**
   * Set the sticky note character limit
   * @param limit New character limit to use
   */
  public static setStickyCharLimit(limit: number): void {
    if (limit > 0) {
      this.STICKY_CHAR_LIMIT = limit;
      console.log(`Sticky note character limit set to ${limit}`);
    } else {
      console.error(`Invalid character limit: ${limit}. Must be positive.`);
    }
  }

  /**
   * Get the current sticky note character limit
   * @returns Current character limit
   */
  public static getStickyCharLimit(): number {
    return this.STICKY_CHAR_LIMIT;
  }

  /**
   * Split content into chunks of maximum length
   * This helps handle Miro's character limit by creating multiple sticky notes
   * @param content The content to split
   * @param maxLength Maximum length per chunk
   * @private
   */
  private static splitContentIntoChunks(content: string, maxLength: number): string[] {
    // If content is already short enough, return it as a single chunk
    if (content.length <= maxLength) {
      return [content];
    }
    
    const chunks: string[] = [];
    let remaining = content;
    
    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        // Last piece fits completely
        chunks.push(remaining);
        break;
      }
      
      // Find the last space within the maxLength limit
      const lastSpaceIndex = remaining.substring(0, maxLength).lastIndexOf(' ');
      
      // If no space found or very early in the string, force break at maxLength
      // CONFIGURABLE: This threshold determines when to use the last space vs. forcing a break
      // Increase this value (e.g., 0.7) to prefer breaking at spaces even if they're earlier in text
      // Decrease this value (e.g., 0.3) to prefer using more of the available space
      const minSplitThreshold = 0.1; // EASY-TO-CONFIGURE: Controls minimum useful chunk size (0.0-1.0)
      const breakPoint = lastSpaceIndex > maxLength * minSplitThreshold ? lastSpaceIndex : maxLength;
      
      // Extract the chunk
      const chunk = remaining.substring(0, breakPoint).trim();
      chunks.push(chunk);
      
      // Update remaining content
      remaining = remaining.substring(breakPoint).trim();
    }
    
    return chunks;
  }

  /**
   * Create sticky notes for long content that exceeds Miro's character limit
   * @param frame The frame to place the sticky notes in
   * @param content The full content to split into multiple sticky notes
   * @param baseX Base X coordinate for the first sticky
   * @param baseY Base Y coordinate for the first sticky
   * @param color The color to use for all sticky notes
   * @param width Width for the sticky notes
   * @private
   */
  private static async createMultipleStickyNotes(
    frame: Frame,
    content: string,
    baseX: number,
    baseY: number,
    color: string,
    width: number
  ): Promise<any[]> {
    // CONFIGURABLE: Adjust this value to control spacing between connected sticky notes
    const VERTICAL_GAP = 40; // Gap between vertical sticky notes
    
    // Split the content into chunks that fit within the character limit
    const chunks = this.splitContentIntoChunks(content, this.STICKY_CHAR_LIMIT);
    
    const createdStickies: any[] = [];
    let previousSticky = null;
    
    // Create sticky notes for each chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      // No longer adding numbering for multiple chunks
      const displayContent = chunk;
      
      // Calculate position - stack vertically with increasing Y offset
      // This ensures each sticky note appears below the previous one
      const yOffset = i * (VERTICAL_GAP + 60); // Add extra space based on typical sticky height
      
      try {
        // For linked stickies, use slightly different shade to visually distinguish parts
        // Darken the color slightly for each subsequent sticky note
        let adjustedColor = color;
        if (i > 0 && color.startsWith('#')) {
          // Simple color adjustment - make subsequent stickies slightly darker
          try {
            const colorValue = parseInt(color.slice(1), 16);
            const darkenAmount = Math.min(i * 5, 20); // Limit darkening
            const adjustedValue = Math.max(0, colorValue - darkenAmount * 65536 - darkenAmount * 256 - darkenAmount);
            adjustedColor = '#' + adjustedValue.toString(16).padStart(6, '0');
          } catch (e) {
            // If color manipulation fails, use original color
            adjustedColor = color;
          }
        }
        
        const sticky = await MiroApiClient.createStickyNote({
          content: displayContent,
          x: baseX,
          y: baseY + yOffset,
          width: width,
          style: {
            fillColor: adjustedColor
          }
        });
        
        if (sticky) {
          createdStickies.push(sticky);
          
          // Connect with previous sticky if this isn't the first one
          if (previousSticky && i > 0) {
            try {
              // CONFIGURABLE: You can customize the connector style here
              await miro.board.createConnector({
                start: {
                  item: previousSticky.id,
                  position: { x: 0.5, y: 1 } // Bottom of previous sticky
                },
                end: {
                  item: sticky.id,
                  position: { x: 0.5, y: 0 } // Top of current sticky
                },
                style: {
                  strokeColor: '#4262ff', // CONFIGURABLE: Connector color
                  strokeWidth: 1,         // CONFIGURABLE: Connector width
                  strokeStyle: 'dashed'   // CONFIGURABLE: Connector style ('straight', 'dashed', etc)
                }
              });
            } catch (connError) {
              console.error('Error creating connector between sticky notes:', connError);
            }
          }
          
          previousSticky = sticky;
          
          // Add a small delay between sticky note creations
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error(`Error creating sticky note for chunk ${i+1}:`, error);
      }
    }
    
    return createdStickies;
  }

  /**
   * Create a new sticky note with relevance score
   * @param frame The frame to place the sticky note in
   * @param content The content of the sticky note
   * @param score The relevance score
   * @param mode The mode ('decision' or 'response')
   * @param totalsByScore Counter array tracking sticky notes by score
   */
  public static async createStickyWithRelevance(
    frame: Frame,
    content: string,
    score: number,
    mode: 'decision' | 'response',
    totalsByScore: number[]
  ): Promise<any> {
    try {
      // Validate score is in range
      const relevanceConfig = ConfigurationService.getRelevanceConfig();
      const { min, max } = relevanceConfig.scale;
      if (score < min || score > max) {
        console.error(`Invalid relevance score: ${score}, using default: ${min}`);
        score = min;
      }
      
      // Get the sticky note color based on score and mode
      const color = this.getStickyColorForModeAndScore(mode, score);
      
      // Calculate position
      const position = this.calculateStickyPosition(frame, totalsByScore[score - 1], score);
      
      // Get sticky dimensions from config
      const { width, height } = ConfigurationService.getStickyConfig().dimensions;
      
      // =========================================================================
      // IMPORTANT: Sticky Note Positioning for Frame Assignment
      // =========================================================================
      // In Miro, sticky notes are automatically assigned to a frame based on their
      // position coordinates. To ensure a sticky appears in the desired frame:
      // 1. It MUST be positioned within the frame's bounds
      // 2. There is NO API to directly set the parentId
      // 3. Attempting to update parentId after creation does NOT work
      // 4. The sticky note must be created with coordinates inside the frame
      // =========================================================================
      
      // Calculate the frame bounds
      const frameLeft = frame.x - frame.width/2;
      const frameTop = frame.y - frame.height/2;
      const frameRight = frame.x + frame.width/2;
      const frameBottom = frame.y + frame.height/2;
      
      // Ensure the position is within the frame bounds with margin
      // This is CRITICAL for proper frame assignment
      const margin = 10; // Margin from frame edge
      const adjustedX = Math.max(
        frameLeft + width/2 + margin, 
        Math.min(frameRight - width/2 - margin, position.x)
      );
      const adjustedY = Math.max(
        frameTop + height/2 + margin,
        Math.min(frameBottom - height/2 - margin, position.y)
      );
      
      // Verify the point is inside the frame (for debugging)
      const isInFrame = 
        adjustedX > frameLeft && 
        adjustedX < frameRight && 
        adjustedY > frameTop && 
        adjustedY < frameBottom;
      
      if (!isInFrame) {
        console.error(`CRITICAL ERROR: Position (${adjustedX}, ${adjustedY}) is outside frame bounds!`);
        return null;
      }
      
      // HANDLE MIRO'S CHARACTER LIMIT
      
      // Check if content exceeds the character limit
      if (content.length > this.STICKY_CHAR_LIMIT) {
        // Create multiple sticky notes for the long content
        const stickies = await this.createMultipleStickyNotes(
          frame,
          content,
          adjustedX,
          adjustedY,
          color,
          width
        );
        
        // Return the first sticky from the set
        return stickies.length > 0 ? stickies[0] : null;
      } else {
        // Content fits within limit, create a single sticky note
        const sticky = await MiroApiClient.createStickyNote({
          content: content,
          x: adjustedX,
          y: adjustedY,
          width: width,
          style: {
            fillColor: color
          }
        });
        
        if (sticky) {
          // Verify correct frame assignment
          if (sticky.parentId !== frame.id) {
            console.error(`WARNING: Sticky note created with incorrect parentId: ${sticky.parentId} instead of ${frame.id}`);
          }
          
          return sticky;
        } else {
          console.error(`Failed to create sticky note - null response from API`);
          return null;
        }
      }
    } catch (error) {
      console.error(`Error creating sticky note:`, error);
      throw error;
    }
  }
  
  /**
   * Get color for a sticky note based on mode and score
   * @param mode The mode ('decision' or 'response')
   * @param score The relevance score
   */
  private static getStickyColorForModeAndScore(
    mode: 'decision' | 'response',
    score: number
  ): string {
    const { colors } = ConfigurationService.getStickyConfig();
    const relevanceConfig = ConfigurationService.getRelevanceConfig();
    
    // Determine bucket (high, medium, low) based on score range
    const maxScore = relevanceConfig.scale.max;
    const highThreshold = Math.ceil(maxScore * 0.75);
    const mediumThreshold = Math.ceil(maxScore * 0.4);
    
    let colorCategory: ColorCategory;
    if (score >= highThreshold) {
      colorCategory = 'highRelevance';
    } else if (score >= mediumThreshold) {
      colorCategory = 'mediumRelevance';
    } else {
      colorCategory = 'lowRelevance';
    }
    
    // Return appropriate color based on mode and category
    return mode === 'decision' 
      ? colors.decision[colorCategory] 
      : colors.response[colorCategory];
  }
  
  /**
   * Calculate position of a sticky note based on score and existing stickies
   * @param frame The frame to position within
   * @param totalSoFar Number of stickies with this score so far
   * @param score The relevance score
   */
  public static calculateStickyPosition(
    frame: Frame,
    totalSoFar: number,
    score: number
  ): { x: number, y: number } {
    const stickyConfig = ConfigurationService.getStickyConfig();
    const relevanceConfig = ConfigurationService.getRelevanceConfig();
    
    const { width: STICKY_WIDTH, height: STICKY_HEIGHT, spacing: SPACING } = stickyConfig.dimensions;
    const { itemsPerColumn: ITEMS_PER_COL, topMargin: TOP_MARGIN, leftMargin: LEFT_MARGIN } = stickyConfig.layout;
    
    // Frame dimensions
    const frameLeft = frame.x - frame.width/2;
    const frameTop = frame.y - frame.height/2;
    const frameWidth = frame.width;
    const frameHeight = frame.height;
    
    // Calculate section width (frame divided into N equal sections based on score range)
    const effectiveWidth = frameWidth - (LEFT_MARGIN * 2);
    const sectionWidth = effectiveWidth / relevanceConfig.scale.max;
    
    // Determine which section this sticky belongs to
    const sectionIndex = score - 1; // Convert score to zero-based index
    
    // Calculate row and column within this score's section
    const col = Math.floor(totalSoFar / ITEMS_PER_COL);
    const row = totalSoFar % ITEMS_PER_COL;
    
    // Calculate the base x position for this score's section
    const sectionBaseX = frameLeft + LEFT_MARGIN + (sectionIndex * sectionWidth) + (sectionWidth / 2);
    
    // FIXED POSITIONING ALGORITHM:
    // 1. Make sure we start well within the frame with proper margins
    // 2. Ensure columns/rows don't overflow the frame dimensions
    
    // Calculate preliminary positions
    let x = sectionBaseX + (col * (STICKY_WIDTH + SPACING));
    let y = frameTop + TOP_MARGIN + (row * (STICKY_HEIGHT + SPACING));
    
    // Safety checks to ensure we stay within frame bounds
    const rightBound = frameLeft + frameWidth - STICKY_WIDTH/2 - 20;
    const bottomBound = frameTop + frameHeight - STICKY_HEIGHT/2 - 20;
    
    // If we'd overflow to the right, create a new row
    if (x > rightBound) {
      // Reset to left side and move down one row
      x = frameLeft + LEFT_MARGIN + (sectionIndex * sectionWidth/2);
      y += STICKY_HEIGHT + SPACING;
    }
    
    // If we'd overflow the bottom, start a new column from the top
    if (y > bottomBound) {
      y = frameTop + TOP_MARGIN;
      x += STICKY_WIDTH + SPACING;
    }
    
    // Final safety bounds check - ensure minimum margins from edges
    const margin = 30; // Safe margin from frame edge
    x = Math.max(frameLeft + STICKY_WIDTH/2 + margin, Math.min(frameLeft + frameWidth - STICKY_WIDTH/2 - margin, x));
    y = Math.max(frameTop + STICKY_HEIGHT/2 + margin, Math.min(frameTop + frameHeight - STICKY_HEIGHT/2 - margin, y));
    
    return { x, y };
  }
  
  /**
   * Get a clean array of counters for tracking stickies by score
   */
  public static getInitialCounters(): number[] {
    return Array(ConfigurationService.getRelevanceConfig().scale.max).fill(0);
  }

  /**
   * Ensures a frame exists with the given name, or creates it if not found
   * @param frameName The name of the frame to ensure exists
   */
  public static async ensureFrameExists(frameName: string): Promise<Frame> {
    const frameConfig = ConfigurationService.getFrameConfig();
    
    // Use safe API call pattern
    const frame = await safeApiCall<Frame>(
      async () => {
        // Try to find existing frame
        const existingFrame = await MiroApiClient.findFrameByTitle(frameName);
        
        if (existingFrame) {
          console.log(`Found existing "${frameName}" frame at (${existingFrame.x}, ${existingFrame.y})`);
          return existingFrame;
        }
        
        // Create a new frame
        console.log(`Creating new "${frameName}" frame...`);
        const newFrame = await MiroApiClient.createFrame({
          title: frameName,
          x: frameConfig.defaults.initialX,
          y: frameConfig.defaults.initialY,
          width: frameConfig.defaults.width,
          height: frameConfig.defaults.height
        });
        
        if (!newFrame) {
          throw new Error(`Failed to create frame: ${frameName}`);
        }
        
        console.log(`New frame created: ${frameName}`);
        return newFrame;
      },
      null,
      'Ensure Frame Exists',
      { frameName }
    );
    
    // If we still don't have a frame, throw an error
    if (!frame) {
      throw new Error(`Could not ensure frame exists: ${frameName}`);
    }
    
    return frame;
  }
  
  /**
   * Get the correct frame name based on the component mode
   * @param mode The component mode ('decision' or 'response')
   */
  public static getFrameNameForMode(mode: 'decision' | 'response'): string {
    const frameConfig = ConfigurationService.getFrameConfig();
    
    return mode === 'decision' 
      ? frameConfig.names.thinkingDialogue 
      : frameConfig.names.analysisResponse;
  }
  
  /**
   * Get all sticky notes from a named frame
   * @param frameName The name of the frame to get sticky notes from
   */
  public static async getStickiesFromNamedFrame(frameName: string): Promise<string[]> {
    // Use safe API call pattern
    return await safeApiCall<string[]>(
      async () => {
        console.log(`Fetching stickies from ${frameName} frame...`);
        
        // Find the target frame
        const targetFrame = await MiroApiClient.findFrameByTitle(frameName);
        
        if (!targetFrame) {
          console.log(`${frameName} frame not found, returning empty array`);
          return [];
        }
        
        // Get stickies in this frame
        const frameStickies = await MiroApiClient.getStickiesInFrame(targetFrame.id);
        
        // Extract content from stickies
        const stickyContents = frameStickies.map(sticky => sticky.content || '');
        
        console.log(`Found ${stickyContents.length} stickies in ${frameName} frame`);
        return stickyContents;
      },
      [],
      'Get Stickies From Frame',
      { frameName }
    ) || [];
  }
  
  /**
   * Unified method to create sticky notes from processed points
   * @param frameName Name of the frame to create sticky notes in
   * @param processedPoints Array of processed design points
   * @param mode The mode ('decision' or 'response')
   * @param designDecisions Optional array of design decisions for relevance calculation
   * @param relevanceThreshold Optional threshold for relevance calculation
   */
  public static async createStickyNotesFromPoints(
    frameName: string,
    processedPoints: ProcessedDesignPoint[],
    mode: 'decision' | 'response',
    designDecisions?: string[],
    relevanceThreshold?: number
  ): Promise<void> {
    try {
      if (!processedPoints || processedPoints.length === 0) {
        console.log(`No points to create sticky notes from`);
        return;
      }
      
      console.log(`Creating sticky notes in ${frameName} frame`);
      
      // Get or create the frame
      const frame = await this.ensureFrameExists(frameName);
      
      if (!frame) {
        console.error(`Failed to get or create frame: ${frameName}`);
        return;
      }
      
      // Get relevance configuration
      const relevanceConfig = ConfigurationService.getRelevanceConfig();
      const threshold = relevanceThreshold || relevanceConfig.scale.defaultThreshold;
      
      // Initialize counter array for tracking stickies by score
      const countsByScore = this.getInitialCounters();
      
      // Process for relevance if design decisions are provided
      let pointsWithRelevance: ProcessedPointWithRelevance[] = [];
      
      // If the points already have relevance scores (ProcessedPointWithRelevance type)
      if (processedPoints.length > 0 && 'relevanceScore' in processedPoints[0]) {
        pointsWithRelevance = processedPoints as ProcessedPointWithRelevance[];
      } 
      // Otherwise, evaluate relevance if design decisions are provided
      else if (designDecisions && designDecisions.length > 0) {
        // Evaluate relevance of each point
        for (const point of processedPoints) {
          const { category, score } = await RelevanceService.evaluateRelevance(
            point.proposal, 
            designDecisions,
            threshold
          );
          
          pointsWithRelevance.push({
            ...point,
            relevance: category,
            relevanceScore: score
          });
        }
      } 
      // If no design decisions provided, assign default maximum relevance score
      else {
        const defaultScore = relevanceConfig.scale.max;
        pointsWithRelevance = processedPoints.map(point => ({
          ...point,
          relevance: 'relevant',
          relevanceScore: defaultScore
        }));
      }
      
      // Create sticky notes for points
      for (let i = 0; i < pointsWithRelevance.length; i++) {
        const point = pointsWithRelevance[i];
        
        try {
          // Use the StickyNoteService to create the sticky note in the frame
          const stickyNote = await this.createStickyWithRelevance(
            frame,
            point.proposal,
            point.relevanceScore,
            mode,
            countsByScore
          );
          
          // Increment the counter for this score
          countsByScore[point.relevanceScore - 1]++;
          
          // Add a delay between creations to avoid rate limiting
          const delayTime = ConfigurationService.getRelevanceConfig().delayBetweenCreations;
          await delay(delayTime);
        } catch (error) {
          console.error(`Error creating sticky note:`, error);
        }
      }
      
      console.log(`Created ${pointsWithRelevance.length} sticky notes in "${frameName}" frame`);
    } catch (error) {
      console.error('Error creating sticky notes from points:', error);
      throw error;
    }
  }
} 