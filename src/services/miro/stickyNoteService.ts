import { Frame } from '@mirohq/websdk-types';
import { ConfigurationService } from '../configurationService';
import { MiroApiClient } from './miroApiClient';
import { safeApiCall } from '../../utils/errorHandlingUtils';
import { ProcessedDesignPoint, ProcessedPointWithRelevance } from '../../types/common';
import { RelevanceService } from '../relevanceService';
import { delay } from '../../utils/fileProcessingUtils';
import { Logger } from '../../utils/logger';
import { frameConfig } from '../../utils/config';

/**
 * Type for sticky note color categories
 */
type ColorCategory = 'highRelevance' | 'mediumRelevance' | 'lowRelevance';

/**
 * Service for handling sticky note creation and positioning in Miro
 */
export class StickyNoteService {
  // Configurable character limit for sticky notes
  private static STICKY_CHAR_LIMIT = 300; // Increased from 80 to 200
  // Configurable reserved space for sticky notes
  public static RESERVED_SPACE = 400;

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
   * Create multiple sticky notes for content that exceeds character limit
   * @param frame The frame to add sticky notes to
   * @param content The content to split
   * @param baseX Base X position
   * @param baseY Base Y position
   * @param color The color to use for all sticky notes
   * @param width Width for the sticky notes
   * @param shape The shape to use for the sticky notes
   * @private
   * @returns Object containing created stickies array and the number of row spaces consumed
   */
  private static async createMultipleStickyNotes(
    frame: Frame,
    content: string,
    baseX: number,
    baseY: number,
    color: string,
    width: number,
    shape: 'square' | 'rectangle' = 'square'
  ): Promise<{stickies: any[], rowSpacesUsed: number}> {
    // CONFIGURABLE: Adjust this value to control spacing between connected sticky notes
    const CONNECTED_STICKY_SPACING = 200;  // Space between connected stickies
    
    // Split the content into chunks that fit within the character limit
    const chunks = this.splitContentIntoChunks(content, this.STICKY_CHAR_LIMIT);
    
    // Create an array to hold the created sticky notes
    const stickies: any[] = [];
    
    // Adjust the first sticky color to show it's the primary content
    // Others will have a slightly lighter color to show connection
    const adjustedColor = color; // Keep the original color for the first sticky
    
    try {
      // Create sticky notes for each chunk
      for (let i = 0; i < chunks.length; i++) {
        // Calculate offset from the base position for each sticky
        // This will create a vertical arrangement with equal spacing
        const yOffset = i * CONNECTED_STICKY_SPACING;
        
        // Append continuation marker if this is not the first chunk
        let chunkContent = chunks[i];
        if (i > 0) {
          chunkContent = `(continued) ${chunkContent}`;
        }
        
        // Create the sticky note
        const sticky = await MiroApiClient.createStickyNote({
          content: chunkContent,
          x: baseX,
          y: baseY + yOffset,
          width: width,
          shape: shape,
          style: {
            fillColor: adjustedColor
          }
        });
        
        // Add to our array
        if (sticky) {
          stickies.push(sticky);
        }
        
        // Short delay between sticky creation to avoid rate limiting
        await delay(50);
      }
      
      // Create connecting lines between the sticky notes
      // Skip this step for now as it requires more specific consideration...
      
      // Return the array of created stickies and the number of row spaces used
      return {
        stickies: stickies,
        rowSpacesUsed: chunks.length  // Each chunk takes up one row space
      };
    } catch (error) {
      console.error('Error creating multiple sticky notes:', error);
      return {
        stickies: stickies,
        rowSpacesUsed: stickies.length || 1  // Use the actual count or minimum 1
      };
    }
  }

  /**
   * Create multiple sticky notes for content that exceeds character limit with proper frame assignment
   * @param frame The frame to add sticky notes to
   * @param content The content to split
   * @param baseX Base X position
   * @param baseY Base Y position
   * @param color The color to use for all sticky notes
   * @param width Width for the sticky notes
   * @param shape The shape to use for the sticky notes
   * @private
   * @returns Object containing created stickies array and the number of row spaces consumed
   */
  private static async createMultipleStickyNotesWithFrameAdd(
    frame: Frame,
    content: string,
    baseX: number,
    baseY: number,
    color: string,
    width: number,
    shape: 'square' | 'rectangle' = 'square'
  ): Promise<{stickies: any[], rowSpacesUsed: number}> {
    // CONFIGURABLE: Adjust this value to control spacing between connected sticky notes
    const CONNECTED_STICKY_SPACING = 200;  // Space between connected stickies
    
    // Split the content into chunks that fit within the character limit
    const chunks = this.splitContentIntoChunks(content, this.STICKY_CHAR_LIMIT);
    
    // Create an array to hold the created sticky notes
    const stickies: any[] = [];
    
    // Adjust the first sticky color to show it's the primary content
    const adjustedColor = color; // Keep the original color for the first sticky
    
    try {
      // Create sticky notes for each chunk
      for (let i = 0; i < chunks.length; i++) {
        // Calculate offset from the base position for each sticky
        const yOffset = i * CONNECTED_STICKY_SPACING;
        
        // Append continuation marker if this is not the first chunk
        let chunkContent = chunks[i];
        if (i > 0) {
          chunkContent = `(continued) ${chunkContent}`;
        }
        
        // Create the sticky note
        const sticky = await MiroApiClient.createStickyNote({
          content: chunkContent,
          x: baseX,
          y: baseY + yOffset,
          width: width,
          shape: shape,
          style: {
            fillColor: adjustedColor
          }
        });
        
        // =========================================================================
        // NEW: Properly add each sticky note to frame as child
        // =========================================================================
        if (sticky) {
          try {
            await frame.add(sticky);
            stickies.push(sticky);
            Logger.log('VR-STICKY', `Successfully added multi-sticky note ${i+1}/${chunks.length} (ID: ${sticky.id}) to frame "${frame.title}" as child`);
          } catch (addError) {
            Logger.warn('VR-STICKY', `Failed to add multi-sticky note ${i+1} to frame as child: ${addError}`);
            stickies.push(sticky); // Still add to array even if frame assignment failed
          }
        }
        
        // Short delay between sticky creation to avoid rate limiting
        await delay(50);
      }
      
      // Return the array of created stickies and the number of row spaces used
      return {
        stickies: stickies,
        rowSpacesUsed: chunks.length  // Each chunk takes up one row space
      };
    } catch (error) {
      console.error('Error creating multiple sticky notes with frame add:', error);
      return {
        stickies: stickies,
        rowSpacesUsed: stickies.length || 1  // Use the actual count or minimum 1
      };
    }
  }

  /**
   * Create a new sticky note with relevance score
   * @param frame The frame to place the sticky note in
   * @param content The content of the sticky note
   * @param score The relevance score
   * @param mode The mode ('decision' or 'response')
   * @param totalsByScore Counter array tracking sticky notes by score
   * @returns Created sticky note and number of row spaces used
   */
  public static async createStickyWithRelevance(
    frame: Frame,
    content: string,
    score: number,
    mode: 'decision' | 'response',
    totalsByScore: number[]
  ): Promise<{ sticky: any, rowSpacesUsed: number }> {
    try {
      Logger.log('VR-STICKY', `StickyNoteService: Creating sticky with content preview: "${content.substring(0, 30)}..."}`, { score, mode });
      // Validate score is in range
      const relevanceConfig = ConfigurationService.getRelevanceConfig();
      const { min, max } = relevanceConfig.scale;
      if (score < min || score > max) {
        console.error(`Invalid relevance score: ${score}, using default: ${min}`);
        score = min;
      }
      
      // Get the sticky note color based on score and mode
      const color = this.getStickyColorForModeAndScore(mode, score);
      
      // Determine which positioning algorithm to use based on frame name
      let position;
      const frameName = frame.title;
      const totalSoFar = totalsByScore[score - 1];
      Logger.log('STICKY-POS', `Total stickies so far for score ${score}: ${totalSoFar}`);
      
      // For general frames that need multi-column layout, use the new positioning algorithm
      // MODIFIED CONDITION: 
      // "Thinking-Dialogue" and "Analysis-Response" should now use the score-based layout.
      if (
        (frameName === frameConfig.names.designProposal ||
          frameName === 'ProposalDialogue' || // Retained as it might be a legacy or distinct general layout
          // frameName === frameConfig.names.thinkingDialogue || // Removed: To use score-based
          // frameName === frameConfig.names.analysisResponse || // Removed: To use score-based
          frameName === frameConfig.names.antagonisticResponse || // Retained if it needs general
          frameName === 'Designer-Thinking') && // Retained if it needs general
        frameName !== frameConfig.names.thinkingDialogue && // Ensure thinkingDialogue is excluded from general
        frameName !== frameConfig.names.realTimeResponse // Ensure analysisResponse is excluded from general
      ) {
        Logger.log('STICKY-POS', `Using general multi-column layout for frame "${frameName}"`);
        position = this.calculateGeneralStickyPosition(frame, totalSoFar);
      } else {
        // This block will now include thinkingDialogue and analysisResponse frames.
        Logger.log('STICKY-POS', `Using score-based layout for frame "${frameName}"`);
        position = this.calculateStickyPosition(frame, totalSoFar, score);
      }
      
      Logger.log('STICKY-POS', `Calculated position: X=${position.x.toFixed(0)}, Y=${position.y.toFixed(0)}`);
      
      // Get sticky dimensions and shape from config
      const stickyConfig = ConfigurationService.getStickyConfig();
      let width = stickyConfig.dimensions.width;
      let height = stickyConfig.dimensions.height;
      let shape: 'square' | 'rectangle' = 'square'; // Default shape
      
      // Check if there are frame-specific overrides for sticky shape and dimensions
      if (stickyConfig.shapes && stickyConfig.shapes.frameOverrides) {
        // Type guard to check if frameName exists in frameOverrides
        const frameOverrides = stickyConfig.shapes.frameOverrides as Record<string, any>;
        if (frameOverrides[frameName]) {
          const override = frameOverrides[frameName];
          if (override.shape) shape = override.shape as 'square' | 'rectangle';
          if (override.width) width = override.width;
          if (override.height) height = override.height;
          
          Logger.log('STICKY-POS', `Using frame-specific sticky configuration: shape=${shape}, width=${width}, height=${height}`);
        }
      } else if (stickyConfig.shapes && stickyConfig.shapes.default) {
        shape = stickyConfig.shapes.default as 'square' | 'rectangle';
      }
      
      // =========================================================================
      // REVISED: Proper Frame Assignment Using frame.add()
      // =========================================================================
      // Instead of relying on coordinate-based frame assignment, we:
      // 1. Create the sticky note first with coordinates that place it inside the frame
      // 2. Use frame.add() to establish proper parent-child relationship
      // 3. The coordinates become relative to frame's top-left corner after add()
      // =========================================================================
      
      // Calculate the frame bounds for validation
      const frameLeft = frame.x - frame.width/2;
      const frameTop = frame.y - frame.height/2;
      const frameRight = frame.x + frame.width/2;
      const frameBottom = frame.y + frame.height/2;
      
      // Ensure the position is within the frame bounds with margin
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
        Logger.error('STICKY-POS', `CRITICAL ERROR: Calculated Position (${adjustedX}, ${adjustedY}) is OUTSIDE frame bounds! Frame: ${frame.title} (${frameLeft}, ${frameTop}) -> (${frameRight}, ${frameBottom})`);
        // Return early to prevent Miro error
        return { sticky: null, rowSpacesUsed: 0 };
      }
      
      Logger.log('STICKY-POS', `Adjusted position (within frame bounds): X=${adjustedX.toFixed(0)}, Y=${adjustedY.toFixed(0)}`);
      
      // HANDLE MIRO'S CHARACTER LIMIT
      
      // Check if content exceeds the character limit
      if (content.length > this.STICKY_CHAR_LIMIT) {
        console.log(`Content exceeds character limit (${content.length} > ${this.STICKY_CHAR_LIMIT}), creating multiple sticky notes`);
        // Create multiple sticky notes for the long content
        const { stickies, rowSpacesUsed } = await this.createMultipleStickyNotesWithFrameAdd(
          frame,
          content,
          adjustedX,
          adjustedY,
          color,
          width,
          shape
        );
        
        // Return the first sticky from the set
        return { 
          sticky: stickies.length > 0 ? stickies[0] : null, 
          rowSpacesUsed: rowSpacesUsed 
        };
      } else {
        // Content fits within limit, create a single sticky note
        const sticky = await MiroApiClient.createStickyNote({
          content: content,
          x: adjustedX,
          y: adjustedY,
          width: width,
          shape: shape,
          style: {
            fillColor: color
          }
        });
        
        // =========================================================================
        // NEW: Properly add sticky note to frame as child
        // =========================================================================
        if (sticky) {
          try {
            // Add the sticky note to the frame to establish parent-child relationship
            await frame.add(sticky);
            Logger.log('VR-STICKY', `Successfully added sticky note (ID: ${sticky.id}) to frame "${frame.title}" as child`);
          } catch (addError) {
            Logger.warn('VR-STICKY', `Failed to add sticky note to frame as child: ${addError}. Sticky was created but may not have proper parent-child relationship.`);
            // Note: The sticky note was still created, just may not have proper parentId
          }
        }
        
        Logger.log('VR-STICKY', `StickyNoteService: Single sticky note created. ID: ${sticky?.id}`, { content: content.substring(0,50) });
        return { sticky, rowSpacesUsed: 1 };
      }
    } catch (error) {
      Logger.error('VR-STICKY', 'Error creating sticky note:', error);
      return { sticky: null, rowSpacesUsed: 0 };
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
   * Calculate the position for a sticky note based on score and count
   * @param frame The frame to place the sticky in
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
    const { itemsPerColumn: ITEMS_PER_COL } = stickyConfig.layout;
    
    // DRAMATICALLY REDUCED MARGINS - Almost eliminate them to use more space
    const minimumMargin = 20; // Absolute minimum margin from frame edge
    
    // Frame dimensions
    const frameLeft = frame.x - frame.width/2;
    const frameTop = frame.y - frame.height/2;
    const frameWidth = frame.width;
    const frameHeight = frame.height;
    
    // MAXIMIZED SPACE USAGE:
    // Use nearly the full frame width, leaving only minimal margins
    const effectiveWidth = frameWidth - (minimumMargin * 2); // Fixed: multiply by 2 for both sides
    
    // EQUAL WIDTH SECTIONS: Divide available space equally between the 3 scores
    const maxScore = relevanceConfig.scale.max;
    const sectionWidth = effectiveWidth / maxScore;
    
    // REVERSED ORDER: Score 3 on left (now using the full score value)
    // This version ensures we use more of the left side
    const reversedScore = maxScore - score + 1; // Example: For score=3, section=1 (leftmost)
    const sectionIndex = reversedScore - 1; // Convert to 0-based
    
    // OPTIMIZE ROW DISTRIBUTION:
    // Increase items per column for better vertical distribution
    const effectiveItemsPerCol = ITEMS_PER_COL + 3; // Add 3 more items per column for better vertical usage
    
    // Calculate row and column within this score's section
    const col = Math.floor(totalSoFar / effectiveItemsPerCol);
    const row = totalSoFar % effectiveItemsPerCol;
    
    // REDUCED SPACING FOR DENSITY:
    // Horizontal spacing can be tighter than vertical to prevent overlap
    const effectiveHorizontalSpacing = SPACING * 0.85; // 85% of original spacing horizontally
    const effectiveVerticalSpacing = SPACING * 1.2; // INCREASED to 120% of original spacing vertically
    
    // Start sticky notes much closer to the left edge
    // Calculate the base x position for this score's section - start at left edge + minimum margin
    const sectionBaseX = frameLeft + minimumMargin + (sectionIndex * sectionWidth) + (STICKY_WIDTH / 2);
    
    // Reserve 400px space at the top for other content
    const topStart = frameTop + this.RESERVED_SPACE;
    
    // Calculate initial position with adjusted spacing
    let x = sectionBaseX + (col * (STICKY_WIDTH + effectiveHorizontalSpacing));
    let y = topStart + (row * (STICKY_HEIGHT + effectiveVerticalSpacing));
    
    // EXTENDED BOUNDS:
    // Allow sticky notes to get much closer to frame edges
    const rightBound = frameLeft + frameWidth - (STICKY_WIDTH/2) - 10;
    
    // SIMPLIFIED BOTTOM BOUND:
    // Leave space for exactly one sticky note's height from the bottom
    const bottomBound = frameTop + frameHeight - STICKY_HEIGHT - 5;
    
    // Handle overflow with priority on using all available space
    if (x > rightBound) {
      // SMARTER SECTION OVERFLOW:
      // If this is score 3 or 2, try to use the next section's space
      if ((score === 3 || score === 2) && sectionIndex < maxScore - 1) {
        // Move to next section (score 2 or 1 area)
        const nextSectionIndex = sectionIndex + 1;
        
        // Start at the left edge of the next section
        x = frameLeft + minimumMargin + (nextSectionIndex * sectionWidth) + (STICKY_WIDTH / 2);
        
        // If that's also beyond the right bound, use standard overflow
        if (x > rightBound) {
          // Go back to the first column but next row
          x = sectionBaseX;
          y += STICKY_HEIGHT + effectiveVerticalSpacing;
        }
      } else {
        // Standard overflow - next row
        x = sectionBaseX;
        y += STICKY_HEIGHT + effectiveVerticalSpacing;
      }
    }
    
    // SIMPLIFIED VERTICAL OVERFLOW:
    if (y > bottomBound) {
      // First try a new column in the same section
      x += STICKY_WIDTH + effectiveHorizontalSpacing;
      y = topStart; // Reset to the top (after the 400px space)
      
      // If that would overflow the right edge...
      if (x > rightBound) {
        // Start from the far left edge but position closer to the bottom
        x = frameLeft + minimumMargin + (STICKY_WIDTH / 2);
        // Position at 80% of frame height to use the bottom space effectively
        y = frameTop + (frameHeight * 0.9);
      }
    }
    
    // Final safety bounds check - absolute minimum margins
    // This is just to prevent overlap with frame borders
    const safetyMargin = 5; // Absolute minimum safety margin 
    x = Math.max(frameLeft + (STICKY_WIDTH/2) + safetyMargin, Math.min(frameLeft + frameWidth - (STICKY_WIDTH/2) - safetyMargin, x));
    y = Math.max(frameTop + (STICKY_HEIGHT/2) + this.RESERVED_SPACE, Math.min(frameTop + frameHeight - (STICKY_HEIGHT/2) - safetyMargin, y));
    
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
      : frameConfig.names.thinkingDialogue;
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
      Logger.log('VR-STICKY', `Creating ${processedPoints.length} stickies in frame: ${frameName}`, { mode });
      
      // Ensure frame exists
      const frame = await this.ensureFrameExists(frameName);
      
      // Get initial counters for positioning
      const initialCounters = this.getInitialCounters(); 
      Logger.log('STICKY-POS', 'Initial counters for frame:', initialCounters);
      
      // Get relevance configuration
      const relevanceConfig = ConfigurationService.getRelevanceConfig();
      const threshold = relevanceThreshold || relevanceConfig.scale.defaultThreshold;
      
      // Initialize counter array for tracking stickies by score - start with 0 for new session
      // This is the key fix for overlapping notes - don't rely on existing stickies count
      // which might be causing position calculation issues
      const countsByScore = this.getInitialCounters();
      Logger.log('STICKY-POS', 'Starting with fresh counters to prevent overlapping:', countsByScore);
      
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
          Logger.log('STICKY-POS', `Creating sticky #${i+1}, current counters:`, countsByScore);
          const { sticky, rowSpacesUsed } = await this.createStickyWithRelevance(
            frame,
            point.proposal,
            point.relevanceScore,
            mode,
            countsByScore
          );
          
          if (!sticky) {
            Logger.warn('VR-STICKY', `Failed to create sticky note for point index ${i}, proposal: "${point.proposal.substring(0,30)}..."`);
          } else {
            Logger.log('VR-STICKY', `Successfully created sticky (ID: ${sticky.id}) for point index ${i}`);
          }
          
          // Increment the counter by the number of row spaces used
          // This ensures we track the actual vertical space used by connected notes
          countsByScore[point.relevanceScore - 1] += rowSpacesUsed;
          
          // Add a delay between creations to avoid rate limiting
          const delayTime = ConfigurationService.getRelevanceConfig().delayBetweenCreations;
          await delay(delayTime);
        } catch (error) {
          Logger.error('VR-STICKY', `Error creating sticky note inside loop for point index ${i}:`, error);
        }
      }
      
      Logger.log('VR-STICKY', `Finished creating ${pointsWithRelevance.length} sticky notes in "${frameName}" frame`);
    } catch (error) {
      Logger.error('VR-STICKY', `Error in createStickyNotesFromPoints for frame "${frameName}":`, error);
      throw error;
    }
  }

  /**
   * Calculate position for non-relevance-based sticky notes using a multi-column layout
   * Optimized for frames like Design-Proposal and Thinking-Dialogue where relevance scores aren't used
   * @param frame The frame to place the sticky in
   * @param totalSoFar Number of stickies created so far
   */
  private static calculateGeneralStickyPosition(
    frame: Frame,
    totalSoFar: number
  ): { x: number, y: number } {
    const stickyConfig = ConfigurationService.getStickyConfig();
    
    // Check for frame-specific sticky dimensions
    let width = stickyConfig.dimensions.width;
    let height = stickyConfig.dimensions.height;
    
    // Check if there are frame-specific overrides for sticky dimensions
    if (stickyConfig.shapes && stickyConfig.shapes.frameOverrides) {
      const frameOverrides = stickyConfig.shapes.frameOverrides as Record<string, any>;
      if (frameOverrides[frame.title]) {
        const override = frameOverrides[frame.title];
        if (override.width) width = override.width;
        if (override.height) height = override.height;
      }
    }
    
    const SPACING = stickyConfig.dimensions.spacing;
    
    // Frame dimensions
    const frameLeft = frame.x - frame.width/2;
    const frameTop = frame.y - frame.height/2;
    const frameWidth = frame.width;
    const frameHeight = frame.height;
    
    // Calculate how many columns can fit in the frame width
    const margin = 20;
    const effectiveWidth = frameWidth - (margin * 2);
    const effectiveHeight = frameHeight - (margin * 2);
    
    // Always ensure at least 2 columns for better space usage
    const maxColumns = Math.max(2, Math.floor(effectiveWidth / (width + SPACING)));
    
    // Use consistent row height with adequate spacing
    const rowSpacing = height + SPACING;
    const itemsPerColumn = Math.max(6, Math.floor(effectiveHeight / rowSpacing));
    
    // Calculate column and row based on total stickies so far
    const column = Math.floor(totalSoFar / itemsPerColumn) % maxColumns;
    const row = totalSoFar % itemsPerColumn;
    
    // Calculate position with evenly distributed columns
    const columnWidth = effectiveWidth / maxColumns;
    const columnCenter = frameLeft + margin + (width / 2) + (column * columnWidth);
    
    // Reserve 400px space at the top for other content
    // Calculate Y position with consistent spacing starting 400px from the top
    const y = frameTop + this.RESERVED_SPACE + (height / 2) + (row * rowSpacing);
    
    // Handle overflow case when we exceed the maxColumns
    if (Math.floor(totalSoFar / itemsPerColumn) >= maxColumns) {
      const overflowLayer = Math.floor(totalSoFar / (itemsPerColumn * maxColumns));
      const layerHeight = itemsPerColumn * rowSpacing;
      return {
        x: columnCenter,
        y: y + (overflowLayer * layerHeight)
      };
    }
    
    return { x: columnCenter, y: y };
  }

  /**
   * Create a Miro text widget (large text block).
   * @param frame The frame to associate the text widget with (optional, for positioning relative to frame)
   * @param textContent The full text content for the widget.
   * @param options Positioning and styling options.
   */
  public static async createMiroTextWidget(
    frame: Frame | null, // Frame can be null if not attaching to a specific frame initially
    textContent: string,
    options: {
      x: number;
      y: number;
      width: number;
      title?: string; // Optional title for the text block (could be a separate small sticky or text item)
      style?: { 
        backgroundColor?: string; 
        textAlign?: 'left' | 'center' | 'right'; 
        fontSize?: number; 
        borderColor?: string;
        borderWidth?: number;
        padding?: number;
      };
    }
  ): Promise<any | null> { // Return type depends on actual Miro SDK response
    try {
      Logger.log('MIRO-TEXT', `Creating Miro text widget with ${textContent.length} chars. Preview: "${textContent.substring(0, 100)}..."`, options);

      if (!textContent) {
        Logger.warn('MIRO-TEXT', 'Text content is empty, skipping text widget creation.');
        return null;
      }

      // Use a large sticky note as the primary method for showing the text
      // This is the most reliable way since we know createStickyNote is available
      try {
        Logger.log('MIRO-TEXT', 'Creating large sticky note for full transcript content');
        const stickyNote = await miro.board.createText({
          content: textContent,
          x: options.x,
          y: options.y,
          width: options.width || 600, // Use a larger width for transcript
          style: {
            fillColor: options.style?.backgroundColor || '#f5f5f5' // Light gray default
          }
        });

        Logger.log('MIRO-TEXT', `Successfully created transcript sticky note. ID: ${stickyNote?.id || 'unknown'}`);
        return stickyNote;
      } catch (sdkError) {
        Logger.error('MIRO-TEXT', 'Error creating Miro text content:', sdkError);
        return null;
      }
    } catch (error) {
      Logger.error('MIRO-TEXT', 'Failed to create Miro text widget:', error);
      return null;
    }
  }

  /**
   * Create sticky notes in a horizontal layout
   * @param points Array of content strings for the sticky notes
   * @param baseX Base X position to start from
   * @param baseY Base Y position to start from
   * @param maxWidth Maximum width available for the layout
   * @param color Color for the sticky notes
   * @param frame Optional frame to add sticky notes to as children
   * @returns Array of created sticky notes
   */
  public static async createHorizontalStickyNotes(
    points: string[], 
    baseX: number, 
    baseY: number, 
    maxWidth: number,
    color: string,
    frame?: Frame
  ): Promise<any[]> {
    if (!points.length) return [];
    
    // Use normal sticky note dimensions
    const stickyWidth = 500;     // Back to normal size
    const stickyHeight = 200;    // Back to normal size  
    const spacing = 30;          // Back to normal spacing
    
    // Calculate how many sticky notes can fit horizontally
    const maxPerRow = Math.floor(maxWidth / (stickyWidth + spacing));
    
    const createdStickies = [];
    
    // Create sticky notes in a horizontal layout
    for (let i = 0; i < points.length; i++) {
      const col = i % maxPerRow;
      const row = Math.floor(i / maxPerRow);
      
      const x = baseX + col * (stickyWidth + spacing);
      const y = baseY + row * (stickyHeight + spacing);
      
      try {
        const sticky = await MiroApiClient.createStickyNote({
          content: points[i],
          x: x,
          y: y,
          width: stickyWidth,
          shape: 'rectangle',
          style: {
            fillColor: color
          }
        });
        
        if (sticky) {
          // =========================================================================
          // NEW: Properly add sticky note to frame as child if frame is provided
          // =========================================================================
          if (frame) {
            try {
              await frame.add(sticky);
              Logger.log('STICKY-HORIZONTAL', `Successfully added horizontal sticky note ${i + 1}/${points.length} (ID: ${sticky.id}) to frame "${frame.title}" as child`);
            } catch (addError) {
              Logger.warn('STICKY-HORIZONTAL', `Failed to add horizontal sticky note ${i + 1} to frame as child: ${addError}`);
              // Continue anyway - the sticky was still created
            }
          }
          
          createdStickies.push(sticky);
          Logger.log('STICKY-HORIZONTAL', `Created sticky note ${i + 1}/${points.length} at (${x}, ${y})`);
        }
      } catch (error) {
        Logger.error('STICKY-HORIZONTAL', `Error creating sticky note ${i + 1}:`, error);
      }
      
      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    Logger.log('STICKY-HORIZONTAL', `Successfully created ${createdStickies.length}/${points.length} sticky notes in horizontal layout`);
    return createdStickies;
  }
} 