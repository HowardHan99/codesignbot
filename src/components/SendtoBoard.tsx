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
        width: STICKY_WIDTH * 3 + SPACING * 4, // Width to accommodate 3 columns
        height: 1000
      });
    }
    
    return frame;
  };

  const findEmptySpace = (frame: any, stickyIndex: number) => {
    // Calculate grid position with 3 columns for better spacing
    const col = stickyIndex % 3; // 3 columns
    const row = Math.floor(stickyIndex / 3);
    
    // Calculate position relative to frame's coordinate system
    const x = frame.x - frame.width/2 + SPACING + (col * (STICKY_WIDTH + SPACING)) + STICKY_WIDTH/2;
    const y = frame.y - frame.height/2 + SPACING + (row * (STICKY_WIDTH + SPACING)) + STICKY_WIDTH/2;
    
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
        const position = findEmptySpace(frame, i);
        
        // Create the sticky note
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

      // Adjust frame size if needed
      const rows = Math.ceil(responses.length / 3);
      const neededHeight = (rows * (STICKY_WIDTH + SPACING)) + SPACING;
      if (neededHeight > frame.height) {
        // Create new frame with updated height
        const updatedFrame = await miro.board.createFrame({
          title: frame.title,
          x: frame.x,
          y: frame.y,
          width: frame.width,
          height: neededHeight
        });

        // Delete old frame (this will not delete the sticky notes)
        await miro.board.remove(frame);
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
