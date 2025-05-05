import { Frame } from '@mirohq/websdk-types';
import { UserAuthService } from './userAuthService';
import BoardTokenManager from '../../utils/boardTokenManager';
import { Logger } from '../../utils/logger';

// Log context constants for this service
const LOG_CONTEXT = 'MIRO-FRAME';
const FRAME_CONTENT_CONTEXT = 'FRAME-CONTENT';

/**
 * Service for handling Miro frame operations
 */
export class MiroFrameService {
  // Constants for remote frame positioning
  private static readonly REMOTE_OFFSET_X = 20000; // Far right
  private static readonly REMOTE_OFFSET_Y = 20000; // Far down

  /**
   * Initialize the service with a specific board token if needed
   */
  public static async initializeWithBoard(boardId: string, token: string): Promise<void> {
    BoardTokenManager.saveToken(boardId, token);
  }

  /**
   * Get the current board ID
   */
  public static async getCurrentBoardId(): Promise<string> {
    const board = await miro.board.getInfo();
    return board.id;
  }

  /**
   * Finds a frame by its title
   */
  public static async findFrameByTitle(title: string): Promise<Frame | undefined> {
    const frames = await miro.board.get({ type: 'frame' });
    return frames.find(f => f.title === title);
  }

  /**
   * Checks if an item is within a frame's bounds
   * @param item The Miro item to check
   * @param frame The frame to check against
   * @returns True if the item is within the frame's bounds
   */
  public static isItemInFrame(item: any, frame: Frame): boolean {
    // Calculate frame boundaries
    const frameLeft = frame.x - frame.width / 2;
    const frameRight = frame.x + frame.width / 2;
    const frameTop = frame.y - frame.height / 2;
    const frameBottom = frame.y + frame.height / 2;
    
    // Check if the item's center is within the frame's bounds
    return (
      item.x >= frameLeft &&
      item.x <= frameRight &&
      item.y >= frameTop &&
      item.y <= frameBottom
    );
  }

  /**
   * Gets all items of specified types within a frame using spatial bounds
   * @param frame The frame to get items for
   * @param types Array of item types to retrieve (e.g., ['text', 'shape', 'sticky_note'])
   * @returns Array of items that are within the frame's bounds
   */
  public static async getItemsWithinFrame<T = any>(
    frame: Frame,
    types: string[] = ['sticky_note', 'text', 'shape', 'connector']
  ): Promise<T[]> {
    try {
      Logger.log(LOG_CONTEXT, `Getting items of types [${types.join(', ')}] within frame: ${frame.title} (${frame.id})`);
      
      // Get all items of the specified types
      const allItems = await miro.board.get({ type: types });
      Logger.log(LOG_CONTEXT, `Found ${allItems.length} total items of requested types`);
      
      // Filter items that are within the frame's bounds
      const itemsInFrame = allItems.filter(item => this.isItemInFrame(item, frame));
      Logger.log(LOG_CONTEXT, `Found ${itemsInFrame.length} items within frame ${frame.title}`);
      
      return itemsInFrame as T[];
    } catch (error) {
      Logger.error(LOG_CONTEXT, `Error getting items within frame ${frame.title}:`, error);
      return [] as T[];
    }
  }

  /**
   * Gets sticky notes within a frame's boundaries
   */
  public static async getStickiesInFrame(frame: Frame): Promise<any[]> {
    Logger.log(LOG_CONTEXT, `Getting sticky notes in frame: ${frame.title} (${frame.id})`);
    
    // Get all sticky notes
    const allStickies = await miro.board.get({ type: 'sticky_note' });
    
    // Only use parentId to find stickies (most reliable when parentId is set)
    const stickyNotesByParentId = allStickies.filter(sticky => sticky.parentId === frame.id);
    Logger.log(LOG_CONTEXT, `Found ${stickyNotesByParentId.length} sticky notes by parentId in frame ${frame.title}`);
    
    // Return the stickies found by parentId, or empty array if none found
    return stickyNotesByParentId;
  }

  /**
   * Gets sticky notes within frame bounds by coordinates
   */
  public static async getItemsInFrameBounds(frame: Frame): Promise<any[]> {
    const frameBounds = {
      left: frame.x - frame.width / 2,
      right: frame.x + frame.width / 2,
      top: frame.y - frame.height / 2,
      bottom: frame.y + frame.height / 2
    };

    const allStickies = await miro.board.get({ type: 'sticky_note' });
    return allStickies.filter(sticky => 
      sticky.x >= frameBounds.left &&
      sticky.x <= frameBounds.right &&
      sticky.y >= frameBounds.top &&
      sticky.y <= frameBounds.bottom
    );
  }

  /**
   * Creates a new frame with the given title and dimensions
   */
  public static async createFrame(title: string, x: number, y: number, width: number, height: number): Promise<Frame> {
    return await miro.board.createFrame({
      title,
      x,
      y,
      width,
      height
    });
  }

  /**
   * Creates a remote frame far from the main working area and sets up access control
   * Returns both the frame and a function to navigate to it
   */
  public static async createRemoteFrame(
    title: string,
    width: number,
    height: number,
    authorizedEmails: string[]
  ): Promise<{ frame: Frame; navigateToFrame: () => Promise<void> }> {
    // Create frame in a remote location
    const frame = await this.createFrame(
      title,
      this.REMOTE_OFFSET_X,
      this.REMOTE_OFFSET_Y,
      width,
      height
    );

    // Set up access control
    await UserAuthService.setFrameAuthorization(frame.id, authorizedEmails);

    // Create navigation function
    const navigateToFrame = async () => {
      const isAuthorized = await UserAuthService.isAuthorizedForFrame(frame.id);
      if (isAuthorized) {
        await miro.board.viewport.zoomTo(frame);
      } else {
        await miro.board.notifications.showError('You do not have access to this frame');
      }
    };

    return { frame, navigateToFrame };
  }

  /**
   * Creates a navigation button that takes authorized users to a specific frame
   * @param frame The target frame to navigate to
   * @param buttonX X position for the navigation button
   * @param buttonY Y position for the navigation button
   */
  public static async createFrameNavigationButton(
    frame: Frame,
    buttonX: number,
    buttonY: number
  ): Promise<void> {
    // Check if current user is authorized
    const isAuthorized = await UserAuthService.isAuthorizedForFrame(frame.id);
    if (!isAuthorized) {
      Logger.log(LOG_CONTEXT, 'User not authorized to access this frame');
      return;
    }

    // Create a shape to act as a button
    const button = await miro.board.createShape({
      content: `🔍 Navigate to ${frame.title}`,
      x: buttonX,
      y: buttonY,
      width: 200,
      height: 40,
      style: {
        color: '#4262ff',
        fillColor: '#ffffff',
        borderColor: '#4262ff',
        borderWidth: 2,
        borderStyle: 'normal',
        borderOpacity: 1,
        textAlign: 'center',
        fontSize: 14
      }
    });

    // Add click handler to navigate
    await miro.board.ui.on('click', async (event) => {
      if (event.targetId === button.id) {
        const isStillAuthorized = await UserAuthService.isAuthorizedForFrame(frame.id);
        if (isStillAuthorized) {
          await miro.board.viewport.zoomTo(frame);
        } else {
          await miro.board.notifications.showError('You no longer have access to this frame');
          await miro.board.remove(button);
        }
      }
    });
  }

  /**
   * Returns to the main working area
   * @param mainFrameTitle Title of the main frame to return to
   */
  public static async returnToMainArea(mainFrameTitle: string = 'Main-Frame'): Promise<void> {
    const mainFrame = await this.findFrameByTitle(mainFrameTitle);
    if (mainFrame) {
      await miro.board.viewport.zoomTo(mainFrame);
    } else {
      // If no main frame found, reset to center of board
      const viewport = await miro.board.viewport.get();
      const mainArea = await miro.board.createShape({
        type: 'shape',
        x: 0,
        y: 0,
        width: viewport.width,
        height: viewport.height,
        style: {
          fillColor: 'transparent',
          borderColor: 'transparent'
        }
      });
      await miro.board.viewport.zoomTo(mainArea);
      await miro.board.remove(mainArea);
    }
  }

  /**
   * Creates navigation buttons for all frames the current user has access to
   * @param startX Starting X position for the button grid
   * @param startY Starting Y position for the button grid
   */
  public static async createAuthorizedNavigationButtons(startX: number, startY: number): Promise<void> {
    const authorizedFrameIds = await UserAuthService.getAuthorizedFrames();
    const frames = await miro.board.get({ type: 'frame' });
    
    const authorizedFrames = frames.filter(frame => authorizedFrameIds.includes(frame.id));
    const BUTTON_SPACING = 50;

    for (let i = 0; i < authorizedFrames.length; i++) {
      const buttonX = startX;
      const buttonY = startY + (i * BUTTON_SPACING);
      await this.createFrameNavigationButton(authorizedFrames[i], buttonX, buttonY);
    }
  }

  /**
   * Marks a frame as restricted to specific users (visual indicator only)
   * Note: This does not enforce actual access control, it only provides a visual cue
   */
  public static async markFrameAsRestricted(frame: Frame, userEmails: string[]) {
    try {
      // Create a text label to show restricted access
      const label = await miro.board.createText({
        content: `🔒 Restricted Access\nAuthorized Users: ${userEmails.join(', ')}`,
        x: frame.x - (frame.width / 2) + 10,
        y: frame.y - (frame.height / 2) + 10,
        width: 200,
        style: {
          color: '#D84727',
          fontSize: 10,
          textAlign: 'left'
        }
      });

      // Update frame appearance
      await miro.board.createFrame({
        id: frame.id,
        title: frame.title,
        x: frame.x,
        y: frame.y,
        width: frame.width,
        height: frame.height,
        style: {
          fillColor: '#FFF3F0'
        }
      });

      return true;
    } catch (error) {
      Logger.error(LOG_CONTEXT, 'Error marking frame as restricted:', error);
      return false;
    }
  }

  /**
   * Creates a new frame with restricted access indicators
   */
  public static async createRestrictedFrame(title: string, x: number, y: number, width: number, height: number, userEmails: string[]): Promise<Frame | null> {
    try {
      const frame = await this.createFrame(title, x, y, width, height);
      await this.markFrameAsRestricted(frame, userEmails);
      return frame;
    } catch (error) {
      Logger.error(LOG_CONTEXT, 'Error creating restricted frame:', error);
      return null;
    }
  }

  /**
   * Gets frame content including sticky notes and connectors between them
   * @param frame The frame to get content for
   * @returns Object containing sticky notes and connections
   */
  public static async getFrameContentWithConnections(frame: Frame): Promise<{
    stickies: any[],
    connections: {from: string, to: string}[]
  }> {
    try {
      Logger.log(FRAME_CONTENT_CONTEXT, `Getting content with connections for frame: ${frame.title} (${frame.id})`);
      
      // Array to store all items with content (sticky notes and shapes)
      let itemsWithContent: any[] = [];
      
      // Get all sticky notes
      const allStickies = await miro.board.get({ type: 'sticky_note' });
      Logger.log(FRAME_CONTENT_CONTEXT, `Found ${allStickies.length} total sticky notes on the board`);
      
      // Important: Only use parentId to find stickies in the frame
      const stickiesInFrame = allStickies.filter(sticky => sticky.parentId === frame.id);
      Logger.log(FRAME_CONTENT_CONTEXT, `Found ${stickiesInFrame.length} sticky notes with parentId=${frame.id} in frame ${frame.title}`);
      
      // Add sticky notes to the items array
      itemsWithContent = [...stickiesInFrame];
      
      // Get all shapes that might have text content
      const allShapes = await miro.board.get({ type: 'shape' });
      Logger.log(FRAME_CONTENT_CONTEXT, `Found ${allShapes.length} total shapes on the board`);
      
      // Filter shapes in the frame by parentId
      const shapesInFrame = allShapes.filter(shape => 
        shape.parentId === frame.id && 
        shape.content && 
        shape.content.trim() !== ''
      );
      Logger.log(FRAME_CONTENT_CONTEXT, `Found ${shapesInFrame.length} shapes with content and parentId=${frame.id} in frame ${frame.title}`);
      
      // Add shapes to the items array
      itemsWithContent = [...itemsWithContent, ...shapesInFrame];
      
      // Log summary of all content items found
      Logger.log(FRAME_CONTENT_CONTEXT, `Total content items (stickies + shapes) in frame: ${itemsWithContent.length}`);
      
      // Create a set of item IDs for checking connections
      const itemIds = new Set(itemsWithContent.map(item => item.id));
      
      // Get all connectors on the board
      const connectors = await miro.board.get({ type: 'connector' });
      Logger.log(FRAME_CONTENT_CONTEXT, `Found ${connectors.length} total connectors on the board`);
      
      // Filter connectors that connect items in this frame
      const frameConnections: {from: string, to: string}[] = [];
      
      for (const connector of connectors) {
        // Skip if it doesn't have start and end items
        if (!connector.start?.item || !connector.end?.item) continue;
        
        const startItemId = connector.start.item;
        const endItemId = connector.end.item;
        
        // Only include connections where both items are in this frame
        if (itemIds.has(startItemId) && itemIds.has(endItemId)) {
          // Get the content of connected items
          const startItem = itemsWithContent.find(item => item.id === startItemId);
          const endItem = itemsWithContent.find(item => item.id === endItemId);
          
          if (startItem && endItem) {
            frameConnections.push({
              from: startItem.content.replace(/<\/?p>/g, '').trim(),
              to: endItem.content.replace(/<\/?p>/g, '').trim()
            });
          }
        }
      }
      
      Logger.log(FRAME_CONTENT_CONTEXT, `Found ${frameConnections.length} connections between items in frame ${frame.title}`);
      
      return { 
        stickies: itemsWithContent, 
        connections: frameConnections 
      };
    } catch (error) {
      Logger.error(FRAME_CONTENT_CONTEXT, `Error getting content with connections for frame ${frame.title}:`, error);
      return { stickies: [], connections: [] };
    }
  }
} 