import { Frame } from '@mirohq/websdk-types';

/**
 * Service for handling Miro frame operations
 */
export class MiroFrameService {
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
} 