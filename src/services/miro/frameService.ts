import { Frame } from '@mirohq/websdk-types';
import { UserAuthService } from './userAuthService';

/**
 * Service for handling Miro frame operations
 */
export class MiroFrameService {
  // Constants for remote frame positioning
  private static readonly REMOTE_OFFSET_X = 20000; // Far right
  private static readonly REMOTE_OFFSET_Y = 20000; // Far down

  /**
   * Finds a frame by its title
   */
  public static async findFrameByTitle(title: string): Promise<Frame | undefined> {
    const frames = await miro.board.get({ type: 'frame' });
    return frames.find(f => f.title === title);
  }

  /**
   * Gets sticky notes within a frame's boundaries
   */
  public static async getStickiesInFrame(frame: Frame): Promise<any[]> {
    const allStickies = await miro.board.get({ type: 'sticky_note' });
    return allStickies.filter(sticky => sticky.parentId === frame.id);
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
      console.log('User not authorized to access this frame');
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
      console.error('Error marking frame as restricted:', error);
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
      console.error('Error creating restricted frame:', error);
      return null;
    }
  }
} 