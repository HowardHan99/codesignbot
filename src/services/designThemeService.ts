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
  private static readonly THEME_FRAME_NAME = 'Antagonistic-Response';
  private static readonly THEME_COLORS = [
    'light_green', 'light_blue', 'light_yellow', 
    'light_pink', 'violet', 'light_gray'
  ] as const;
  
  // Hex color values for shape borders and backgrounds
  private static readonly COLOR_HEX_MAP: Record<string, string> = {
    'light_green': '#C3E5B5',
    'light_blue': '#BFE3F2',
    'light_yellow': '#F5F7B5',
    'light_pink': '#F5C3C2',
    'violet': '#D5C8E8',
    'light_gray': '#E5E5E5',
    'gray': '#808080',
    'white': '#FFFFFF'
  };

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

EXTREMELY IMPORTANT:
1. Your response MUST be a valid JSON array of objects.
2. The JSON array MUST start with '[' and end with ']'.
3. Each object in the array MUST have these exact keys: "name", "description", "relatedPoints".
4. The "relatedPoints" value MUST be an array of strings.
5. Do not include any text outside the JSON array.
6. Do not include markdown formatting (like \`\`\`json).
7. Do not include comments in the JSON.

Example of CORRECT response format:
[
  {
    "name": "Theme name",
    "description": "Theme description",
    "relatedPoints": ["Point 1", "Point 2", "Point 3"]
  },
  {
    "name": "Another theme",
    "description": "Another description",
    "relatedPoints": ["Point A", "Point B"]
  }
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
          useGpt4: true,
          expectsJson: true
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to analyze content');
      }

      const result = await response.json();

      // Add detailed logging
      console.log('Raw API response received:', typeof result.response);
      console.log('Response preview:', result.response.substring(0, 100) + '...');
      
      // Parse the JSON response
      let themes: DesignTheme[] = [];
      try {
        // Extract JSON content if it's wrapped in markdown code blocks
        const jsonContent = this.extractJsonFromMarkdown(result.response);
        console.log('Extracted JSON content:', jsonContent.substring(0, 100) + '...');
        
        // Additional validation to ensure it's array-like
        if (!jsonContent.trim().startsWith('[')) {
          console.error('Expected JSON array but received something else:', jsonContent.substring(0, 50));
          // Try to wrap content in array if it might be a single object
          if (jsonContent.trim().startsWith('{')) {
            console.log('Attempting to wrap object in array');
            const parsed = JSON.parse(`[${jsonContent}]`);
            themes = parsed.map((theme: any, index: number) => ({
              ...theme,
              color: this.THEME_COLORS[index % this.THEME_COLORS.length]
            }));
          } else {
            // Try manual fallback parsing
            console.log('Attempting to parse using manual extraction');
            // This is a last resort - try to find theme objects
            const nameMatches = jsonContent.match(/"name"\s*:\s*"([^"]*)"/g);
            const descMatches = jsonContent.match(/"description"\s*:\s*"([^"]*)"/g);
            const pointsMatches = jsonContent.match(/"relatedPoints"\s*:\s*\[(.*?)\]/g);
            
            if (nameMatches && nameMatches.length && descMatches && pointsMatches) {
              themes = nameMatches.map((_, index) => {
                const name = nameMatches[index]?.match(/"name"\s*:\s*"([^"]*)"/)?.[1] || 'Unknown Theme';
                const description = descMatches[index]?.match(/"description"\s*:\s*"([^"]*)"/)?.[1] || 'No description available';
                const pointsMatch = pointsMatches[index]?.match(/"relatedPoints"\s*:\s*\[(.*?)\]/)?.[1] || '';
                const points = pointsMatch.split(',').map(p => p.replace(/"/g, '').trim()).filter(p => p);
                
                return {
                  name,
                  description,
                  relatedPoints: points.length ? points : ['No points available'],
                  color: this.THEME_COLORS[index % this.THEME_COLORS.length]
                };
              });
            }
          }
          
          if (!themes.length) {
            throw new Error('Could not parse response as a valid array of themes');
          }
        } else {
          // Normal parsing path for array
          const parsed = JSON.parse(jsonContent);
          if (!Array.isArray(parsed)) {
            console.error('Parsed content is not an array:', typeof parsed);
            throw new Error('Response was parsed but is not an array');
          }
          themes = parsed.map((theme: any, index: number) => ({
            ...theme,
            color: this.THEME_COLORS[index % this.THEME_COLORS.length]
          }));
        }
        
        console.log(`Successfully parsed ${themes.length} themes`);
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
   * Extract JSON content from a string that might be wrapped in markdown code blocks
   */
  private static extractJsonFromMarkdown(text: string): string {
    // Try to extract content between ```json and ``` markers
    const jsonCodeBlockRegex = /```(?:json)?\s*\n([\s\S]*?)```/;
    const match = text.match(jsonCodeBlockRegex);
    
    if (match && match[1]) {
      console.log('Found JSON content in markdown code block');
      return match[1].trim();
    }
    
    // If no markdown code block found, try to find content that looks like JSON array/object
    // We look for balanced brackets to find the most likely JSON structure
    let depth = 0;
    let start = -1;
    let end = -1;
    
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '[' || text[i] === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (text[i] === ']' || text[i] === '}') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    
    if (start !== -1 && end !== -1) {
      console.log('Found balanced JSON-like structure');
      return text.substring(start, end + 1);
    }
    
    // Fallback to simpler regex if bracket matching fails
    const possibleJsonRegex = /(\[[\s\S]*\]|\{[\s\S]*\})/;
    const jsonMatch = text.match(possibleJsonRegex);
    
    if (jsonMatch && jsonMatch[1]) {
      console.log('Found JSON-like content without markdown wrapper');
      return jsonMatch[1].trim();
    }
    
    // Check if it's possibly just a single object without array wrapper
    if (text.includes('"name"') && text.includes('"description"') && text.includes('"relatedPoints"')) {
      console.log('Found JSON-like properties without proper structure');
      return text.trim();
    }
    
    // If all else fails, return the original text and let JSON.parse handle any errors
    console.log('No JSON pattern found, returning original text');
    return text.trim();
  }

  /**
   * Visualize themes on the Miro board
   */
  public static async visualizeThemes(themes: DesignTheme[]): Promise<void> {
    try {
      console.log(`Visualizing ${themes.length} themes in '${this.THEME_FRAME_NAME}' frame...`);
      
      // Create or find themes frame
      const themeFrame = await this.ensureThemeFrame();
      console.log(`Frame ready: ${themeFrame.id} (${themeFrame.title})`);

      // Handle case where no themes were found
      if (themes.length === 0) {
        // Create informative message in the frame
        await miro.board.createText({
          content: 'No themes could be identified from the current content.\nPlease ensure there are Design Proposals and Thinking Dialogue notes available.',
          x: themeFrame.x,
          y: themeFrame.y,
          width: themeFrame.width - 100,
          style: {
            textAlign: 'center',
            fontSize: 16
          }
        });
        
        // Zoom to frame and return
        await miro.board.viewport.zoomTo(themeFrame);
        console.log('No themes to visualize');
        return;
      }

      // Limit to 4 themes if we have more
      const themesToShow = themes.slice(0, 4);

      // Create theme groups
      for (let i = 0; i < themesToShow.length; i++) {
        console.log(`Creating theme ${i+1}/${themesToShow.length}: "${themesToShow[i].name}"`);
        await this.createThemeGroup(themesToShow[i], themeFrame, i);
      }

      console.log('All themes created, zooming to frame');
      // Zoom to frame
      await miro.board.viewport.zoomTo(themeFrame);
      console.log('Visualization complete');
    } catch (error) {
      console.error('Error visualizing themes:', error);
      throw error;
    }
  }

  /**
   * Create visualization for a single theme
   */
  private static async createThemeGroup(theme: DesignTheme, frame: Frame, index: number): Promise<void> {
    const rows = 4; // Four rows, one for each theme
    const row = index % rows;
    
    const rowHeight = frame.height / rows;
    
    // Calculate position inside the frame
    const y = frame.y - frame.height/2 + (row * rowHeight) + rowHeight/2;
    
    // Create a full-width shape (horizontal bar)
    await miro.board.createShape({
      type: 'shape',
      x: frame.x, // Center of the frame
      y: y,
      width: Math.max(frame.width - 40, 100), // Almost full width, with small margins, min 100px
      height: Math.min(40, rowHeight * 0.7), // Fixed height or relative to row height if too small
      style: {
        fillColor: this.getHexColor(theme.color),
        borderColor: this.getHexColor('gray'),
        borderWidth: 1,
        borderStyle: 'normal'
      }
    });
    
    // Create theme title centered on the rectangle
    await miro.board.createText({
      content: theme.name,
      x: frame.x, // Center of the frame
      y: y,
      width: Math.max(frame.width - 60, 80), // Slightly narrower than shape, min 80px
      style: {
        textAlign: 'center',
        fontSize: 16
      }
    });
    
    // Give Miro a moment to process
    await new Promise(resolve => setTimeout(resolve, 100));
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

    // Create new frame with default dimensions from config - don't change existing frame size
    const { defaults } = ConfigurationService.getFrameConfig();
    return await MiroFrameService.createFrame(
      this.THEME_FRAME_NAME,
      defaults.initialX + 1500,
      defaults.initialY,
      defaults.width,
      defaults.height
    );
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
   * Get hex color value from theme color name
   */
  private static getHexColor(colorName: string): string {
    return this.COLOR_HEX_MAP[colorName] || '#808080'; // Default to gray if color not found
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