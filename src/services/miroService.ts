import { MiroFrameService } from './miro/frameService';
import { MiroImageService } from './miro/imageService';
import { MiroDesignService } from './miro/designService';
import { ConfigurationService } from './configurationService';

interface ProcessedDesignPoint {
  proposal: string;
  explanation?: string;
  category?: string;
}

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
      // Get configuration for sticky notes
      const { dimensions, layout } = ConfigurationService.getStickyConfig();
      const { width: STICKY_WIDTH, height: STICKY_HEIGHT, spacing: SPACING } = dimensions;
      const { itemsPerColumn, topMargin, leftMargin } = layout;
      
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

      // Calculate needed frame dimensions
      const columns = Math.ceil(points.length / itemsPerColumn);
      const rows = Math.min(points.length, itemsPerColumn);
      const frameWidth = Math.max(400, columns * (STICKY_WIDTH + SPACING) + leftMargin * 2);
      const frameHeight = Math.max(500, rows * (STICKY_HEIGHT + SPACING) + topMargin + SPACING);
      
      // Update frame if needed
      if (consensusFrame.width < frameWidth || consensusFrame.height < frameHeight) {
        consensusFrame = await MiroFrameService.createFrame(
          'Consensus',
          consensusFrame.x,
          consensusFrame.y,
          Math.max(consensusFrame.width, frameWidth),
          Math.max(consensusFrame.height, frameHeight)
        );
      }
      
      // Create sticky notes for each point
      for (let i = 0; i < points.length; i++) {
        const column = i % 2;
        const row = Math.floor(i / 2);
        
        // Calculate position relative to frame
        const x = consensusFrame.x - (consensusFrame.width/2) + leftMargin + (column * (STICKY_WIDTH + SPACING)) + STICKY_WIDTH/2;
        const y = consensusFrame.y - (consensusFrame.height/2) + topMargin + (row * (STICKY_HEIGHT + SPACING)) + STICKY_HEIGHT/2;
        
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

        // Add delay between sticky notes
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      console.log(`Added ${points.length} consensus points`);
    } catch (error) {
      console.error('Error adding consensus points:', error);
      throw error;
    }
  }

  /**
   * Creates sticky notes from design points in a specified frame
   * @param points The design points to create sticky notes for
   * @param frameName The name of the frame to create sticky notes in
   * @param existingConnections Optional array of connections to create between sticky notes
   */
  public static async createStickiesFromPoints(
    points: ProcessedDesignPoint[],
    frameName: string,
    existingConnections?: Array<{from: string, to: string}>
  ): Promise<void> {
    try {
      // Get configuration for sticky notes
      const { dimensions, layout } = ConfigurationService.getStickyConfig();
      const { width: STICKY_WIDTH, height: STICKY_HEIGHT, spacing: SPACING } = dimensions;
      const { itemsPerColumn, topMargin, leftMargin } = layout;
      
      // Calculate needed dimensions
      const columns = Math.ceil(points.length / itemsPerColumn);
      const rows = Math.min(points.length, itemsPerColumn);
      const frameWidth = Math.max(800, columns * (STICKY_WIDTH + SPACING) + leftMargin * 2);
      const frameHeight = Math.max(400, rows * (STICKY_HEIGHT + SPACING) + topMargin + SPACING);
      
      // Find or create the target frame
      let frame = await MiroFrameService.findFrameByTitle(frameName);
      
      if (!frame) {
        frame = await MiroFrameService.createFrame(
          frameName,
          0,
          0,
          frameWidth,
          frameHeight
        );
      } else if (frame.width < frameWidth || frame.height < frameHeight) {
        // Create a new frame with larger dimensions
        const newFrame = await MiroFrameService.createFrame(
          frameName,
          frame.x,
          frame.y,
          Math.max(frame.width, frameWidth),
          Math.max(frame.height, frameHeight)
        );
        frame = newFrame;
      }
      
      // Create sticky notes with proper formatting and spacing
      const createdStickies = new Map<string, any>(); // Map proposal text to sticky for connections
      
      for (let i = 0; i < points.length; i++) {
        const point = points[i];
        
        // Calculate position in a grid layout
        const column = Math.floor(i / itemsPerColumn);
        const row = i % itemsPerColumn;
        
        const x = frame.x - frame.width/2 + leftMargin + (column * (STICKY_WIDTH + SPACING)) + STICKY_WIDTH/2;
        const y = frame.y - frame.height/2 + topMargin + (row * (STICKY_HEIGHT + SPACING)) + STICKY_HEIGHT/2;
        
        // Create sticky with retry mechanism
        let retries = 0;
        let stickyNote = null;
        
        while (retries < 3) {
          try {
            stickyNote = await miro.board.createStickyNote({
              content: point.proposal,
              x,
              y,
              width: STICKY_WIDTH,
              style: {
                fillColor: point.category === 'response' ? 'light_green' 
                          : point.category === 'designer-thinking' ? 'light_blue'
                          : 'light_yellow'
              }
            });
            
            // Save the sticky for connection creation
            createdStickies.set(point.proposal, stickyNote);
            break;
          } catch (error) {
            retries++;
            if (retries === 3) throw error;
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
        
        // Add delay between sticky notes
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      // Create connections if provided
      if (existingConnections && existingConnections.length > 0) {
        console.log(`Creating ${existingConnections.length} connections between sticky notes`);
        
        for (const connection of existingConnections) {
          const fromSticky = createdStickies.get(connection.from);
          const toSticky = createdStickies.get(connection.to);
          
          if (fromSticky && toSticky) {
            try {
              await miro.board.createConnector({
                start: {
                  item: fromSticky.id,
                  position: { x: 0.5, y: 1 } // Bottom of the sticky
                },
                end: {
                  item: toSticky.id,
                  position: { x: 0.5, y: 0 } // Top of the sticky
                },
                style: {
                  strokeColor: '#4262ff',
                  strokeWidth: 2,
                  strokeStyle: 'normal'
                }
              });
              
              // Add delay between connector creations
              await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
              console.error('Error creating connector:', error);
            }
          }
        }
      }
    } catch (error) {
      throw error;
    }
  }
} 