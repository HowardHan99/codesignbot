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
      console.log('Starting to fetch consensus points...');
      const consensusFrame = await MiroFrameService.findFrameByTitle('Consensus');
      
      if (!consensusFrame) {
        console.log('Consensus frame not found');
        return [];
      }
      console.log('Found Consensus frame:', consensusFrame);

      // Get all sticky notes first to debug
      const allStickies = await miro.board.get({ type: 'sticky_note' });
      console.log('All sticky notes on board:', allStickies.map(s => ({
        id: s.id,
        content: s.content,
        parentId: s.parentId
      })));

      const consensusStickies = allStickies.filter(sticky => sticky.parentId === consensusFrame.id);
      console.log('Filtered consensus stickies by parentId:', consensusStickies);
      
      // Also try getting by coordinates
      const stickiesByCoords = await MiroFrameService.getItemsInFrameBounds(consensusFrame);
      console.log('Stickies found by coordinates:', stickiesByCoords);
      
      // Combine both methods
      const combinedStickies = [...new Set([...consensusStickies, ...stickiesByCoords])];
      console.log('Combined unique stickies:', combinedStickies);
      
      if (combinedStickies.length === 0) {
        console.log('No sticky notes found in Consensus frame');
        return [];
      }

      // Return array of consensus points
      const points = combinedStickies.map(sticky => sticky.content);
      console.log('Extracted consensus points:', points);
      return points;

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
      // Get frames first
      const frames = await miro.board.get({ type: 'frame' });
      const responseFrame = frames.find(frame => frame.title === 'Antagonistic-Response');

      if (!responseFrame) {
        console.log('No Antagonistic-Response frame found');
        return;
      }

      // Get all sticky notes and filter by parentId
      const allStickies = await miro.board.get({ type: 'sticky_note' });
      const frameStickies = allStickies.filter(sticky => sticky.parentId === responseFrame.id);
      
      // Remove sticky notes one by one
      for (const sticky of frameStickies) {
        await miro.board.remove(sticky);
      }

      console.log(`Removed ${frameStickies.length} sticky notes from Antagonistic-Response frame`);
      
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