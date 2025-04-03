import { ConfigurationService } from './configurationService';
import { MiroFrameService } from './miro/frameService';
import { MiroService } from './miroService';
import { MiroApiClient } from './miro/miroApiClient';
import { ProcessedDesignPoint } from '../types/common';
import { safeApiCall } from '../utils/errorHandlingUtils';
import { Frame, StickyNote } from '@mirohq/websdk-types';
import { OpenAIService } from '../services/openaiService';

/**
 * Theme or group identified from design content
 */
interface DesignTheme {
  name: string;           // Theme name
  description: string;    // Theme description
  relatedPoints: string[]; // Related design points
  color: string;          // Color for visualization
  icon?: string;          // Optional icon
}

// Add the theme type in OpenAIService
interface ThemeResponse {
  name: string;
  description: string;
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
   * Clear cached theme positions to force a fresh calculation
   */
  public static clearThemePositions(): void {
    console.log('Clearing cached theme positions');
    this.themePositions.clear();
  }

  /**
   * Get the currently stored theme positions
   * @returns The map of theme positions
   */
  public static getThemePositions(): Map<string, {x: number, y: number, themeIndex: number}> {
    return this.themePositions;
  }

  /**
   * This is a mock implementation - the actual method should be added to OpenAIService
   */
  private static async mockGenerateThemes(text: string): Promise<ThemeResponse[]> {
    console.log("Mocking theme generation - please implement OpenAIService.generateThemes");
    return [
      { name: "User Experience", description: "Focus on user interactions and experiences" },
      { name: "Technical Feasibility", description: "Consideration of technical implementation challenges" },
      { name: "Accessibility", description: "Ensuring the design is accessible to all users" },
      { name: "Innovation", description: "Novel approaches and creative solutions" }
    ];
  }

  /**
   * Generate design themes based on the input text
   * @returns Array of design themes
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
        console.log(`Using existing theme frame without modifying its contents`);
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
      
      // Wait a moment for Miro to process the frame
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Important: We're NOT creating and removing any temporary sticky notes
      // to avoid any accidental deletion of user content
      
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
   * @param createTestStickies Ignored parameter (for backward compatibility)
   */
  public static async visualizeThemes(themes: DesignTheme[], createTestStickies: boolean = true): Promise<void> {
    // Reset theme positions map
    this.themePositions.clear();
    
    // Always set test sticky notes to false regardless of parameter
    // This ensures no test sticky notes are ever created
    this.testStickyNotesEnabled = false;
    
    console.log(`[DEBUG] Test sticky notes DISABLED (parameter ignored for safety)`);
    
    try {
      console.log(`Visualizing ${themes.length} themes in '${this.THEME_FRAME_NAME}' frame...`);
      
      // Create or find themes frame
      const themeFrame = await this.ensureThemeFrame();
      console.log(`Frame ready: ${themeFrame.id} (${themeFrame.title})`);

      // Skip clearing process - we're not removing any items
      console.log('Preserving all existing content in theme frame (no items will be removed)');

      // Handle case where no themes were found
      if (themes.length === 0) {
        console.log('No themes to visualize, skipping visualization');
        return;
      }

      // Check for existing themes to avoid duplicates
      console.log("Checking for existing themes to avoid duplicates...");
      const existingThemeNames = new Set<string>();
      
      // Get text elements within the frame to identify existing theme names
      const textsInFrame = await MiroFrameService.getItemsWithinFrame(themeFrame, ['text']);
      for (const text of textsInFrame) {
        if (text.content) {
          const cleanContent = text.content.replace(/<\/?[^>]+(>|$)/g, '').trim();
          existingThemeNames.add(cleanContent.toLowerCase());
        }
      }
      
      console.log(`Found ${existingThemeNames.size} existing theme names in frame`);
      
      // Filter out themes that already exist on the board
      const themesToShow = themes.filter(theme => {
        const lowerThemeName = theme.name.toLowerCase();
        if (existingThemeNames.has(lowerThemeName)) {
          console.log(`Theme "${theme.name}" already exists on board, skipping visualization`);
          return false;
        }
        return true;
      });
      
      console.log(`Creating ${themesToShow.length} new themes (${themes.length - themesToShow.length} skipped as duplicates)`);
      
      // Create theme groups only for new themes
      for (let i = 0; i < themesToShow.length; i++) {
        console.log(`Creating theme ${i+1}/${themesToShow.length}: "${themesToShow[i].name}"`);
        await this.createThemeGroup(themesToShow[i], themeFrame, i);
      }

      // Ensure we calculate positions for all themes, including existing ones
      // This ensures we have positions for sticky note placement
      console.log("Calculating positions for all themes...");
      for (let i = 0; i < themes.length; i++) {
        const theme = themes[i];
        
        // Skip if we already calculated position for this theme
        if (this.themePositions.has(theme.name)) {
          console.log(`Position for "${theme.name}" already calculated, skipping`);
          continue;
        }
        
        // Calculate sticky note position for this theme
        const position = this.calculateStickyNotePosition(themeFrame, i % 4);
        
        // Store position for future sticky notes
        this.themePositions.set(theme.name, {
          x: position.x,
          y: position.y,
          themeIndex: i % 4
        });
        
        console.log(`Calculated position for "${theme.name}": x=${position.x}, y=${position.y}`);
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
   * @param createTestStickies Ignored parameter (for backward compatibility)
   */
  public static async generateAndVisualizeThemes(createTestStickies: boolean = true): Promise<void> {
    try {
      console.log('[DEBUG] Starting theme generation (test stickies always disabled)');
      
      console.log('Generating design themes...');
      const themes = await this.generateDesignThemes();
      
      console.log(`Generated ${themes.length} design themes`);
      await this.visualizeThemes(themes, false); // Always pass false for safety
      
      console.log('Design themes visualized successfully');
      console.log('[DEBUG] Theme positions:', 
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
    
    // Calculate and store position for future sticky notes, 
    // but don't create any test sticky notes or markers
    const position = this.calculateStickyNotePosition(frame, index);
    
    // Store this position for future reference
    this.themePositions.set(theme.name, {
      x: position.x,
      y: position.y,
      themeIndex: index
    });
    
    console.log(`[DEBUG] Position marked for theme "${theme.name}": x=${position.x}, y=${position.y}`);
    
    // We never create test sticky notes or position markers now
    // Test sticky notes and position markers have been disabled to prevent any
    // accidental deletion of user content
    
    // Give Miro a moment to process
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  /**
   * Get current themes directly from the Miro board
   * This reflects any edits a user may have made to the themes after generation
   * @returns Array of current themes with their positions and colors
   */
  public static async getCurrentThemesFromBoard(): Promise<DesignTheme[]> {
    try {
      console.log(`Getting current themes from ${this.THEME_FRAME_NAME} frame...`);
      
      // Find the theme frame
      const themeFrame = await MiroFrameService.findFrameByTitle(this.THEME_FRAME_NAME);
      
      if (!themeFrame) {
        console.log(`${this.THEME_FRAME_NAME} frame not found`);
        return [];
      }
      
      // Reset the theme positions map to ensure clean state
      this.themePositions.clear();
      
      // Get text elements within the frame - these are our potential themes
      const textsInFrame = await MiroFrameService.getItemsWithinFrame(themeFrame, ['text']);
      
      if (textsInFrame.length === 0) {
        console.log(`No text elements found in ${this.THEME_FRAME_NAME} frame`);
        return [];
      }
      
      console.log(`Found ${textsInFrame.length} text elements in the frame`);
      
      // Clean the text content
      const cleanedTexts = textsInFrame.map(text => {
        return {
          ...text,
          content: text.content ? text.content.replace(/<\/?[^>]+(>|$)/g, '').trim() : ''
        };
      });

      // Log all found text elements
      console.log("All text elements in frame:");
      cleanedTexts.forEach(text => {
        console.log(`- "${text.content}" at position ${text.x}, ${text.y}`);
      });
      
      // Filter for potential theme headers - main theme titles
      // Looking for centered, short text elements
      const potentialThemes = cleanedTexts.filter(text => {
        // Skip empty or very long text
        if (!text.content || text.content.length > 50) return false;
        
        // Themes are typically centered in the frame horizontally
        const isCentered = Math.abs(text.x - themeFrame.x) < 300;
        
        // Skip text elements with certain characteristics not typical of headers
        const isPossiblyHeader = 
          !text.content.includes('notes position') && 
          !text.content.includes('No themes could be identified');
        
        return isCentered && isPossiblyHeader;
      });
      
      console.log(`Found ${potentialThemes.length} potential theme headers`);
      
      // Sort themes by vertical position (top to bottom)
      potentialThemes.sort((a, b) => a.y - b.y);
      
      // Track seen theme names to avoid duplicates in the result
      const seenThemeNames = new Set<string>();
      
      // Frame dimensions for row calculation
      const frameTop = themeFrame.y - themeFrame.height/2;
      const rowHeight = themeFrame.height / Math.max(4, potentialThemes.length); // Adapt row height to number of themes
      
      // Create theme objects with colors and positions
      const themes: DesignTheme[] = [];
      
      for (let i = 0; i < potentialThemes.length; i++) {
        const themeText = potentialThemes[i];
        
        // Skip empty content
        if (!themeText.content) continue;
        
        // Skip duplicate themes (don't add number suffix, just skip)
        if (seenThemeNames.has(themeText.content.toLowerCase())) {
          console.log(`Skipping duplicate theme: "${themeText.content}"`);
          continue;
        }
        
        // Mark this theme name as seen
        seenThemeNames.add(themeText.content.toLowerCase());
        
        // Calculate which row this theme is in
        const relativeY = themeText.y - frameTop;
        const row = Math.floor(relativeY / rowHeight);
        
        // Assign a color based on position
        const themeColor = this.THEME_COLORS[i % this.THEME_COLORS.length];
        
        // Calculate sticky note position for this theme
        const position = this.calculateStickyNotePosition(themeFrame, row);
        
        // Store position for future sticky notes
        this.themePositions.set(themeText.content, {
          x: position.x,
          y: position.y,
            themeIndex: row
        });
        
        // Create theme object
        themes.push({
          name: themeText.content,
          description: "",
          relatedPoints: [],
          color: themeColor
        });
        
        console.log(`Added theme "${themeText.content}" with color ${themeColor} in row ${row}`);
      }
      
      console.log(`Returning ${themes.length} themes found in the frame:`);
      themes.forEach((theme, idx) => {
        console.log(`[${idx}] "${theme.name}" with color ${theme.color}`);
      });
      
      return themes;
    } catch (error) {
      console.error(`Error getting current themes from board:`, error);
      return [];
    }
  }
 
  /**
   * Clean header text by removing extra whitespace and formatting
   * @param text The header text to clean
   * @returns Cleaned header text
   */
  private static cleanHeaderText(text: string): string {
    if (!text) return '';
    
    // Remove HTML tags
    let cleaned = text.replace(/<\/?[^>]+(>|$)/g, '');
    
    // Remove extra whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    return cleaned;
  }

  /**
   * Sort headers by their position
   */
  private static sortHeadersByPosition(a: any, b: any): number {
    // First sort by Y position (top to bottom)
    if (a.y !== b.y) {
      return a.y - b.y;
    }
    
    // If Y is the same, sort by X position (left to right)
    return a.x - b.x;
  }

  /**
   * Get the design decision structure for display in the UI
   * This includes themes and associated design decisions
   * @param forceRefresh Whether to force a refresh of the themes from the board
   * @returns Design decision structure for the UI
   */
  public static async getDesignDecisionStructure(forceRefresh: boolean = false): Promise<{
    themes: {
      name: string;
      color: string;
      decisions: string[];
    }[];
  }> {
    try {
      console.log('Getting design decision structure...');
      
      // Get current themes from the Antagonistic-Response frame
      const themes = await this.getCurrentThemesFromBoard();
      console.log(`Found ${themes.length} themes for the design decision structure`);
      
      // Find decisions in the Design-Proposal frame
      // Get sticky notes from the Design-Proposal frame
      const proposals = await this.getDesignProposals();
      console.log(`Found ${proposals.length} design proposals for decisions`);
      
      // Simple theme-based decision categorization
      // Each proposal will be categorized into the most relevant theme
      const themeDecisions: Record<string, string[]> = {};
      
      // Initialize empty decision arrays for each theme
      themes.forEach(theme => {
        themeDecisions[theme.name] = [];
      });
      
      // Categorize each proposal into a theme
      // For now, we'll just use a simple keyword matching approach
      for (const proposal of proposals) {
        if (!proposal.trim()) continue;
        
        let bestMatch = '';
        let highestScore = 0;
        
        // Find the best matching theme
        for (const theme of themes) {
          // Calculate a simple matching score based on word overlap
          const themeWords = theme.name.toLowerCase().split(/\s+/);
          const proposalLower = proposal.toLowerCase();
          
          let score = 0;
          for (const word of themeWords) {
            if (word.length > 2 && proposalLower.includes(word)) {
              score += 1;
            }
          }
          
          if (score > highestScore) {
            highestScore = score;
            bestMatch = theme.name;
          }
        }
        
        // If no good match found, assign to the first theme or skip
        if (!bestMatch && themes.length > 0) {
          bestMatch = themes[0].name;
        }
        
        // Add the proposal to the matched theme's decisions
        if (bestMatch) {
          themeDecisions[bestMatch].push(proposal);
        }
      }
      
      // Format the themes and decisions for the UI
      const result = {
        themes: themes.map(theme => ({
          name: theme.name,
          color: theme.color,
          decisions: themeDecisions[theme.name] || []
        }))
      };
      
      return result;
    } catch (error) {
      console.error('Error getting design decision structure:', error);
      return { themes: [] };
    }
  }

  /**
   * Categorize antagonistic points by design themes
   * @param points Array of antagonistic points to categorize
   * @param existingThemes Optional array of existing themes to use instead of generating new ones
   * @returns Points organized by design themes
   */
  public static async categorizeAntagonisticPointsByTheme(
    points: string[], 
    existingThemes?: DesignTheme[] & { isSelected?: boolean }[]
  ): Promise<{
    themes: {
      name: string;
      color: string;
      points: string[];
      isSelected?: boolean;
    }[];
  }> {
    try {
      if (!points || points.length < 10) {
        throw new Error('Insufficient points to categorize. Need at least 10 points.');
      }

      console.log(`Categorizing ${points.length} antagonistic points into themes`);
      
      // Get the themes - either use existing ones or generate new ones
      let themes: (DesignTheme & { isSelected?: boolean })[];
      if (existingThemes && existingThemes.length > 0) {
        console.log(`Using ${existingThemes.length} existing themes for categorization`);
        themes = existingThemes;
      } else {
        console.log('No existing themes provided, generating new themes');
        themes = await this.generateDesignThemes();
        // Mark all newly generated themes as selected by default
        themes = themes.map(theme => ({ ...theme, isSelected: true }));
      }
      console.log(`Using ${themes.length} design themes for categorization`);
      
      // Filter to only use selected themes (or all if none are marked as selected)
      const selectedThemes = themes.filter(theme => theme.isSelected !== false);
      
      // If no themes are selected, use all themes (first use case or fallback)
      const themesToUse = selectedThemes.length > 0 ? selectedThemes : themes;
      
      console.log(`Using ${themesToUse.length} themes for point categorization`);
      
      // Use OpenAI to categorize points by theme
      const result = await this.categorizationWithOpenAI(points, themesToUse);
      
      // Ensure each theme has a reasonable number of points
      const pointsPerTheme = Math.max(5, Math.floor(points.length / themesToUse.length));
      
      // Ensure each theme has exactly the expected number of points (default to 5)
      const finalThemes = themesToUse.map((theme, index) => {
        const themePoints = result[theme.name] || [];
        
        // If we have fewer than expected points, add more
        while (themePoints.length < pointsPerTheme) {
          const unusedPoints = points.filter(p => 
            !themesToUse.some(t => (result[t.name] || []).includes(p))
          );
          
          if (unusedPoints.length > 0) {
            themePoints.push(unusedPoints[0]);
            // Remove the point from consideration for other themes
            const pointIndex = points.indexOf(unusedPoints[0]);
            if (pointIndex !== -1) {
              points.splice(pointIndex, 1);
            }
          } else {
            // If no unused points, create a generic point
            themePoints.push(`This design requires more consideration for ${theme.name}.`);
          }
        }
        
        // If we have more than expected points, take the first N
        const finalPoints = themePoints.slice(0, pointsPerTheme);
        
        return {
          name: theme.name,
          color: theme.color,
          points: finalPoints,
          isSelected: theme.isSelected
        };
      });
      
      console.log(`Successfully categorized points into ${finalThemes.length} themes`);
      
      return { themes: finalThemes };
    } catch (error) {
      console.error('Error categorizing antagonistic points:', error);
      
      // Fallback: split points evenly between two generic themes
      const points10 = points.slice(0, 10);
      const halfLength = Math.ceil(points10.length / 2);
      
      return {
        themes: [
          {
            name: 'Design Concerns',
            color: 'light_blue',
            points: points10.slice(0, halfLength),
            isSelected: true
          },
          {
            name: 'Implementation Risks',
            color: 'light_pink',
            points: points10.slice(halfLength, 10),
            isSelected: true
          }
        ]
      };
    }
  }
  
  /**
   * Use OpenAI to categorize points by theme
   * @private
   */
  private static async categorizationWithOpenAI(
    points: string[],
    themes: DesignTheme[]
  ): Promise<Record<string, string[]>> {
    try {
      const { OpenAIService } = await import('../services/openaiService');
      
      const systemPrompt = `You are an expert design analyst who specializes in categorizing design critique points into themes.
      
You will receive a list of design critique points and a list of design themes. Your task is to categorize each point into the most appropriate theme.

RULES:
1. Each critique point should be assigned to EXACTLY ONE theme
2. The distribution should be as even as possible between themes
3. Choose the theme that best matches the core concern of each critique point
4. Return your analysis as a valid JSON object where:
   - Keys are the theme names
   - Values are arrays of critique points assigned to that theme

Example response format:
{
  "Theme Name 1": ["Critique point 1", "Critique point 3"],
  "Theme Name 2": ["Critique point 2", "Critique point 4"]
}

The available themes are:
${themes.map((theme, index) => `${index + 1}. ${theme.name}`).join('\n')}`;

      const userPrompt = `Please categorize these design critique points into the most appropriate themes:

${points.map((point, index) => `${index + 1}. ${point}`).join('\n')}`;

      // Use a custom API call for this specific task
      const response = await fetch('/api/openaiwrap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userPrompt,
          systemPrompt,
          useGpt4: true
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      // Extract JSON content from the response
      const jsonContent = this.extractJsonFromMarkdown(result.response);
      
      // Parse the JSON
      const categorization = JSON.parse(jsonContent);
      
      // Validate and normalize the categorization
      const validatedResult: Record<string, string[]> = {};
      let allAssignedPoints: string[] = [];
      
      // Initialize with empty arrays for each theme
      themes.forEach(theme => {
        validatedResult[theme.name] = [];
      });
      
      // Add points to the appropriate themes
      Object.entries(categorization).forEach(([themeName, themePoints]) => {
        const matchedTheme = themes.find(t => 
          t.name.toLowerCase() === themeName.toLowerCase() ||
          themeName.toLowerCase().includes(t.name.toLowerCase()) ||
          t.name.toLowerCase().includes(themeName.toLowerCase())
        );
        
        if (matchedTheme) {
          const pointsArray = Array.isArray(themePoints) ? themePoints : [themePoints];
          validatedResult[matchedTheme.name] = pointsArray.filter(p => 
            typeof p === 'string' && points.includes(p) && !allAssignedPoints.includes(p)
          );
          allAssignedPoints = [...allAssignedPoints, ...validatedResult[matchedTheme.name]];
        }
      });
      
      // For any unassigned points, assign to the theme with fewest points
      const unassignedPoints = points.filter(p => !allAssignedPoints.includes(p));
      unassignedPoints.forEach(point => {
        let minPointsTheme = themes[0].name;
        let minPoints = validatedResult[minPointsTheme].length;
        
        themes.forEach(theme => {
          if (validatedResult[theme.name].length < minPoints) {
            minPointsTheme = theme.name;
            minPoints = validatedResult[theme.name].length;
          }
        });
        
        validatedResult[minPointsTheme].push(point);
      });
      
      return validatedResult;
    } catch (error) {
      console.error('Error in OpenAI categorization:', error);
      
      // Fallback: distribute points evenly between themes
      const result: Record<string, string[]> = {};
      themes.forEach((theme, themeIndex) => {
        const themePoints = points.filter((_, pointIndex) => 
          pointIndex % themes.length === themeIndex
        );
        result[theme.name] = themePoints;
      });
      
      return result;
    }
  }

  /**
   * Normalize text by removing extra whitespace and making it lowercase
   * @param text The text to normalize
   * @returns Normalized text
   */
  private static normalizeText(text: string): string {
    if (!text) return '';
    return text.replace(/\s+/g, ' ').trim().toLowerCase();
  }

  /**
   * Is the given text likely a header?
   * @param text The text to check
   * @returns True if the text is likely a header
   */
  private static isLikelyHeader(text: string): boolean {
    if (!text) return false;
    
    // Headers tend to be short
    if (text.length > 50) return false;
    
    // Headers typically don't contain complete sentences or punctuation
    const hasSentencePunctuation = text.includes('.') || text.includes('?') || text.includes('!');
    const hasComplexStrcture = text.includes(',') && text.length > 20;
    
    return !hasSentencePunctuation && !hasComplexStrcture;
  }
} 