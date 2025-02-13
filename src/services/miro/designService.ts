import { MiroFrameService } from './frameService';

/**
 * Service for handling design-related operations in Miro
 */
export class MiroDesignService {
  /**
   * Retrieves the design challenge from the Design-Challenge frame
   */
  public static async getDesignChallenge(): Promise<string> {
    try {
      const challengeFrame = await MiroFrameService.findFrameByTitle('Design-Challenge');
      
      if (!challengeFrame) {
        console.log('Design-Challenge frame not found');
        return '';
      }

      const challengeStickies = await MiroFrameService.getStickiesInFrame(challengeFrame);
      
      if (challengeStickies.length === 0) {
        console.log('No sticky notes found in Design-Challenge frame');
        return '';
      }

      // Combine all sticky note contents
      const challenge = challengeStickies.map(sticky => sticky.content).join('\n');
      console.log('Found design challenge:', challenge);
      return challenge;

    } catch (err) {
      console.error('Error getting design challenge:', err);
      return '';
    }
  }

  /**
   * Retrieves consensus points from the Consensus frame
   */
  public static async getConsensusPoints(): Promise<string[]> {
    try {
      const consensusFrame = await MiroFrameService.findFrameByTitle('Consensus');
      
      if (!consensusFrame) {
        console.log('Consensus frame not found');
        return [];
      }

      const consensusStickies = await MiroFrameService.getStickiesInFrame(consensusFrame);
      
      if (consensusStickies.length === 0) {
        console.log('No sticky notes found in Consensus frame');
        return [];
      }

      // Return array of consensus points
      return consensusStickies.map(sticky => sticky.content);

    } catch (err) {
      console.error('Error getting consensus points:', err);
      return [];
    }
  }

  /**
   * Cleans the Antagonistic-Response frame by removing all sticky notes within it
   */
  public static async cleanAnalysisBoard(): Promise<void> {
    try {
      const responseFrame = await MiroFrameService.findFrameByTitle('Antagonistic-Response');
      
      if (!responseFrame) {
        console.log('No Antagonistic-Response frame found');
        return;
      }

      const stickiesToRemove = await MiroFrameService.getItemsInFrameBounds(responseFrame);
      
      for (const sticky of stickiesToRemove) {
        await miro.board.remove(sticky);
      }
    } catch (error) {
      console.error('Error cleaning analysis:', error);
    }
  }

  /**
   * Sends synthesized points to the Miro board as a formatted text box
   */
  public static async sendSynthesizedPointsToBoard(points: string[]): Promise<void> {
    if (!points.length) return;

    try {
      // Find or create the Antagonistic-Response frame
      let responseFrame = await MiroFrameService.findFrameByTitle('Antagonistic-Response');
      
      if (!responseFrame) {
        responseFrame = await MiroFrameService.createFrame(
          'Antagonistic-Response',
          1000,
          0,
          400,
          Math.max(500, points.length * 50)  // Dynamic height based on number of points
        );
      }

      // Format the text with header and points
      const formattedText = [
        '🤖 Synthesized Design Critiques',
        '',
        'These points represent the key concerns raised across different analyses:',
        '',
        ...points.map((point, index) => `${index + 1}. ${point}`),
        '',
      ].join('\n');

      // Create and style the text box
      const textBox = await miro.board.createText({
        content: formattedText,
        x: responseFrame.x,
        y: responseFrame.y,
        width: 350,
        style: {
          textAlign: 'left',
          fontSize: 14,
          color: '#1a1a1a',
          fontFamily: 'open_sans'
        }
      });

      // Focus the view on the created text box
      await miro.board.viewport.zoomTo(textBox);
      await miro.board.select({ id: textBox.id });
    } catch (error) {
      console.error('Error sending synthesized points to board:', error);
    }
  }
} 