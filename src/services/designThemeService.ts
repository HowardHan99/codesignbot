import { ConfigurationService } from './configurationService';
import { MiroFrameService } from './miro/frameService';
import { MiroService } from './miroService';
import { MiroApiClient } from './miro/miroApiClient';
import { ProcessedDesignPoint } from '../types/common';
import { safeApiCall } from '../utils/errorHandlingUtils';
import { Frame, StickyNote } from '@mirohq/websdk-types';

/**
 * Theme or group identified from design content
 */
interface DesignTheme {
  name: string;           // Theme name
  description: string;    // Theme description
  relatedPoints: string[]; // Related design points
  color: string;          // Color for visualization
}

/**
 * Service for generating and visualizing design themes from content
 */
export class DesignThemeService {
  private static readonly THEME_FRAME_NAME = 'Design-Themes';
  private static readonly THEME_COLORS = [
    'light_green', 'light_blue', 'light_yellow', 
    'light_pink', 'violet', 'light_gray'
  ] as const;
  private static isProcessing: boolean = false;

  /**
   * Generate themes from design proposals and thinking dialogue
   */
  public static async generateDesignThemes(): Promise<DesignTheme[]> {
    if (this.isProcessing) {
      throw new Error('Theme generation is already in progress');
    }

    try {
      this.isProcessing = true;

      // Get design proposals and thinking dialogue
      const designProposals = await this.getDesignProposals();
      const thinkingDialogue = await this.getThinkingDialogue();

      if (designProposals.length === 0 && thinkingDialogue.length === 0) {
        throw new Error('No design content found to generate themes from');
      }

      // Use OpenAI to analyze and generate themes
      const themes = await this.analyzeContentForThemes(designProposals, thinkingDialogue);
      return themes;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get design proposals from the Design-Proposal frame
   */
  private static async getDesignProposals(): Promise<string[]> {
    const frameName = 'Design-Proposal';
    const proposals = await this.getStickiesFromFrame(frameName);
    console.log(`Found ${proposals.length} design proposals`);
    return proposals;
  }

  /**
   * Get thinking dialogue from the Thinking-Dialogue frame
   */
  private static async getThinkingDialogue(): Promise<string[]> {
    const frameName = 'Thinking-Dialogue';
    const dialogue = await this.getStickiesFromFrame(frameName);
    console.log(`Found ${dialogue.length} thinking dialogue notes`);
    return dialogue;
  }

  /**
   * Get sticky note content from a frame
   */
  private static async getStickiesFromFrame(frameName: string): Promise<string[]> {
    try {
      const frame = await MiroFrameService.findFrameByTitle(frameName);
      if (!frame) {
        console.log(`${frameName} frame not found`);
        return [];
      }

      const stickies = await MiroApiClient.getStickiesInFrame(frame.id);
      return stickies.map(sticky => sticky.content || '');
    } catch (error) {
      console.error(`Error getting stickies from ${frameName}:`, error);
      return [];
    }
  }

  /**
   * Analyze design content and identify themes using OpenAI
   */
  private static async analyzeContentForThemes(
    designProposals: string[],
    thinkingDialogue: string[]
  ): Promise<DesignTheme[]> {
    try {
      const systemPrompt = `You are a design expert specializing in identifying themes, patterns, and groupings in design content.
      
Your task is to analyze design proposals and dialogue to identify 4-6 key themes or groups. These might include:
- Functional groups (features with similar purposes)
- Design priorities (visual elements, UX flow concerns, etc.)
- User-centered categories (addressing specific user needs)
- Technical implementation themes

For each theme, provide:
1. A short, descriptive name (1-3 words)
2. A concise description explaining what unifies content in this theme (1-2 sentences)
3. References to the specific design points that belong in this theme (use exact quotes or clear references)

Format your response as a JSON array:
[
  {
    "name": "Theme name",
    "description": "Theme description",
    "relatedPoints": ["Point 1", "Point 2", "Point 3"]
  },
  // more themes...
]`;

      const userPrompt = `Design Proposals:\n${designProposals.map(p => `- ${p}`).join('\n')}\n\nThinking Dialogue:\n${thinkingDialogue.map(d => `- ${d}`).join('\n')}`;

      // Call OpenAI API
      const response = await fetch('/api/openaiwrap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          systemPrompt,
          userPrompt,
          useGpt4: true
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to analyze content');
      }

      const result = await response.json();

      // Parse the JSON response
      let themes: DesignTheme[] = [];
      try {
        const parsed = JSON.parse(result.response);
        themes = parsed.map((theme: any, index: number) => ({
          ...theme,
          color: this.THEME_COLORS[index % this.THEME_COLORS.length]
        }));
      } catch (error) {
        console.error('Error parsing themes:', error);
        throw new Error('Failed to parse theme analysis');
      }

      return themes;
    } catch (error) {
      console.error('Error analyzing content for themes:', error);
      throw error;
    }
  }

  /**
   * Visualize themes on the Miro board
   */
  public static async visualizeThemes(themes: DesignTheme[]): Promise<void> {
    try {
      // Create or find themes frame
      const themeFrame = await this.ensureThemeFrame();

      // Create header for the themes
      await this.createThemeHeader(themeFrame);

      // Create theme groups
      for (let i = 0; i < themes.length; i++) {
        await this.createThemeGroup(themes[i], themeFrame, i);
      }

      // Zoom to frame
      await miro.board.viewport.zoomTo(themeFrame);
    } catch (error) {
      console.error('Error visualizing themes:', error);
      throw error;
    }
  }

  /**
   * Ensure themes frame exists
   */
  private static async ensureThemeFrame(): Promise<Frame> {
    const frame = await MiroFrameService.findFrameByTitle(this.THEME_FRAME_NAME);
    if (frame) {
      // Clear frame contents if it exists
      const items = await miro.board.get({ type: ['sticky_note', 'text', 'shape'] });
      const frameItems = items.filter(item => item.parentId === frame.id);
      
      // Remove items one by one
      for (const item of frameItems) {
        await miro.board.remove(item);
      }
      
      return frame;
    }

    // Create new frame
    const { defaults } = ConfigurationService.getFrameConfig();
    return await MiroFrameService.createFrame(
      this.THEME_FRAME_NAME,
      defaults.initialX + 1500, // Position to the right of other frames
      defaults.initialY,
      1200,
      800
    );
  }

  /**
   * Create header for themes frame
   */
  private static async createThemeHeader(frame: Frame): Promise<void> {
    await miro.board.createText({
      content: '<strong>Design Themes & Groups</strong>',
      x: frame.x,
      y: frame.y - frame.height/2 + 60,
      width: 400,
      style: {
        textAlign: 'center',
        fontSize: 24
      }
    });

    await miro.board.createText({
      content: 'Automatically generated themes based on design proposals and thinking dialogue',
      x: frame.x,
      y: frame.y - frame.height/2 + 100,
      width: 600,
      style: {
        textAlign: 'center',
        fontSize: 16,
        color: '#666666'
      }
    });
  }

  /**
   * Create visualization for a single theme
   */
  private static async createThemeGroup(theme: DesignTheme, frame: Frame, index: number): Promise<void> {
    const columns = 2;
    const column = index % columns;
    const row = Math.floor(index / columns);
    
    const columnWidth = frame.width / columns;
    const rowHeight = 350;
    
    const x = frame.x - frame.width/2 + (column * columnWidth) + columnWidth/2;
    const y = frame.y - frame.height/2 + 200 + (row * rowHeight);

    // Create theme card
    await miro.board.createShape({
      type: 'shape',
      x,
      y,
      width: columnWidth - 40,
      height: rowHeight - 40,
      style: {
        fillColor: 'white',
        borderColor: theme.color === 'light_gray' ? 'gray' : theme.color,
        borderWidth: 3,
        borderStyle: 'normal'
      }
    });

    // Create theme title
    await miro.board.createText({
      content: `<strong>${theme.name}</strong>`,
      x,
      y: y - rowHeight/2 + 40,
      width: columnWidth - 80,
      style: {
        textAlign: 'center',
        fontSize: 18
      }
    });

    // Create theme description
    await miro.board.createText({
      content: theme.description,
      x,
      y: y - rowHeight/2 + 80,
      width: columnWidth - 80,
      style: {
        textAlign: 'center',
        fontSize: 14,
        color: '#666666'
      }
    });

    // Create related points
    const pointsPerTheme = 3;
    for (let i = 0; i < Math.min(theme.relatedPoints.length, pointsPerTheme); i++) {
      const pointY = y - 50 + (i * 70);
      
      // Truncate point text if needed
      let pointText = theme.relatedPoints[i];
      if (pointText.length > 150) {
        pointText = pointText.substring(0, 147) + '...';
      }
      
      // Convert theme.color to a valid sticky note color
      const stickyColor = this.getStickyColorFromTheme(theme.color);
      
      await miro.board.createStickyNote({
        content: pointText,
        x,
        y: pointY,
        width: columnWidth - 100,
        style: {
          fillColor: stickyColor,
          textAlign: 'center'
        }
      });
    }

    // Add "more" text if there are additional points
    if (theme.relatedPoints.length > pointsPerTheme) {
      await miro.board.createText({
        content: `+${theme.relatedPoints.length - pointsPerTheme} more related points`,
        x,
        y: y + rowHeight/2 - 50,
        width: columnWidth - 80,
        style: {
          textAlign: 'center',
          fontSize: 12,
          color: '#666666'
        }
      });
    }
  }

  /**
   * Get a valid sticky note color from theme color
   */
  private static getStickyColorFromTheme(themeColor: string): 'light_yellow' | 'light_green' | 'light_blue' | 'light_pink' | 'violet' {
    switch (themeColor) {
      case 'light_yellow': return 'light_yellow';
      case 'light_green': return 'light_green';
      case 'light_blue': return 'light_blue';
      case 'light_pink': return 'light_pink';
      case 'violet': return 'violet';
      case 'light_gray': return 'light_yellow'; // fallback for light_gray
      default: return 'light_yellow'; // default fallback
    }
  }

  /**
   * Generate themes and visualize them on the board
   */
  public static async generateAndVisualizeThemes(): Promise<void> {
    try {
      console.log('Generating design themes...');
      const themes = await this.generateDesignThemes();
      
      console.log(`Generated ${themes.length} design themes`);
      await this.visualizeThemes(themes);
      
      console.log('Design themes visualized successfully');
    } catch (error) {
      console.error('Error generating and visualizing themes:', error);
      throw error;
    }
  }
} 