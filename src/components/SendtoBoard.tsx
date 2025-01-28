'use client';
import { FC } from 'react';

interface SendtoBoardProps {
  responses: string[];
}

const STICKY_WIDTH = 200;
const SPACING = 20;
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
        width: 1200,  // Increased width to accommodate more sticky notes
        height: 1000  // Increased height to accommodate more sticky notes
      });
    }
    
    return frame;
  };

  const findEmptySpace = async (frame: any, stickyIndex: number) => {
    // Calculate grid position with 4 columns instead of 3
    const col = stickyIndex % 4; // 4 columns
    const row = Math.floor(stickyIndex / 4);
    
    // Calculate position relative to frame
    const x = frame.x - frame.width/2 + STICKY_WIDTH/2 + col * (STICKY_WIDTH + SPACING);
    const y = frame.y - frame.height/2 + STICKY_WIDTH/2 + row * (STICKY_WIDTH + SPACING);
    
    return { x, y };
  };

  const splitResponseIntoBulletPoints = (response: string): string[] => {
    // Split by ** ** and filter out empty strings
    const points = response.split('** **').filter(point => point.trim().length > 0);
    
    // Clean up each point
    return points.map(point => {
      // Remove leading/trailing whitespace and bullet points
      return point.trim().replace(/^[-•*]\s*/, '');
    });
  };

  const addSticky = async () => {
    if (!responses?.length) {
      console.log('No responses to add');
      return;
    }
    
    try {
      // Find or create the frame
      const frame = await findOrCreateFrame();
      console.log('Found/created frame:', frame);
      
      // Create sticky notes in empty spaces
      const createdStickies = [];
      let stickyIndex = 0;

      for (const response of responses) {
        // Split the response into bullet points
        const bulletPoints = splitResponseIntoBulletPoints(response);
        console.log('Split into bullet points:', bulletPoints);

        for (const point of bulletPoints) {
          if (point.trim()) {  // Only create sticky notes for non-empty points
            try {
              // Find empty space for this sticky
              const position = await findEmptySpace(frame, stickyIndex);
              
              // Create the sticky note inside the frame's boundaries
              const stickyNote = await miro.board.createStickyNote({
                content: point,
                x: position.x,
                y: position.y,
                width: STICKY_WIDTH
              });
              
              createdStickies.push(stickyNote);
              stickyIndex++;
            } catch (stickyError) {
              console.error('Error creating sticky note:', stickyError);
            }
          }
        }
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
