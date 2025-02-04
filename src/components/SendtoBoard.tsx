'use client';
import { FC } from 'react';

interface SendtoBoardProps {
  responses: string[];
}

const STICKY_WIDTH = 200;
const SPACING = 50;
const FRAME_TITLE = 'Antagonistic-Response';

export const SendtoBoard: FC<SendtoBoardProps> = ({ responses }) => {
  const findOrCreateFrame = async () => {
    // Get all frames
    const frames = await miro.board.get({ type: 'frame' });
    
    // Find the Antagonistic-Response frame
    let frame = frames.find(f => f.title === FRAME_TITLE);
    
    if (!frame) {
      // If frame doesn't exist, create it
      frame = await miro.board.createFrame({
        title: FRAME_TITLE,
        x: 1000,
        y: 0,
        width: 1200,
        height: 1000
      });
    }
    
    return frame;
  };

  const findEmptySpace = async (frame: any, stickyIndex: number) => {
    // Calculate grid position with 3 columns for better spacing
    const col = stickyIndex % 3; // 3 columns
    const row = Math.floor(stickyIndex / 3);
    
    // Calculate position relative to frame with more spacing
    const startX = frame.x - frame.width/2 + STICKY_WIDTH;  // Start further from left edge
    const startY = frame.y - frame.height/2 + STICKY_WIDTH/2;  // Start from top
    
    const x = startX + col * (STICKY_WIDTH + SPACING);
    const y = startY + row * (STICKY_WIDTH + SPACING);
    
    return { x, y };
  };

  const addSticky = async () => {
    if (!responses?.length) {
      console.log('No responses to add');
      return;
    }
    
    try {
      // Find or create the frame
      const frame = await findOrCreateFrame();
      
      // Create sticky notes in empty spaces
      const createdStickies = [];
      for (let i = 0; i < responses.length; i++) {
        const response = responses[i];
        
        // Find empty space for this sticky
        const position = await findEmptySpace(frame, i);
        
        // Create the sticky note inside the frame's boundaries
        const stickyNote = await miro.board.createStickyNote({
          content: response,
          x: position.x,
          y: position.y,
          width: STICKY_WIDTH,
          style: {
            fillColor: 'light_pink'
          }
        });
        
        createdStickies.push(stickyNote);
      }

      // Select and zoom to all created sticky notes
      if (createdStickies.length > 0) {
        await miro.board.viewport.zoomTo(createdStickies);
        await miro.board.select({ id: createdStickies.map(sticky => sticky.id) });
      }
      
    } catch (error) {
      console.error('Error creating sticky notes:', error);
    }
  };

  return (
      <button
        type="button"
        onClick={addSticky}
        className="button button-primary"
        disabled={!responses?.length}
      >
        Send to Board ({responses?.length} responses)
      </button>
  );
};
