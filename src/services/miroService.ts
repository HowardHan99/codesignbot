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
} 