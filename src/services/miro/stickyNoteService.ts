import { Frame } from '@mirohq/websdk-types';
import { ConfigurationService } from '../configurationService';
import { MiroApiClient } from './miroApiClient';
import { safeApiCall } from '../../utils/errorHandlingUtils';

/**
 * Type for sticky note color categories
 */
type ColorCategory = 'highRelevance' | 'mediumRelevance' | 'lowRelevance';

/**
 * Service for handling sticky note creation and positioning in Miro
 */
export class StickyNoteService {
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
      
      // Create the sticky note
      const sticky = await MiroApiClient.createStickyNote({
        content,
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
} 