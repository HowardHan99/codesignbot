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

  // Flag to enable/disable test sticky notes - DISABLED by default
  private static testStickyNotesEnabled: boolean = false;
  
  // Map to store theme positions for future sticky note placement
  private static themePositions: Map<string, {x: number, y: number, themeIndex: number}> = new Map();

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
      // Simplified prompt that focuses only on theme names
      const systemPrompt = `You are a design expert specializing in identifying themes and patterns in design content.
      
Your task is to analyze design proposals and dialogue to identify 4 key themes or groups. These might include:
- Functional groups (features with similar purposes)
- Design priorities (visual elements, UX flow concerns, etc.)
- User-centered categories (addressing specific user needs)
- Technical implementation themes

For each theme, provide ONLY:
1. A short, descriptive name (1-3 words)

EXTREMELY IMPORTANT:
1. Your response MUST be a valid JSON array of objects.
2. Each object MUST have ONLY a "name" property (remove description and relatedPoints).
3. You MUST provide exactly 4 themes.
4. Do not include any text outside the JSON array.

Example of CORRECT response format:
[
  { "name": "Accessibility and Inclusivity" },
  { "name": "User Experience" },
  { "name": "Technical Integration" },
  { "name": "Visual Design" }
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
        
        // Parse the JSON content
        let parsed: any[] = [];
        
        if (jsonContent.trim().startsWith('[')) {
          parsed = JSON.parse(jsonContent);
        } else if (jsonContent.trim().startsWith('{')) {
          parsed = [JSON.parse(jsonContent)];
        } else {
          throw new Error('Invalid JSON format: content must start with [ or {');
        }
        
        // Map the parsed themes with colors and empty descriptions/relatedPoints
        themes = parsed.map((theme: any, index: number) => ({
          name: theme.name || `Theme ${index + 1}`,
          description: "", // Empty description since we don't need it
          relatedPoints: [], // Empty relatedPoints since we don't need them
          color: this.THEME_COLORS[index % this.THEME_COLORS.length]
        }));
        
        // Ensure we have exactly 4 themes
        while (themes.length < 4) {
          themes.push({
            name: `Theme ${themes.length + 1}`,
            description: "",
            relatedPoints: [],
            color: this.THEME_COLORS[themes.length % this.THEME_COLORS.length]
          });
        }
        
        // Limit to 4 themes if we have more
        themes = themes.slice(0, 4);
        
        console.log(`Successfully prepared ${themes.length} themes`);
      } catch (error) {
        console.error('Error parsing themes:', error);
        throw new Error('Failed to parse theme data. Please check the API response format.');
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
   * Ensure the theme frame exists, creating it if necessary
   */
  private static async ensureThemeFrame(): Promise<Frame> {
    try {
      // First, try to find existing frame
      const existingFrames = await miro.board.get({ type: 'frame' });
      
      // Look for our specific theme frame by name
      const themeFrame = existingFrames.find(frame => frame.title === this.THEME_FRAME_NAME);
      
      if (themeFrame) {
        console.log(`Found existing theme frame: ${themeFrame.id}`);
        
        // Clear frame contents if it exists
        const items = await miro.board.get({ type: ['sticky_note', 'text', 'shape'] });
        const frameItems = items.filter(item => item.parentId === themeFrame.id);
        
        // Remove items one by one
        for (const item of frameItems) {
          await miro.board.remove(item);
        }
        
        return themeFrame;
      }
      
      // Frame not found, create new frame
      console.log('Theme frame not found, creating new frame');
      
      // Get the current viewport
      const viewport = await miro.board.viewport.get();
      
      // Define a fixed size for theme visualization - increased height to prevent overflow
      const frameWidth = 1200;  // Wide enough for 4 themes
      const frameHeight = 800;  // Taller to accommodate sticky notes without overflow
      
      // Create at the center of current viewport for visibility
      const frameX = viewport.x + viewport.width / 2;
      const frameY = viewport.y + viewport.height / 2;
      
      console.log(`Creating theme frame at position: x=${frameX}, y=${frameY}, width=${frameWidth}, height=${frameHeight}`);
      
      // Create the frame
      const newFrame = await miro.board.createFrame({
        title: this.THEME_FRAME_NAME,
        x: frameX,
        y: frameY,
        width: frameWidth,
        height: frameHeight,
        style: {
          fillColor: '#ffffff'
        }
      });
      
      console.log(`Created new theme frame: ${newFrame.id}`);
      
      // Important technique: Create then delete then create a sticky note inside the frame
      // This ensures the frame is properly registered in Miro's system
      const tempSticky = await miro.board.createStickyNote({
        content: "Temporary note - will be removed",
        x: frameX,
        y: frameY,
        width: 200,
        style: {
          fillColor: 'light_yellow'
        }
      });
      console.log(`Created temporary sticky note: ${tempSticky.id}`);
      
      // Wait a moment for Miro to process the frame and sticky note
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Remove the temporary sticky note
      await miro.board.remove(tempSticky);
      console.log(`Removed temporary sticky note`);
      
      // Wait a moment for Miro to process the frame
      await new Promise(resolve => setTimeout(resolve, 300));
      
      return newFrame;
    } catch (error) {
      console.error('Error ensuring theme frame:', error);
      throw error;
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
   * Get hex color value from theme color name
   */
  private static getHexColor(colorName: string): string {
    return this.COLOR_HEX_MAP[colorName] || '#808080'; // Default to gray if color not found
  }

  /**
   * Enable or disable test sticky notes
   * @param enabled Whether test sticky notes should be enabled
   */
  public static setTestStickyNotesEnabled(enabled: boolean): void {
    this.testStickyNotesEnabled = enabled;
  }
  
  /**
   * Get positions for sticky notes under themes
   * Returns a map of theme names to positions
   */
  public static getThemePositions(): Map<string, {x: number, y: number, themeIndex: number}> {
    return this.themePositions;
  }
  
  /**
   * Calculate position for sticky notes under a theme
   */
  public static calculateStickyNotePosition(frame: Frame, themeIndex: number): {x: number, y: number} {
    // POSITIONING BREAKDOWN:
    console.log(`[DEBUG] Frame dimensions: width=${frame.width}, height=${frame.height}`);
    
    // 1. VERTICAL POSITIONING
    const rows = 4; // Four rows, one for each theme
    const row = themeIndex % rows;
    const rowHeight = frame.height / rows;
    
    // Instead of calculating relative to the theme bar, let's use direct row positioning
    // Divide each row into two parts: top part for theme bar (30%), bottom part for sticky notes (70%)
    const rowTopEdge = frame.y - frame.height/2 + (row * rowHeight);
    const rowBottomEdge = rowTopEdge + rowHeight;
    
    // Position the sticky notes 60% down the row height - this guarantees no overlap
    // This puts them well below the theme bar regardless of the theme bar's exact position
    const stickyY = rowTopEdge + (rowHeight * 0.6);
    
    console.log(`[DEBUG] Row ${row}: top=${rowTopEdge}, bottom=${rowBottomEdge}`);
    console.log(`[DEBUG] Sticky Y position at 60% of row: ${stickyY}`);
    
    // 2. HORIZONTAL POSITIONING
    //DON'T CHANGE THIS 200 - IT'S THE CORRECT POSITION FOR THE STICKY NOTES
    const LEFT_MARGIN = 200;
    const frameLeftEdge = frame.x - frame.width/2;
    const stickyX = frameLeftEdge + LEFT_MARGIN;
    
    return {
      x: stickyX,
      y: stickyY
    };
  }
  
  /**
   * Create a test sticky note under a theme
   */
  private static async createTestStickyNote(frame: Frame, theme: DesignTheme, themeIndex: number): Promise<void> {
    try {
      // Calculate position for the sticky note
      const position = this.calculateStickyNotePosition(frame, themeIndex);
      
      console.log(`[DEBUG] Test sticky note for "${theme.name}" at: x=${position.x}, y=${position.y}`);
      console.log(`[DEBUG] Distance from frame top: ${position.y - (frame.y - frame.height/2)}px`);
      
      // We no longer need to store the position here since it's stored in createThemeGroup
      // this.themePositions.set(theme.name, {
      //   x: position.x,
      //   y: position.y,
      //   themeIndex: themeIndex
      // });
      
      const content = `Test note for: ${theme.name}`;
      
      // Use standard size from config (300px)
      const STICKY_WIDTH = 300; // Standard size
      
      // Create the sticky note
      const sticky = await miro.board.createStickyNote({
        content: content,
        x: position.x,
        y: position.y,
        width: STICKY_WIDTH,
        style: {
          fillColor: this.getStickyColorFromTheme(theme.color),
          textAlign: 'center',
          textAlignVertical: 'middle'
        }
      });
      
      console.log(`[DEBUG] Created test sticky: ${sticky.id}`);
      
      // Wait for Miro to process
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`[ERROR] Failed to create test sticky note for "${theme.name}":`, error);
    }
  }
  
  /**
   * Place sticky notes under themes
   */
  public static async placeStickyNotesUnderTheme(themeName: string, stickyContents: string[]): Promise<void> {
    const position = this.themePositions.get(themeName);
    if (!position) {
      console.error(`No position found for theme: ${themeName}`);
      return;
    }
    
    // Use standard sticky note dimensions from config
    const STICKY_WIDTH = 300; // Standard size 
    const STICKY_SPACING = 50; // Standard spacing
    
    // Get the theme's color
    const theme = await this.getThemeByName(themeName);
    const color = theme ? theme.color : 'light_yellow';
    
    console.log(`[DEBUG] Placing ${stickyContents.length} stickies under "${themeName}" at (${position.x}, ${position.y})`);
    
    // Create each sticky note with proper spacing
    for (let i = 0; i < stickyContents.length; i++) {
      const offsetX = i * (STICKY_WIDTH + STICKY_SPACING); 
      
      try {
        const sticky = await miro.board.createStickyNote({
          content: stickyContents[i],
          x: position.x + offsetX,
          y: position.y,
          width: STICKY_WIDTH,
          style: {
            fillColor: this.getStickyColorFromTheme(color)
          }
        });
        
        console.log(`[DEBUG] Created sticky: ${sticky.id} at x=${position.x + offsetX}, y=${position.y}`);
      } catch (error) {
        console.error(`[ERROR] Failed to create sticky note: "${stickyContents[i].substring(0, 30)}..."`);
      }
      
      // Small delay between sticky notes
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  
  /**
   * Helper to get a theme by name
   */
  private static async getThemeByName(themeName: string): Promise<DesignTheme | null> {
    try {
      // Use cached themes if available, or generate new ones
      let themes = await this.generateDesignThemes();
      return themes.find(t => t.name === themeName) || null;
    } catch (error) {
      console.error(`Error finding theme by name: ${themeName}`, error);
      return null;
    }
  }
  
  /**
   * Visualize themes on the Miro board
   * @param themes Array of themes to visualize
   * @param createTestStickies Optional flag to create test sticky notes
   */
  public static async visualizeThemes(themes: DesignTheme[], createTestStickies: boolean = true): Promise<void> {
    // Reset theme positions map
    this.themePositions.clear();
    
    // Set test sticky notes flag - default to true for debugging
    this.testStickyNotesEnabled = createTestStickies;
    
    console.log(`[DEBUG] Test sticky notes ${this.testStickyNotesEnabled ? 'ENABLED' : 'DISABLED'}`);
    
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
      
      // Log all theme positions for debugging
      console.log('[DEBUG] Final theme positions map:');
      this.themePositions.forEach((pos, name) => {
        console.log(`  "${name}": x=${pos.x}, y=${pos.y}, index=${pos.themeIndex}`);
      });
    } catch (error) {
      console.error('Error visualizing themes:', error);
      throw error;
    }
  }
  
  /**
   * Generate themes and visualize them on the board
   * @param createTestStickies Optional flag to create test sticky notes
   */
  public static async generateAndVisualizeThemes(createTestStickies: boolean = true): Promise<void> {
    try {
      console.log(`[DEBUG] Starting generation with test stickies ${createTestStickies ? 'ENABLED' : 'DISABLED'}`);
      console.log(`[DEBUG] Current testStickyNotesEnabled value: ${this.testStickyNotesEnabled}`);
      
      console.log('Generating design themes...');
      const themes = await this.generateDesignThemes();
      
      console.log(`Generated ${themes.length} design themes`);
      await this.visualizeThemes(themes, createTestStickies);
      
      console.log('Design themes visualized successfully');
      console.log(`[DEBUG] Final testStickyNotesEnabled value: ${this.testStickyNotesEnabled}`);
      console.log(`[DEBUG] Final theme positions:`, 
        Array.from(this.themePositions.entries()).map(([name, pos]) => 
          `${name}: (${pos.x}, ${pos.y})`)
      );
    } catch (error) {
      console.error('Error generating and visualizing themes:', error);
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
    
    // Calculate position inside the frame - at 25% of the row height
    const rowTopEdge = frame.y - frame.height/2 + (row * rowHeight);
    //DON'T CHANGE THIS 0.05 - IT'S THE CORRECT POSITION FOR THE THEME BAR
    const themeY = rowTopEdge + (rowHeight * 0.05);
    
    // Log frame details for debugging
    console.log(`[DEBUG] Frame details: id=${frame.id}, width=${frame.width}, height=${frame.height}`);
    console.log(`[DEBUG] Row ${row}: top=${rowTopEdge}, theme Y=${themeY}, height=${rowHeight}`);
    
    // Create a full-width shape (horizontal bar)
    await miro.board.createShape({
      type: 'shape',
      x: frame.x, // Center of the frame
      y: themeY,
      width: Math.max(frame.width - 40, 100), // Almost full width, with small margins, min 100px
      height: 40, // Fixed height for consistency
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
      y: themeY,
      width: Math.max(frame.width - 60, 80), // Slightly narrower than shape, min 80px
      style: {
        textAlign: 'center',
        fontSize: 16
      }
    });
    
    // Always calculate and store position for future sticky notes, 
    // regardless of whether we create test notes or not
    const position = this.calculateStickyNotePosition(frame, index);
    
    // Store this position for future reference
    this.themePositions.set(theme.name, {
      x: position.x,
      y: position.y,
      themeIndex: index
    });
    
    console.log(`[DEBUG] Position marked for theme "${theme.name}": x=${position.x}, y=${position.y}`);
    
    // Create placeholder sticky note only if test mode is enabled
    if (this.testStickyNotesEnabled) {
      console.log(`[DEBUG] Creating test sticky note for theme: ${theme.name}`);
      await this.createTestStickyNote(frame, theme, index);
    } else {
      console.log(`[DEBUG] Test sticky notes disabled. Position marked but no sticky created for: ${theme.name}`);
      
      // Add a small position marker for debugging purposes without creating full sticky notes
      await miro.board.createShape({
        type: 'shape',
        x: position.x,
        y: position.y,
        width: 10, // Small dot
        height: 10,
        shape: 'circle', // Specify circle shape
        style: {
          fillColor: this.getHexColor(theme.color),
          borderColor: '#000000',
          borderWidth: 1,
          borderStyle: 'normal',
          borderOpacity: 0.5
        }
      });
      
      // Add a tiny label to indicate this is a position marker
      await miro.board.createText({
        content: `${theme.name} notes position`,
        x: position.x + 80, // Offset to the right of marker
        y: position.y,
        width: 120,
        style: {
          textAlign: 'left',
          fontSize: 8
        }
      });
    }
    
    // Give Miro a moment to process
    await new Promise(resolve => setTimeout(resolve, 200)); // Increased delay for better reliability
  }
} 