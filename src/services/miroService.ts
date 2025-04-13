import { MiroFrameService } from './miro/frameService';
import { MiroImageService } from './miro/imageService';
import { MiroDesignService } from './miro/designService';
import { ConfigurationService } from './configurationService';
import { ProcessedDesignPoint, ProcessedPointWithRelevance } from '../types/common';
import { StickyNoteService } from './miro/stickyNoteService';
import { MiroApiClient } from './miro/miroApiClient';
import { saveConsensusPoints } from '../utils/firebase';

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
    try {
      const points = await MiroDesignService.getConsensusPoints();
      if (points.length > 0) {
        const boardInfo = await miro.board.getInfo();
        await saveConsensusPoints({
          points,
          boardId: boardInfo.id
        });
        console.log(`Saved ${points.length} consensus points to Firebase`);
      }
      return points;
    } catch (err) {
      console.error('Error getting consensus points:', err);
      return [];
    }
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
      console.log(`Adding ${points.length} consensus points`);
      
      // Convert string points to ProcessedDesignPoint format
      const processedPoints: ProcessedDesignPoint[] = points.map(point => ({
        proposal: point,
        category: 'consensus'  // Mark as consensus category
      }));
      
      // Use the unified method to create sticky notes
      await StickyNoteService.createStickyNotesFromPoints(
        'Consensus',
        processedPoints,
        'decision'  // Use decision mode for styling
      );
      
      // After adding new consensus points, save them to Firebase
      try {
        const boardInfo = await miro.board.getInfo();
        await saveConsensusPoints({
          points,
          boardId: boardInfo.id
        });
        console.log(`Saved ${points.length} new consensus points to Firebase`);
      } catch (error) {
        console.error('Error saving new consensus points to Firebase:', error);
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
      // Create all sticky notes using the unified method
      await StickyNoteService.createStickyNotesFromPoints(
        frameName,
        points,
        'decision'  // Default to decision mode
      );
      
      // If there are connections to create, we need to fetch the created stickies
      if (existingConnections && existingConnections.length > 0) {
        console.log(`Creating ${existingConnections.length} connections between sticky notes`);
        
        // Find the frame
        const frame = await MiroFrameService.findFrameByTitle(frameName);
        if (!frame) {
          console.error(`Frame ${frameName} not found for creating connections`);
          return;
        }
        
        // Get all stickies in the frame
        const frameStickies = await MiroApiClient.getStickiesInFrame(frame.id);
        
        // Create a map of content to sticky
        const stickiesMap = new Map<string, any>();
        for (const sticky of frameStickies) {
          stickiesMap.set(sticky.content, sticky);
        }
        
        // Create connections
        for (const connection of existingConnections) {
          const fromSticky = stickiesMap.get(connection.from);
          const toSticky = stickiesMap.get(connection.to);
          
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
      console.error('Error creating stickies from points:', error);
      throw error;
    }
  }
} 