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
    const relevanceConfig = ConfigurationService.getRelevanceConfig();
    
    // Use safe API call for error handling
    return await safeApiCall(
      async () => {
        // Validate score is within range
        const validScore = Math.max(
          relevanceConfig.scale.min,
          Math.min(relevanceConfig.scale.max, score)
        );
        
        // Get the score index (0-based) for our counters
        const scoreIndex = validScore - 1;
        
        // Calculate position based on score
        const position = this.calculateStickyPosition(
          frame,
          totalsByScore[scoreIndex], 
          validScore
        );
        
        // Determine color based on mode and score
        const color = this.getStickyColorForModeAndScore(mode, validScore);
        
        // Add relevance score to content
        const stickyContent = `${content}\n\n[Relevance: ${validScore}/${relevanceConfig.scale.max}]`;
        
        // Create sticky note at the calculated position within frame bounds
        const stickyNote = await MiroApiClient.createStickyNote({
          content: stickyContent,
          x: position.x,
          y: position.y,
          width: ConfigurationService.getStickyConfig().dimensions.width,
          style: {
            fillColor: color
          }
        });
        
        // Return the created sticky note
        return stickyNote;
      },
      null,
      'Create Sticky Note',
      { mode, score, frameId: frame.id }
    );
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
    const { itemsPerColumn: ITEMS_PER_COL, topMargin: TOP_MARGIN } = stickyConfig.layout;
    
    // Frame dimensions
    const frameLeft = frame.x - frame.width/2;
    const frameTop = frame.y - frame.height/2;
    const frameWidth = frame.width;
    
    // Calculate section width (frame divided into 3 equal sections)
    const sectionWidth = frameWidth / relevanceConfig.scale.max;
    
    // Determine which section this sticky belongs to
    const sectionIndex = score - 1; // Convert score to zero-based index
    
    // Calculate row and column within this score's section
    const col = Math.floor(totalSoFar / ITEMS_PER_COL);
    const row = totalSoFar % ITEMS_PER_COL;
    
    // Calculate the base x position for this score's section
    const sectionBaseX = frameLeft + (sectionIndex * sectionWidth) + (sectionWidth / 2);
    
    // Calculate final position
    const x = sectionBaseX - (STICKY_WIDTH / 2) + (col * (STICKY_WIDTH + SPACING));
    const y = frameTop + TOP_MARGIN + (row * (STICKY_HEIGHT + SPACING));
    
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