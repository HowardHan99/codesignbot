import { MiroFrameService } from './frameService';
import { StickyNote, Connector, Frame } from '@mirohq/websdk-types';
import BoardTokenManager from '../../utils/boardTokenManager';
import { MiroApiClient } from './miroApiClient';
import { frameConfig } from '../../utils/config';
import { Logger } from '../../utils/logger';

// Log context for this service
const LOG_CONTEXT = 'MIRO-DESIGN';
const CHALLENGE_CONTEXT = 'DESIGN-CHALLENGE';

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
      const challengeFrame = await MiroFrameService.findFrameByTitle(frameConfig.names.designChallenge);
      
      if (!challengeFrame) {
        Logger.log(CHALLENGE_CONTEXT, `${frameConfig.names.designChallenge} frame not found`);
        return '';
      }

      // First, try to find sticky notes in the frame
      const challengeStickies = await MiroFrameService.getStickiesInFrame(challengeFrame);
      
      // If we found sticky notes, use their content
      if (challengeStickies.length > 0) {
        const challengeFromStickies = challengeStickies.map(sticky => sticky.content).join('\n');
        Logger.log(CHALLENGE_CONTEXT, `Found design challenge from sticky notes: ${challengeFromStickies.substring(0, 100)}${challengeFromStickies.length > 100 ? '...' : ''}`);
        return challengeFromStickies;
      }
      
      // If no sticky notes found, check for shapes with text content
      Logger.log(CHALLENGE_CONTEXT, `No sticky notes found in ${frameConfig.names.designChallenge} frame, checking shapes...`);
      
      // Get all shapes on the board
      const allShapes = await miro.board.get({ type: 'shape' });
      
      // Filter shapes that belong to the challenge frame and have content
      const challengeShapes = allShapes.filter(shape => 
        shape.parentId === challengeFrame.id && 
        shape.content && 
        shape.content.trim() !== ''
      );
      
      if (challengeShapes.length > 0) {
        const challengeFromShapes = challengeShapes.map(shape => shape.content).join('\n');
        Logger.log(CHALLENGE_CONTEXT, `Found design challenge from shapes: ${challengeFromShapes.substring(0, 100)}${challengeFromShapes.length > 100 ? '...' : ''}`);
        return challengeFromShapes;
      }
      
      Logger.log(CHALLENGE_CONTEXT, `No shapes with content found in ${frameConfig.names.designChallenge} frame`);
      return '';

    } catch (err) {
      Logger.error(CHALLENGE_CONTEXT, 'Error getting design challenge:', err);
      return '';
    }
  }

  /**
   * Retrieves consensus points from the Consensus frame
   */
  public static async getConsensusPoints(): Promise<string[]> {
    try {
      Logger.log(LOG_CONTEXT, 'Starting to fetch consensus points...');
      const consensusFrame = await MiroFrameService.findFrameByTitle(frameConfig.names.consensus);
      
      if (!consensusFrame) {
        Logger.log(LOG_CONTEXT, `${frameConfig.names.consensus} frame not found`);
        return [];
      }
      Logger.log(LOG_CONTEXT, `Found ${frameConfig.names.consensus} frame:`, consensusFrame);

      // Get all sticky notes on the board
      const allStickies = await miro.board.get({ type: 'sticky_note' });
      Logger.log(LOG_CONTEXT, 'All sticky notes on board:', allStickies.map(s => ({ id: s.id, content: s.content, parentId: s.parentId })));

      // Filter stickies by parentId ONLY
      const consensusStickies = allStickies.filter(sticky => sticky.parentId === consensusFrame.id);
      Logger.log(LOG_CONTEXT, 'Filtered consensus stickies by parentId ONLY:', consensusStickies.map(s => ({ id: s.id, content: s.content, parentId: s.parentId })));
      
      // --- Removed logic for getItemsInFrameBounds and combining --- 
      // const stickiesByCoordsRaw = await MiroFrameService.getItemsInFrameBounds(consensusFrame); 
      // const stickiesByCoords = stickiesByCoordsRaw.filter(item => item.type === 'sticky_note' && typeof (item as any).content === 'string') as StickyNote[];
      // Logger.log(LOG_CONTEXT, 'Stickies found by coordinates:', stickiesByCoords.map(s => ({ id: s.id, content: s.content, parentId: s.parentId })));
      
      // const combinedStickiesMap = new Map<string, StickyNote>();
      // consensusStickies.forEach(sticky => combinedStickiesMap.set(sticky.id, sticky));
      // stickiesByCoords.forEach(sticky => combinedStickiesMap.set(sticky.id, sticky));
      // const combinedStickies = Array.from(combinedStickiesMap.values());
      // Logger.log(LOG_CONTEXT, 'Combined unique stickies:', combinedStickies.map(s => ({ id: s.id, content: s.content, parentId: s.parentId })));
      
      if (consensusStickies.length === 0) {
        Logger.log(LOG_CONTEXT, `No sticky notes found in ${frameConfig.names.consensus} frame (using parentId only)`);
        return [];
      }

      // Return array of consensus points from stickies found by parentId
      const points = consensusStickies.map(sticky => sticky.content || ''); // Ensure content is a string
      Logger.log(LOG_CONTEXT, 'Extracted consensus points (parentId only):', points);
      return points;

    } catch (err) {
      Logger.error(LOG_CONTEXT, 'Error getting consensus points:', err);
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
      const responseFrame = frames.find(frame => frame.title === frameConfig.names.antagonisticResponse);

      if (!responseFrame) {
        Logger.log(LOG_CONTEXT, `No ${frameConfig.names.antagonisticResponse} frame found`);
        return;
      }

      // Get all sticky notes and filter by parentId
      const allStickies = await miro.board.get({ type: 'sticky_note' });
      const frameStickies = allStickies.filter(sticky => sticky.parentId === responseFrame.id);
      
      // Delete all sticky notes in the frame
      Logger.log(LOG_CONTEXT, `Removing ${frameStickies.length} sticky notes from ${frameConfig.names.antagonisticResponse} frame`);
      
      // Delete items using Miro API
      if (frameStickies.length > 0) {
        await MiroApiClient.deleteItemsInFrame(responseFrame.id, ['sticky_note']);
        Logger.log(LOG_CONTEXT, `Successfully removed ${frameStickies.length} sticky notes`);
      }
      
    } catch (error) {
      Logger.error(LOG_CONTEXT, 'Error in cleanAnalysisBoard:', error);
    }
  }

  /**
   * Sends synthesized points to the Miro board as a formatted text box
   */
  public static async sendSynthesizedPointsToBoard(points: string[]): Promise<void> {
    if (!points.length) return;

    try {
      // Find or create the Antagonistic-Response frame
      let responseFrame = await MiroFrameService.findFrameByTitle(frameConfig.names.antagonisticResponse);
      
      if (!responseFrame) {
        responseFrame = await MiroFrameService.createFrame(
          frameConfig.names.antagonisticResponse,
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
      Logger.error(LOG_CONTEXT, 'Error sending synthesized points to board:', error);
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
          
          Logger.log(LOG_CONTEXT, 'New connection created:', {
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

      Logger.log(LOG_CONTEXT, 'Sticky note connection monitoring initialized');
    } catch (error) {
      Logger.error(LOG_CONTEXT, 'Error setting up connection monitoring:', error);
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
      Logger.error(LOG_CONTEXT, 'Error getting sticky connections:', error);
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
      Logger.log(LOG_CONTEXT, 'Starting to analyze design decisions and connections...');
      
      // Get the Design-Proposal frame
      const designFrame = await MiroFrameService.findFrameByTitle(frameConfig.names.designProposal);
      
      if (!designFrame) {
        Logger.log(LOG_CONTEXT, `${frameConfig.names.designProposal} frame not found`);
        return [];
      }
      Logger.log(LOG_CONTEXT, `Found ${frameConfig.names.designProposal} frame:`, designFrame.id);
 
      // Get stickies in the Design-Proposal frame
      const designStickies = await MiroFrameService.getStickiesInFrame(designFrame);
      Logger.log(LOG_CONTEXT, `Found stickies in ${frameConfig.names.designProposal} frame:`, designStickies.length);
      
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
      Logger.log(LOG_CONTEXT, 'Found connectors:', connectors.length);

      // Batch fetch items instead of individual API calls
      const itemIds = new Set<string>();
      for (const connector of connectors) {
        itemIds.add(connector.startItem.id);
        itemIds.add(connector.endItem.id);
      }
      
      // Filter IDs to only fetch those we don't already have
      const idsToFetch = Array.from(itemIds).filter(id => !stickiesMap.has(id));
      Logger.log(LOG_CONTEXT, `Need to fetch ${idsToFetch.length} additional items for connections`);
      
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

      Logger.log(LOG_CONTEXT, `Found ${designConnections.length} connections involving ${frameConfig.names.designProposal} stickies`);
      
      // Return with section name and connections
      sections.push({
        section: 'Design Decisions',
        connections: designConnections
      });

      return sections;
    } catch (error) {
      Logger.error(LOG_CONTEXT, 'Error analyzing design decisions:', error);
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
      Logger.error(LOG_CONTEXT, 'No access token found for board:', boardId);
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
        Logger.error(LOG_CONTEXT, 'Error fetching connectors:', error);
        break;
      }
    } while (cursor);

    return allConnectors;
  }
} 