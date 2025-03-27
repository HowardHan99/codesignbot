'use client';
import { FC } from 'react';
import { StickyNoteService } from '../services/miro/stickyNoteService';
import { ProcessedDesignPoint } from '../types/common';

interface SendtoBoardProps {
  responses: string[];
}

const FRAME_TITLE = 'Antagonistic-Response';

export const SendtoBoard: FC<SendtoBoardProps> = ({ responses }) => {
  const addSticky = async () => {
    if (!responses?.length) {
      console.log('No responses to add');
      return;
    }
    
    try {
      // Convert string responses to ProcessedDesignPoint format
      const processedPoints: ProcessedDesignPoint[] = responses.map(response => ({
        proposal: response,
        category: 'response'  // Mark as response category
      }));
      
      // Use the unified method to create sticky notes
      await StickyNoteService.createStickyNotesFromPoints(
        FRAME_TITLE,
        processedPoints,
        'response'  // Use response mode for styling
      );
      
      // Get the frame to zoom to it
      const frame = await StickyNoteService.ensureFrameExists(FRAME_TITLE);
      if (frame) {
        await miro.board.viewport.zoomTo(frame);
      }
      
      console.log(`Added ${responses.length} responses to board`);
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
