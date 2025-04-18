import { Frame } from '@mirohq/websdk-types';
import { ConfigurationService } from '../configurationService';
import { MiroApiClient } from './miroApiClient';
import { safeApiCall } from '../../utils/errorHandlingUtils';
import { ProcessedDesignPoint, ProcessedPointWithRelevance } from '../../types/common';
import { RelevanceService } from '../relevanceService';
import { delay } from '../../utils/fileProcessingUtils';
import { Logger } from '../../utils/logger';

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
   * @returns Object containing created stickies array and the number of row spaces consumed
   */
  private static async createMultipleStickyNotes(
    frame: Frame,
    content: string,
    baseX: number,
    baseY: number,
    color: string,
    width: number
  ): Promise<{stickies: any[], rowSpacesUsed: number}> {
    // CONFIGURABLE: Adjust this value to control spacing between connected sticky notes
    const VERTICAL_GAP = 200; // Increased from 40 to 200 pixels for much better vertical separation
    // Add horizontal offset for connected stickies to improve readability
    const HORIZONTAL_OFFSET = 40; // Slight right shift for each connected note
    
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
      // Add horizontal offset to improve visual separation
      const yOffset = i * (VERTICAL_GAP + 60); // Increased vertical space
      const xOffset = i * HORIZONTAL_OFFSET; // New: Add slight horizontal offset for each connected note
      
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
          x: baseX + xOffset, // Add horizontal offset for connected notes
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
    
    // Calculate how many row spaces this series of connected notes consumes
    // This is based on the total vertical height used divided by standard row height
    const stickyConfig = ConfigurationService.getStickyConfig();
    const standardRowHeight = stickyConfig.dimensions.height + stickyConfig.dimensions.spacing;
    
    // For empty chunks (shouldn't happen), return 1 to avoid division by zero
    if (chunks.length === 0) {
      return { stickies: createdStickies, rowSpacesUsed: 1 };
    }
    
    // Calculate total vertical space used by the connected notes
    const totalVerticalSpace = (chunks.length - 1) * (VERTICAL_GAP + 60) + 60;
    
    // Calculate how many standard rows this would occupy (round up)
    const rowSpacesUsed = Math.ceil(totalVerticalSpace / standardRowHeight);
    
    // Return at least 1 row space, or more if needed
    return { 
      stickies: createdStickies, 
      rowSpacesUsed: Math.max(1, rowSpacesUsed)
    };
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
      if (frameName === 'Design-Proposal' || 
          frameName === 'Thinking-Dialogue' || 
          frameName === 'ProposalDialogue' ||
          frameName === 'Analysis-Response' ||
          frameName === 'Antagonistic-Response' ||
          frameName === 'Designer-Thinking') {
        Logger.log('STICKY-POS', `Using general multi-column layout for frame "${frameName}"`);
        position = this.calculateGeneralStickyPosition(frame, totalSoFar);
      } else {
        Logger.log('STICKY-POS', `Using score-based layout for frame "${frameName}"`);
        position = this.calculateStickyPosition(frame, totalSoFar, score);
      }
      
      Logger.log('STICKY-POS', `Calculated position: X=${position.x.toFixed(0)}, Y=${position.y.toFixed(0)}`);
      
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
        const { stickies, rowSpacesUsed } = await this.createMultipleStickyNotes(
          frame,
          content,
          adjustedX,
          adjustedY,
          color,
          width
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
          style: {
            fillColor: color
          }
        });
        
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
    
    // Start very close to the top edge
    const topStart = frameTop + minimumMargin;
    
    // Calculate initial position with adjusted spacing
    let x = sectionBaseX + (col * (STICKY_WIDTH + effectiveHorizontalSpacing));
    let y = topStart + (row * (STICKY_HEIGHT + effectiveVerticalSpacing));
    
    // EXTENDED BOUNDS:
    // Allow sticky notes to get much closer to frame edges
    const rightBound = frameLeft + frameWidth - (STICKY_WIDTH/2) - 10;
    
    // SIMPLIFIED BOTTOM BOUND:
    // Leave space for exactly one sticky note's height from the bottom
    const bottomBound = frameTop + frameHeight - STICKY_HEIGHT - 5; // Allow very close to the bottom - just 5px margin
    
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
      y = topStart; // Reset to the top
      
      // If that would overflow the right edge...
      if (x > rightBound) {
        // Start from the far left edge but position closer to the bottom
        x = frameLeft + minimumMargin + (STICKY_WIDTH / 2);
        // Position at 80% of frame height to use the bottom space effectively
        //THIS IS THE KEY LINE THAT CHANGES THE BOTTOM BOUND
        y = frameTop + (frameHeight * 0.9);
      }
    }
    
    // Final safety bounds check - absolute minimum margins
    // This is just to prevent overlap with frame borders
    const safetyMargin = 5; // Absolute minimum safety margin 
    x = Math.max(frameLeft + (STICKY_WIDTH/2) + safetyMargin, Math.min(frameLeft + frameWidth - (STICKY_WIDTH/2) - safetyMargin, x));
    y = Math.max(frameTop + (STICKY_HEIGHT/2) + safetyMargin, Math.min(frameTop + frameHeight - (STICKY_HEIGHT/2) - safetyMargin, y));
    
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
      Logger.log('VR-STICKY', `StickyNoteService: createStickyNotesFromPoints called for frame "${frameName}" with ${processedPoints.length} points.`);
      if (!processedPoints || processedPoints.length === 0) {
        Logger.warn('VR-STICKY', `No points provided to createStickyNotesFromPoints for frame "${frameName}".`);
        return;
      }
      
      console.log(`Creating ${processedPoints.length} sticky notes in ${frameName} frame`);
      
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
      
      // NEW: Get existing stickies in the frame to use as starting count
      try {
        const existingStickies = await MiroApiClient.getStickiesInFrame(frame.id);
        const existingCount = existingStickies.length;
        
        if (existingCount > 0) {
          Logger.log('STICKY-POS', `Found ${existingCount} existing stickies in frame "${frameName}", using as starting count.`);
          const maxScore = relevanceConfig.scale.max;
          for (let i = 0; i < maxScore; i++) {
            countsByScore[i] = existingCount;
          }
        }
      } catch (error) {
        // Note: Using console.error directly as Logger might not be initialized or error occurs before setup
        Logger.error('STICKY-POS', 'Error getting existing stickies count, using default counters:', error);
      }
      
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
    const { width: STICKY_WIDTH, height: STICKY_HEIGHT, spacing: SPACING } = stickyConfig.dimensions;
    
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
    const maxColumns = Math.max(2, Math.floor(effectiveWidth / (STICKY_WIDTH + SPACING)));
    
    // Use consistent row height with adequate spacing
    const rowSpacing = STICKY_HEIGHT + SPACING;
    const itemsPerColumn = Math.max(6, Math.floor(effectiveHeight / rowSpacing));
    
    // Calculate column and row based on total stickies so far
    const column = Math.floor(totalSoFar / itemsPerColumn) % maxColumns;
    const row = totalSoFar % itemsPerColumn;
    
    // Calculate position with evenly distributed columns
    const columnWidth = effectiveWidth / maxColumns;
    const columnCenter = frameLeft + margin + (STICKY_WIDTH / 2) + (column * columnWidth);
    
    // Calculate Y position with consistent spacing
    const y = frameTop + margin + (STICKY_HEIGHT / 2) + (row * rowSpacing);
    
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
} 