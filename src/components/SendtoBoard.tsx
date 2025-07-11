'use client';
import { FC } from 'react';
import { StickyNoteService } from '../services/miro/stickyNoteService';
import { ProcessedDesignPoint } from '../types/common';
import { MiroApiClient } from '../services/miro/miroApiClient';
import { DesignThemeService } from '../services/designThemeService';
import { frameConfig } from '../utils/config';

/**
 * Interface for themed responses
 */
interface ThemedResponse {
  name: string;
  color: string;
  points: string[];
}

interface SendtoBoardProps {
  responses: string[];
  themedResponses?: ThemedResponse[];
  useThemedDisplay?: boolean;
}

const FRAME_TITLE = frameConfig.names.antagonisticResponse;

export const SendtoBoard: FC<SendtoBoardProps> = ({ 
  responses, 
  themedResponses = [],
  useThemedDisplay = false
}) => {
  const addSticky = async () => {
    // For themed display, use themed responses, otherwise use regular responses
    if (useThemedDisplay && themedResponses.length) {
      try {
        // Get or create the frame
        const frame = await StickyNoteService.ensureFrameExists(FRAME_TITLE);
        
        if (!frame) {
          console.error(`Failed to get or create frame: ${FRAME_TITLE}`);
          return;
        }
        
        // Get theme positions from DesignThemeService
        const themePositions = DesignThemeService.getThemePositions();
        
        // For each theme, place sticky notes in the correct position
        for (const theme of themedResponses) {
          if (!theme.points.length) continue;
          
          // Get the position for this theme, or calculate it if not found
          let position;
          if (themePositions.has(theme.name)) {
            position = themePositions.get(theme.name);
            console.log(`Found saved position for "${theme.name}": x=${position?.x}, y=${position?.y}`);
          } else {
            // If position not found, we need to calculate it
            // First find all existing themes to get the theme index
            const allThemes = await DesignThemeService.generateDesignThemes();
            const themeIndex = allThemes.findIndex(t => t.name === theme.name);
            
            // If theme found, calculate position
            if (themeIndex >= 0) {
              position = {
                x: 0, y: 0, themeIndex
              };
              const calculatedPos = DesignThemeService.calculateStickyNotePosition(frame, themeIndex);
              position.x = calculatedPos.x;
              position.y = calculatedPos.y;
              console.log(`Calculated position for "${theme.name}": x=${position.x}, y=${position.y}`);
            } else {
              console.error(`Theme "${theme.name}" not found in design themes. Using default positioning.`);
            }
          }
          
          // If we have a position (saved or calculated), use DesignThemeService to place stickies
          if (position) {
            console.log(`Placing ${theme.points.length} points under theme "${theme.name}"`);
            await DesignThemeService.placeStickyNotesUnderTheme(theme.name, theme.points);
          } else {
            // Fallback to default positioning - place points in a row beneath a header
            console.log(`Using fallback positioning for theme "${theme.name}"`);
            
            // Get theme color
            const colorMap: Record<string, string> = {
              'light_green': '#C3E5B5',
              'light_blue': '#BFE3F2',
              'light_yellow': '#F5F7B5',
              'light_pink': '#F5C3C2',
              'violet': '#D5C8E8',
              'light_gray': '#E5E5E5'
            };
            const themeColor = colorMap[theme.color] || '#E5E5E5';
            
            // Find row based on theme index (0-3)
            const allThemes = await DesignThemeService.generateDesignThemes();
            const themeIndex = Math.max(
              allThemes.findIndex(t => t.name === theme.name),
              themedResponses.findIndex(t => t.name === theme.name)
            );
            const row = themeIndex % 4;
            
            // Calculate position for header
            const rowHeight = frame.height / 4;
            const rowTopEdge = frame.y - frame.height/2 + (row * rowHeight);
            const headerY = rowTopEdge + (rowHeight * 0.05); // 5% down from top of row
            
            // Create a theme header
            const headerX = frame.x;
            const headerSticky = await MiroApiClient.createStickyNote({
              content: `Theme: ${theme.name} (${theme.points.length} points)`,
              x: headerX,
              y: headerY,
              width: 300,
              style: {
                fillColor: themeColor,
                textAlign: 'center',
                fontFamily: 'opensans',
                textAlignVertical: 'middle'
              }
            });
            
            // =========================================================================
            // NEW: Properly add header sticky note to frame as child
            // =========================================================================
            if (headerSticky) {
              try {
                await frame.add(headerSticky);
                console.log(`Added theme header "${theme.name}" to frame as child`);
              } catch (addError) {
                console.warn(`Failed to add theme header to frame as child: ${addError}`);
              }
            }
            
            // Position points in a row beneath the header
            const pointsY = rowTopEdge + (rowHeight * 0.6); // 60% down in the row
            const pointWidth = 200;
            const spacing = 20;
            const totalWidth = theme.points.length * (pointWidth + spacing) - spacing;
            let pointX = frame.x - (totalWidth / 2) + (pointWidth / 2); // Start from left, centered
            
            // Create each point sticky note in a row
            for (const point of theme.points) {
              const pointSticky = await MiroApiClient.createStickyNote({
                content: point,
                x: pointX,
                y: pointsY,
                width: pointWidth,
                style: {
                  fillColor: themeColor + '99', // Add transparency to differentiate from header
                  textAlignVertical: 'top'
                }
              });
              
              // =========================================================================
              // NEW: Properly add point sticky note to frame as child
              // =========================================================================
              if (pointSticky) {
                try {
                  await frame.add(pointSticky);
                  console.log(`Added theme point sticky to frame as child`);
                } catch (addError) {
                  console.warn(`Failed to add theme point sticky to frame as child: ${addError}`);
                }
              }
              
              // Move to next position
              pointX += pointWidth + spacing;
            }
          }
        }
        
        // Zoom to the frame
        await miro.board.viewport.zoomTo(frame);
        
        // Calculate total points
        const totalPoints = themedResponses.reduce((sum, theme) => sum + theme.points.length, 0);
        console.log(`Added ${totalPoints} themed responses to board`);
      } catch (error) {
        console.error('Error creating themed sticky notes:', error);
      }
    } else if (responses?.length) {
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
    } else {
      console.log('No responses to add');
    }
  };

  // Calculate the total number of responses to show in the button
  const responseCount = useThemedDisplay && themedResponses.length
    ? themedResponses.reduce((sum, theme) => sum + theme.points.length, 0)
    : responses?.length || 0;

  return (
    <button
      type="button"
      onClick={addSticky}
      className="button button-primary"
      disabled={responseCount === 0}
    >
      Send to Board ({responseCount} responses)
    </button>
  );
};
