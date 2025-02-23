import { MiroFrameService } from './frameService';
import { StickyNote, Connector, Frame } from '@mirohq/websdk-types';
import BoardTokenManager from '../../utils/boardTokenManager';

const MIRO_API_URL = 'https://api.miro.com/v2';

interface MiroConnector {
  id: string;
  startItem: {
    id: string;
  };
  endItem: {
    id: string;
  };
}

interface MiroConnectorResponse {
  data: MiroConnector[];
  cursor?: string;
}

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

  /**
   * Monitors and records connections between sticky notes
   */
  public static async monitorStickyConnections(): Promise<void> {
    try {
      // Subscribe to connector creation events
      await miro.board.ui.on('connector:created', async (event) => {
        const connector = event.connector;
        
        if (!connector.start?.item || !connector.end?.item) return;
        
        // Get the connected items
        const startItem = await miro.board.getById(connector.start.item);
        const endItem = await miro.board.getById(connector.end.item);
        
        // Check if both items are sticky notes
        if (startItem.type === 'sticky_note' && endItem.type === 'sticky_note') {
          const startSticky = startItem as StickyNote;
          const endSticky = endItem as StickyNote;
          
          console.log('New connection created:', {
            from: startSticky.content,
            to: endSticky.content
          });
          
          // Create a text label for the connection
          await miro.board.createText({
            content: `${startSticky.content} links to ${endSticky.content}`,
            x: (startSticky.x + endSticky.x) / 2,
            y: (startSticky.y + endSticky.y) / 2 - 50,
            width: 200,
            style: {
              textAlign: 'center',
              fontSize: 10,
              color: '#4262ff'
            }
          });
        }
      });

      console.log('Sticky note connection monitoring initialized');
    } catch (error) {
      console.error('Error setting up connection monitoring:', error);
    }
  }

  /**
   * Gets all connections between sticky notes on the board
   */
  public static async getStickyConnections(): Promise<Array<{from: string, to: string}>> {
    try {
      // Get all connectors on the board
      const connectors = await miro.board.get({ type: 'connector' }) as Connector[];
      const connections: Array<{from: string, to: string}> = [];

      // Process each connector
      for (const connector of connectors) {
        if (!connector.start?.item || !connector.end?.item) continue;
        
        const startItem = await miro.board.getById(connector.start.item);
        const endItem = await miro.board.getById(connector.end.item);

        if (startItem.type === 'sticky_note' && endItem.type === 'sticky_note') {
          const startSticky = startItem as StickyNote;
          const endSticky = endItem as StickyNote;
          
          connections.push({
            from: startSticky.content,
            to: endSticky.content
          });
        }
      }

      return connections;
    } catch (error) {
      console.error('Error getting sticky connections:', error);
      return [];
    }
  }

  /**
   * Analyzes design decisions based on sticky note connections
   */
  public static async analyzeDesignDecisions(): Promise<Array<{section: string, connections: Array<{from: string, to: string}>}>> {
    try {
      // Get all connectors using the Miro SDK
      const connectors = await miro.board.get({ type: 'connector' }) as Connector[];
      console.log('Found connectors:', connectors.length);

      // Get all sticky notes on the board
      const allStickies = await miro.board.get({ type: 'sticky_note' }) as StickyNote[];
      console.log('Found sticky notes:', allStickies.length);
      
      const stickiesMap = new Map<string, StickyNote>();
      allStickies.forEach(sticky => stickiesMap.set(sticky.id, sticky));

      // Get the Design-Decision frame
      const designFrame = await MiroFrameService.findFrameByTitle('Design-Decision');
      if (!designFrame) {
        console.log('Design-Decision frame not found');
        return [];
      }
      console.log('Found Design-Decision frame:', designFrame.id);

      // Get stickies in the Design-Decision frame
      const designStickies = await MiroFrameService.getStickiesInFrame(designFrame);
      console.log('Found stickies in Design-Decision frame:', designStickies.length);
      
      const designStickyIds = new Set(designStickies.map(sticky => sticky.id));

      // Helper function to clean HTML tags
      const cleanContent = (content: string) => {
        return content
          .replace(/<\/?p>/g, '') // Remove <p> tags
          .replace(/<[^>]+>/g, '') // Remove any other HTML tags
          .trim();
      };

      // Filter connections that involve stickies in the Design-Decision frame
      const designConnections: Array<{from: string, to: string}> = [];
      
      for (const connector of connectors) {
        if (!connector.start?.item || !connector.end?.item) continue;
        
        const startItem = await miro.board.getById(connector.start.item);
        const endItem = await miro.board.getById(connector.end.item);
        
        if (startItem.type === 'sticky_note' && endItem.type === 'sticky_note') {
          const startSticky = startItem as StickyNote;
          const endSticky = endItem as StickyNote;
          
          // Check if either sticky is in the Design-Decision frame
          if (designStickyIds.has(startSticky.id) || designStickyIds.has(endSticky.id)) {
            designConnections.push({
              from: cleanContent(startSticky.content),
              to: cleanContent(endSticky.content)
            });
          }
        }
      }

      console.log('Design connections:', {
        total: designConnections.length,
        connections: designConnections.map(conn => ({
          from: conn.from,
          to: conn.to
        }))
      });
      
      return [{
        section: 'Design Decisions',
        connections: designConnections
      }];

    } catch (error) {
      console.error('Error analyzing design decisions:', error);
      return [];
    }
  }

  /**
   * Gets all connectors from a board using cursor-based pagination
   */
  private static async getAllConnectors(boardId: string): Promise<MiroConnector[]> {
    const allConnectors: MiroConnector[] = [];
    let cursor: string | undefined;
    
    // Get access token from BoardTokenManager
    const token = BoardTokenManager.getToken(boardId);
    if (!token) {
      console.error('No access token found for board:', boardId);
      return [];
    }
    
    do {
      try {
        // Construct URL with cursor if available
        let url = `${MIRO_API_URL}/boards/${boardId}/connectors?limit=50`;
        if (cursor) {
          url += `&cursor=${cursor}`;
        }

        // Make API request
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to get connectors: ${response.status}`);
        }

        const data: MiroConnectorResponse = await response.json();
        allConnectors.push(...data.data);
        cursor = data.cursor;

      } catch (error) {
        console.error('Error fetching connectors:', error);
        break;
      }
    } while (cursor);

    return allConnectors;
  }
} 