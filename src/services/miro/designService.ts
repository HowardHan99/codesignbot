import { MiroFrameService } from './frameService';
import { StickyNote, Connector, Frame } from '@mirohq/websdk-types';
import BoardTokenManager from '../../utils/boardTokenManager';
import { MiroApiClient } from './miroApiClient';

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
   * Cleans the Antagonistic-Response frame by removing all sticky notes
   */
  public static async cleanAnalysisBoard(): Promise<void> {
    try {
      // Get frames first to check if they exist
      const frames = await miro.board.get({ type: 'frame' });
      const responseFrame = frames.find(frame => frame.title === 'Antagonistic-Response');

      if (!responseFrame) {
        console.log('No Antagonistic-Response frame found');
        return;
      }

      // Get all sticky notes and filter by parentId
      const allStickies = await miro.board.get({ type: 'sticky_note' });
      const frameStickies = allStickies.filter(sticky => sticky.parentId === responseFrame.id);
      
      // Delete all sticky notes in the frame
      console.log(`Removing ${frameStickies.length} sticky notes from Antagonistic-Response frame`);
      
      // Delete items using Miro API
      if (frameStickies.length > 0) {
        await MiroApiClient.deleteItemsInFrame(responseFrame.id, ['sticky_note']);
        console.log(`Successfully removed ${frameStickies.length} sticky notes`);
      }
      
    } catch (error) {
      console.error('Error in cleanAnalysisBoard:', error);
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
        
        // Make sure the connector has the expected structure
        // This matches the SDK structure, not our MiroConnector interface
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
        // Check if it's a SDK Connector or our custom MiroConnector
        if ('start' in connector && 'end' in connector) {
          // It's a SDK Connector
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
    const sections: Array<{section: string, connections: Array<{from: string, to: string}>}> = [];
    const boardId = (await miro.board.getInfo()).id;
    
    try {
      console.log('Starting to analyze design decisions and connections...');
      
      // Get the Design-Proposal frame
      const designFrame = await MiroFrameService.findFrameByTitle('Design-Proposal');
      
      if (!designFrame) {
        console.log('Design-Proposal frame not found');
        return [];
      }
      console.log('Found Design-Proposal frame:', designFrame.id);
 
      // Get stickies in the Design-Proposal frame
      const designStickies = await MiroFrameService.getStickiesInFrame(designFrame);
      console.log('Found stickies in Design-Proposal frame:', designStickies.length);
      
      // Create a map of stickies by ID for quick lookup
      const stickiesMap = new Map<string, StickyNote>();
      designStickies.forEach(sticky => stickiesMap.set(sticky.id, sticky));
      
      // Create a set of sticky IDs for quick lookups
      const designStickyIds = new Set(designStickies.map(sticky => sticky.id));

      // Helper function to clean HTML tags
      const cleanContent = (content: string) => {
        return content
          .replace(/<\/?p>/g, '') // Remove <p> tags
          .replace(/<[^>]+>/g, '') // Remove any other HTML tags
          .trim();
      };

      // Get all connectors on the board using direct API for better performance
      const connectors = await this.getAllConnectors(boardId);
      console.log('Found connectors:', connectors.length);

      // Batch fetch items instead of individual API calls
      const itemIds = new Set<string>();
      for (const connector of connectors) {
        itemIds.add(connector.startItem.id);
        itemIds.add(connector.endItem.id);
      }
      
      // Filter IDs to only fetch those we don't already have
      const idsToFetch = Array.from(itemIds).filter(id => !stickiesMap.has(id));
      console.log(`Need to fetch ${idsToFetch.length} additional items for connections`);
      
      // Batch fetch items in groups of 25 to avoid API limits
      const BATCH_SIZE = 25;
      const additionalItems = new Map<string, any>();
      
      for (let i = 0; i < idsToFetch.length; i += BATCH_SIZE) {
        const batch = idsToFetch.slice(i, i + BATCH_SIZE);
        const fetchedItems = await Promise.all(batch.map(id => miro.board.getById(id)));
        
        fetchedItems.forEach((item, index) => {
          additionalItems.set(batch[index], item);
        });
        
        // Add a small delay between batches
        if (i + BATCH_SIZE < idsToFetch.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      // Filter connections that involve stickies in the Design-Proposal frame
      const designConnections: Array<{from: string, to: string}> = [];
      
      for (const connector of connectors) {
        const startItemId = connector.startItem.id;
        const endItemId = connector.endItem.id;
        
        // Get the items - either from our original stickies map or the additional fetched items
        const startItem = stickiesMap.get(startItemId) || additionalItems.get(startItemId);
        const endItem = stickiesMap.get(endItemId) || additionalItems.get(endItemId);
        
        if (!startItem || !endItem) continue;
        
        // Skip if neither item is in our Design-Proposal frame
        if (!designStickyIds.has(startItemId) && !designStickyIds.has(endItemId)) {
          continue;
        }
        
        // Only add connections if both items are sticky notes
        if (startItem.type === 'sticky_note' && endItem.type === 'sticky_note') {
          designConnections.push({
            from: cleanContent(startItem.content),
            to: cleanContent(endItem.content)
          });
        }
      }

      console.log(`Found ${designConnections.length} connections involving Design-Proposal stickies`);
      
      // Return with section name and connections
      sections.push({
        section: 'Design Decisions',
        connections: designConnections
      });

      return sections;
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