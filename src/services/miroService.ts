/**
 * Service class for handling Miro board operations
 * Provides methods for interacting with frames, sticky notes, and text on the Miro board
 */
export class MiroService {
  /**
   * Retrieves the design challenge from the Design-Challenge frame
   * @returns Promise resolving to the challenge text, or empty string if not found
   */
  public static async getDesignChallenge(): Promise<string> {
    try {
      // Find the Design-Challenge frame
      const frames = await miro.board.get({ type: 'frame' });
      const challengeFrame = frames.find(f => f.title === 'Design-Challenge');
      
      if (!challengeFrame) {
        console.log('Design-Challenge frame not found');
        return '';
      }

      // Get sticky notes within the challenge frame
      const allStickies = await miro.board.get({ type: 'sticky_note' });
      const challengeStickies = allStickies.filter(sticky => sticky.parentId === challengeFrame.id);
      
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
   * Cleans the Antagonistic-Response frame by removing all sticky notes within it
   */
  public static async cleanAnalysisBoard(): Promise<void> {
    try {
      // Find the Antagonistic-Response frame
      const frames = await miro.board.get({ type: 'frame' });
      const responseFrame = frames.find(f => f.title === 'Antagonistic-Response');
      
      if (!responseFrame) {
        console.log('No Antagonistic-Response frame found');
        return;
      }

      // Calculate frame boundaries
      const frameBounds = {
        left: responseFrame.x - responseFrame.width / 2,
        right: responseFrame.x + responseFrame.width / 2,
        top: responseFrame.y - responseFrame.height / 2,
        bottom: responseFrame.y + responseFrame.height / 2
      };

      // Find and remove sticky notes within the frame bounds
      const allStickies = await miro.board.get({ type: 'sticky_note' });
      const stickiesToRemove = allStickies.filter(sticky => {
        return sticky.x >= frameBounds.left &&
               sticky.x <= frameBounds.right &&
               sticky.y >= frameBounds.top &&
               sticky.y <= frameBounds.bottom;
      });
      
      for (const sticky of stickiesToRemove) {
        await miro.board.remove(sticky);
      }
    } catch (error) {
      console.error('Error cleaning analysis:', error);
    }
  }

  /**
   * Sends synthesized points to the Miro board as a formatted text box
   * @param points - Array of synthesized points to display
   */
  public static async sendSynthesizedPointsToBoard(points: string[]): Promise<void> {
    if (!points.length) return;

    try {
      // Find or create the Antagonistic-Response frame
      const frames = await miro.board.get({ type: 'frame' });
      let responseFrame = frames.find(f => f.title === 'Antagonistic-Response');
      
      if (!responseFrame) {
        responseFrame = await miro.board.createFrame({
          title: 'Antagonistic-Response',
          x: 1000,
          y: 0,
          width: 400,
          height: Math.max(500, points.length * 50)  // Dynamic height based on number of points
        });
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