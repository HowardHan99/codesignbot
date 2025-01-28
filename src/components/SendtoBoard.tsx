'use client';
import { FC } from 'react';
import type { Tag, Frame } from '@mirohq/websdk-types';

interface SendtoBoardProps {
  responses: string[];
}

const MAX_STICKY_LENGTH = 500; // Maximum characters per sticky note
const AI_STICKY_COLOR = 'light_pink'; // Use Miro's built-in color
const STICKY_WIDTH = 200; // Default sticky note width
const STICKY_HEIGHT = 200; // Default sticky note height
const SPACING = 20; // Spacing between sticky notes

function splitResponse(response: string): string[] {
  if (response.length <= MAX_STICKY_LENGTH) {
    return [response];
  }

  // Try to split at paragraph or sentence boundaries
  const parts = response.split(/(?<=\.|\n)\s+/);
  const result: string[] = [];
  let currentPart = '';

  for (const part of parts) {
    if ((currentPart + part).length > MAX_STICKY_LENGTH) {
      if (currentPart) {
        result.push(currentPart.trim());
        currentPart = part;
      } else {
        // If a single part is too long, split it by words
        const words = part.split(' ');
        let temp = '';
        for (const word of words) {
          if ((temp + ' ' + word).length > MAX_STICKY_LENGTH) {
            result.push(temp.trim());
            temp = word;
          } else {
            temp = temp ? temp + ' ' + word : word;
          }
        }
        if (temp) currentPart = temp;
      }
    } else {
      currentPart = currentPart ? currentPart + ' ' + part : part;
    }
  }

  if (currentPart) {
    result.push(currentPart.trim());
  }

  return result;
}

async function findOrCreateFrame(title: string) {
  // Try to find existing frame
  const items = await miro.board.get();
  const frame = items.find(item => 
    item.type === 'frame' && 
    'title' in item && 
    item.title === title
  ) as Frame | undefined;

  if (frame) {
    return frame;
  }

  // Create new frame if not found
  return await miro.board.createFrame({
    title,
    width: 800,
    height: 600,
    style: {
      fillColor: '#ffffff1a'
    }
  });
}

async function findEmptySpace(frame: Frame, stickyCount: number) {
  const frameItems = await miro.board.get({
    type: 'sticky_note'
  });

  // Get frame boundaries
  const frameX = frame.x;
  const frameY = frame.y;
  const frameWidth = frame.width;
  const frameHeight = frame.height;

  // Calculate grid dimensions
  const cols = Math.floor(frameWidth / (STICKY_WIDTH + SPACING));
  const rows = Math.ceil(stickyCount / cols);

  // Expand frame height if needed
  if (frameHeight < rows * (STICKY_HEIGHT + SPACING)) {
    const newHeight = rows * (STICKY_HEIGHT + SPACING) + SPACING;
    await miro.board.createFrame({
      ...frame,
      height: newHeight
    });
  }

  // Calculate starting position (top-left of frame)
  const startX = frameX - frameWidth/2 + STICKY_WIDTH/2 + SPACING;
  const startY = frameY - frameHeight/2 + STICKY_HEIGHT/2 + SPACING;

  // Generate positions for all sticky notes
  const positions = [];
  for (let i = 0; i < stickyCount; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    positions.push({
      x: startX + col * (STICKY_WIDTH + SPACING),
      y: startY + row * (STICKY_HEIGHT + SPACING)
    });
  }

  return positions;
}

async function addSticky(responses: string[]) {
  if (!responses?.length) return;
  
  try {
    // Find or create the Antagonistic-Response frame
    const frame = await findOrCreateFrame('Antagonistic-Response');
    
    // Create AI Response tag
    let aiTagId: string;
    try {
      const items = await miro.board.get();
      const aiTag = items.find(item => 
        item.type === 'tag' && 
        'title' in item && 
        item.title === 'AI Response'
      ) as Tag | undefined;
      
      if (aiTag?.title === 'AI Response') {
        aiTagId = aiTag.id;
      } else {
        const newTag = await miro.board.createTag({
          title: 'AI Response',
          color: 'red',
        });
        aiTagId = newTag.id;
      }
    } catch (error) {
      console.error('Error handling tag:', error);
      aiTagId = '';
    }

    // Process all responses
    const allParts: string[] = [];
    responses.forEach(response => {
      allParts.push(...splitResponse(response));
    });

    // Get positions for all sticky notes
    const positions = await findEmptySpace(frame, allParts.length);

    // Create sticky notes
    for (let i = 0; i < allParts.length; i++) {
      const content = allParts[i];
      const isMultiPart = responses.length > 1;
      
      const stickyNote = await miro.board.createStickyNote({
        content: isMultiPart ? `Response ${Math.floor(i/2) + 1}:\n\n${content}` : content,
        style: {
          fillColor: AI_STICKY_COLOR,
          textAlign: 'left',
        },
        x: positions[i].x,
        y: positions[i].y,
        parentId: frame.id,
        ...(aiTagId ? { tagIds: [aiTagId] } : {})
      });
    }

    // Zoom to frame
    await miro.board.viewport.zoomTo(frame);
    
  } catch (error) {
    console.error('Error creating sticky notes:', error);
  }
}

export const SendtoBoard: FC<SendtoBoardProps> = ({ responses }) => {
  return (
    <div>
      <h3>SDK Usage Demo</h3>
      <p className="p-small">SDK doesnt need to be authenticated.</p>
      <p>
        Apps that use the SDK should run inside a Miro board. During
        development, you can open this app inside a{' '}
        <a href="https://developers.miro.com/docs/build-your-first-hello-world-app#step-2-try-out-your-app-in-miro">
          Miro board
        </a>
        .
      </p>
      <button
        type="button"
        onClick={() => addSticky(responses)}
        className="button button-primary"
        disabled={!responses?.length}
      >
        Add GPT Responses to Board
      </button>
    </div>
  );
};
