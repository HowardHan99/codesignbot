import { MiroFrameService } from './miro/frameService';
import { MiroImageService } from './miro/imageService';
import { MiroDesignService } from './miro/designService';

/**
 * Main service class for Miro operations
 * Acts as a facade for more specific services
 */
export class MiroService {
  /**
   * Retrieves the design challenge from the Design-Challenge frame
   * @returns Promise resolving to the challenge text, or empty string if not found
   */
  public static async getDesignChallenge(): Promise<string> {
    return MiroDesignService.getDesignChallenge();
  }

  /**
   * Cleans the Antagonistic-Response frame by removing all sticky notes within it
   */
  public static async cleanAnalysisBoard(): Promise<void> {
    return MiroDesignService.cleanAnalysisBoard();
  }

  /**
   * Sends synthesized points to the Miro board as a formatted text box
   * @param points - Array of synthesized points to display
   */
  public static async sendSynthesizedPointsToBoard(points: string[]): Promise<void> {
    return MiroDesignService.sendSynthesizedPointsToBoard(points);
  }

  /**
   * Retrieves consensus points from the Consensus frame
   * @returns Promise resolving to an array of consensus points
   */
  public static async getConsensusPoints(): Promise<string[]> {
    return MiroDesignService.getConsensusPoints();
  }

  /**
   * Gets all images from the Sketch-Reference frame and saves them to assets
   * @returns Promise resolving to an array of saved image paths
   */
  public static async getAllImagesFromFrame(): Promise<string[]> {
    return MiroImageService.getAllImagesFromFrame();
  }

  /**
   * Adds new consensus points to the Consensus frame
   * @param points - Array of consensus points to add
   */
  public static async addConsensusPoints(points: string[]): Promise<void> {
    try {
      // Find or create the Consensus frame
      let consensusFrame = await MiroFrameService.findFrameByTitle('Consensus');
      
      if (!consensusFrame) {
        consensusFrame = await MiroFrameService.createFrame(
          'Consensus',
          0,
          1000,
          400,
          Math.max(500, points.length * 50)  // Dynamic height based on number of points
        );
      }

      // Calculate positions for sticky notes in a grid layout
      const STICKY_WIDTH = 200;
      const SPACING = 20;
      const COLUMNS = 2;
      
      // Create sticky notes for each point
      for (let i = 0; i < points.length; i++) {
        const column = i % COLUMNS;
        const row = Math.floor(i / COLUMNS);
        
        // Calculate position relative to frame
        const x = consensusFrame.x - (consensusFrame.width/2) + SPACING + (column * (STICKY_WIDTH + SPACING)) + STICKY_WIDTH/2;
        const y = consensusFrame.y - (consensusFrame.height/2) + SPACING + (row * (STICKY_WIDTH + SPACING)) + STICKY_WIDTH/2;
        
        // Create sticky note
        await miro.board.createStickyNote({
          content: points[i],
          x: x,
          y: y,
          width: STICKY_WIDTH,
          style: {
            fillColor: 'light_yellow'
          }
        });

        // Update frame height if needed
        const neededHeight = (Math.ceil(points.length / COLUMNS) * (STICKY_WIDTH + SPACING)) + SPACING;
        if (neededHeight > consensusFrame.height) {
          // Create new frame with updated height
          consensusFrame = await MiroFrameService.createFrame(
            'Consensus',
            consensusFrame.x,
            consensusFrame.y,
            consensusFrame.width,
            neededHeight
          );
        }
      }

      console.log(`Added ${points.length} consensus points`);
    } catch (error) {
      console.error('Error adding consensus points:', error);
      throw error;
    }
  }
} 