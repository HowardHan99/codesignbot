export class MiroService {
  public static async getDesignChallenge(): Promise<string> {
    try {
      const frames = await miro.board.get({ type: 'frame' });
      const challengeFrame = frames.find(f => f.title === 'Design-Challenge');
      
      if (!challengeFrame) {
        console.log('Design-Challenge frame not found');
        return '';
      }

      const allStickies = await miro.board.get({ type: 'sticky_note' });
      const challengeStickies = allStickies.filter(sticky => sticky.parentId === challengeFrame.id);
      
      if (challengeStickies.length === 0) {
        console.log('No sticky notes found in Design-Challenge frame');
        return '';
      }

      const challenge = challengeStickies.map(sticky => sticky.content).join('\n');
      console.log('Found design challenge:', challenge);
      return challenge;

    } catch (err) {
      console.error('Error getting design challenge:', err);
      return '';
    }
  }

  public static async cleanAnalysisBoard(): Promise<void> {
    try {
      const frames = await miro.board.get({ type: 'frame' });
      const responseFrame = frames.find(f => f.title === 'Antagonistic-Response');
      
      if (!responseFrame) {
        console.log('No Antagonistic-Response frame found');
        return;
      }

      const frameBounds = {
        left: responseFrame.x - responseFrame.width / 2,
        right: responseFrame.x + responseFrame.width / 2,
        top: responseFrame.y - responseFrame.height / 2,
        bottom: responseFrame.y + responseFrame.height / 2
      };

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

  public static async sendSynthesizedPointsToBoard(points: string[]): Promise<void> {
    if (!points.length) return;

    try {
      const frames = await miro.board.get({ type: 'frame' });
      let responseFrame = frames.find(f => f.title === 'Antagonistic-Response');
      
      if (!responseFrame) {
        responseFrame = await miro.board.createFrame({
          title: 'Antagonistic-Response',
          x: 1000,
          y: 0,
          width: 400,
          height: Math.max(500, points.length * 50)
        });
      }

      const formattedText = [
        '🤖 Synthesized Design Critiques',
        '',
        'These points represent the key concerns raised across different analyses:',
        '',
        ...points.map((point, index) => `${index + 1}. ${point}`),
        '',
      ].join('\n');

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

      await miro.board.viewport.zoomTo(textBox);
      await miro.board.select({ id: textBox.id });
    } catch (error) {
      console.error('Error sending synthesized points to board:', error);
    }
  }
} 