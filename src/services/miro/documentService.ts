/**
 * Service for creating and managing document-style text layouts in Miro
 * Provides methods for creating well-formatted text documents instead of sticky notes
 */
import { MiroFrameService } from './frameService';
import { Frame } from '@mirohq/websdk-types';
import BoardTokenManager from '../../utils/boardTokenManager';
import { Logger } from '../../utils/logger';

// Log context for this service
const LOG_CONTEXT = 'DOCUMENT-SERVICE';

interface DocumentStyling {
  fontSize?: number;
  fontFamily?: string;
  textColor?: string;
  backgroundColor?: string;
  textAlign?: 'left' | 'center' | 'right';
  width?: number;
}


export class DocumentService {
  /**
   * Default styling for documents
   */
  private static readonly DEFAULT_STYLING: DocumentStyling = {
    fontSize: 16,
    fontFamily: 'open_sans',
    textColor: '#1a1a1a',
    backgroundColor: '#ffffff',
    textAlign: 'left',
    width: 1300
  };

  /**
   * Creates a well-formatted document in a Miro frame
   * 
   * @param frameTitle The title of the frame to create the document in
   * @param title The title of the document
   * @param subtitle Optional subtitle for the document
   * @param sections Array of content sections to include
   * @param customStyling Optional custom styling for the document
   * @returns The created text object
   */
  public static async createDocument(
    frameTitle: string,
    title: string,
    subtitle: string | null,
    sections: { heading?: string, content: string[] }[],
    customStyling: Partial<DocumentStyling> = {}
  ): Promise<any> {
    try {
      // Find or create the frame
      let frame = await MiroFrameService.findFrameByTitle(frameTitle);
      
      if (!frame) {
        // Create a new frame if it doesn't exist
        frame = await MiroFrameService.createFrame(
          frameTitle,
          -1000, // Default X position
          0,     // Default Y position
          600,   // Default width
          800    // Default height, will be adjusted later
        );
      }
      
      // Merge default styling with custom styling
      const styling = { ...this.DEFAULT_STYLING, ...customStyling };
      
      // Generate formatted content
      const formattedText = this.formatDocumentContent(title, subtitle, sections);
      
      // Adjust frame height based on content length if necessary
      // Estimate ~15px per line of text
      const estimatedLines = formattedText.split('\n').length;
      const estimatedHeight = Math.max(800, estimatedLines * 18); 
      
      // Resize frame if needed
      if (estimatedHeight > frame.height) {
        // Create a new frame with adjusted height instead of using setFrameStyle
        await MiroFrameService.createFrame(
          frameTitle,
          frame.x,
          frame.y,
          frame.width,
          estimatedHeight
        );
        
        // Refetch the frame after updating
        frame = await MiroFrameService.findFrameByTitle(frameTitle) || frame;
      }
      
      // Create the text box
      const textBox = await miro.board.createText({
        content: formattedText,
        x: frame.x,
        y: frame.y,
        width: styling.width,
        style: {
          textAlign: styling.textAlign,
          fontSize: styling.fontSize,
          color: styling.textColor,
          // Properly type fontFamily for Miro API
          fontFamily: this.mapFontFamily(styling.fontFamily)
        }
      });
      
      // Focus on the created document
      await miro.board.viewport.zoomTo(textBox);
      
      return textBox;
    } catch (error) {
      Logger.error(LOG_CONTEXT, 'Error creating document:', error);
      throw error;
    }
  }
  
  /**
   * Maps a font family string to the appropriate Miro font family type
   */
  private static mapFontFamily(fontFamily?: string): 'open_sans' | 'arial' | 'roboto' | undefined {
    if (!fontFamily) return undefined;
    
    switch (fontFamily.toLowerCase()) {
      case 'open_sans':
        return 'open_sans';
      case 'arial':
        return 'arial';  
      case 'roboto':
        return 'roboto';
      default:
        return 'open_sans'; // Default to open_sans if not recognized
    }
  }
  
  /**
   * Format content into a well-structured document
   */
  private static formatDocumentContent(
    title: string, 
    subtitle: string | null, 
    sections: { heading?: string, content: string[] }[]
  ): string {
    const lines: string[] = [];
    
    // Add title with emoji
    lines.push(`📝 ${title}`);
    lines.push('');
    
    // Add subtitle if provided
    if (subtitle) {
      lines.push(subtitle);
      lines.push('');
    }
    
    // Add each section with proper formatting
    sections.forEach((section, sectionIndex) => {
      // Add section heading if provided
      if (section.heading) {
        lines.push(`## ${section.heading}`);
        lines.push('');
      }
      
      // Add formatted content
      section.content.forEach((item, itemIndex) => {
        // Format as numbered list item
        lines.push(`${sectionIndex + 1}.${itemIndex + 1}. ${item}`);
      });
      
      // Add spacing between sections
      lines.push('');
    });
    
    return lines.join('\n');
  }
  
  /**
   * Creates a research document with proper formatting for long-form content
   */
  public static async createResearchDocument(
    frameTitle: string,
    title: string,
    content: string,
    customStyling: Partial<DocumentStyling> = {}
  ): Promise<any> {
    try {
      // Find or create the frame
      let frame = await MiroFrameService.findFrameByTitle(frameTitle);
      
      if (!frame) {
        frame = await MiroFrameService.createFrame(
          frameTitle,
          -1000,
          0,
          700,
          900
        );
      }
      
      // Merge default styling with custom styling
      const styling = { ...this.DEFAULT_STYLING, ...customStyling };
      
      // Process the content to improve readability
      const formattedContent = this.formatLongFormContent(content);
      
      // Create the text box
      const textBox = await miro.board.createText({
        content: `📝 ${title}\n\n${formattedContent}`,
        x: frame.x,
        y: frame.y,
        width: styling.width,
        style: {
          textAlign: styling.textAlign,
          fontSize: styling.fontSize,
          color: styling.textColor,
          fontFamily: this.mapFontFamily(styling.fontFamily)
        }
      });
      
      // Focus on the created document
      await miro.board.viewport.zoomTo(textBox);
      
      return textBox;
    } catch (error) {
      Logger.error(LOG_CONTEXT, 'Error creating research document:', error);
      throw error;
    }
  }
  
  /**
   * Format long-form content to improve readability
   */
  private static formatLongFormContent(content: string): string {
    // Split content into paragraphs
    const paragraphs = content.split(/\n\s*\n/);
    
    // Format each paragraph
    const formattedParagraphs = paragraphs.map(paragraph => {
      // Check if this is a numbered point (starting with a number followed by period)
      if (/^\d+\./.test(paragraph)) {
        return paragraph.trim(); // Keep numbering as is
      }
      
      // Check if this is a section heading (contains ## or is short and ends with :)
      if (paragraph.includes('##') || (paragraph.length < 50 && paragraph.endsWith(':'))) {
        return `\n## ${paragraph.replace('##', '').trim()}\n`;
      }
      
      // Clean up spacing and formatting for regular paragraphs
      return paragraph
        .replace(/\s+/g, ' ')  // Normalize whitespace
        .replace(/(\d+)\.\s+/g, '\n$1. ') // Put numbers at start of lines
        .replace(/\s*-\s*/g, '\n• ') // Convert dashes to bullet points
        .trim();
    });
    
    // Join paragraphs with double line breaks for spacing
    return formattedParagraphs.join('\n\n');
  }
  
  /**
   * Creates a thinking process document specifically for designer thinking
   * Note: This might be used as a fallback if createMiroNativeDocument fails.
   */
  public static async createThinkingProcessDocument(
    frameTitle: string,
    thoughts: string[],
    customStyling: Partial<DocumentStyling> = {}
  ): Promise<any> {
    try {
      // No direct call to createMiroNativeDocument here to avoid loops
      Logger.warn(LOG_CONTEXT, 'Using fallback createThinkingProcessDocument (TextBox method)');
      
      // Find or create the frame
      let frame = await MiroFrameService.findFrameByTitle(frameTitle);
      
      if (!frame) {
        frame = await MiroFrameService.createFrame(
          frameTitle,
          -1000,
          0,
          650,
          Math.max(800, thoughts.length * 60)
        );
      }
      
      // Process the thinking steps to improve readability
      // Use a generic title as proposals might be mixed in during fallback
      const formattedContent = this.formatCombinedContent(thoughts, 'Designer Output');
      
      // Merge default styling with custom styling
      const styling = { ...this.DEFAULT_STYLING, ...customStyling };
      
      // Create the text box
      const textBox = await miro.board.createText({
        content: formattedContent,
        x: frame.x,
        y: frame.y,
        width: styling.width || 600,
        style: {
          textAlign: styling.textAlign || 'left',
          fontSize: styling.fontSize || 16,
          color: styling.textColor || '#1a1a1a',
          fontFamily: this.mapFontFamily(styling.fontFamily)
        }
      });
      
      // Focus on the created document
      await miro.board.viewport.zoomTo(textBox);
      
      return textBox;
    } catch (error) {
      Logger.error(LOG_CONTEXT, 'Error creating thinking process document (fallback TextBox method):', error);
      throw error;
    }
  }
  
  /**
   * Format combined thinking/proposal steps into well-structured content for TextBox fallback
   */
  private static formatCombinedContent(content: string[], title: string): string {
    const lines: string[] = [];
    
    lines.push(title); // Use generic title
    lines.push('');
    
    let currentSection = '';
    content.forEach((item) => {
      const trimmedItem = item.trim();
      // Check for section headers we added in the service
      if (trimmedItem.startsWith('## 🧠')) {
        currentSection = 'thinking';
        lines.push('## Thinking Process (High-Level Themes)'); // Updated header to indicate themes
        lines.push('');
      } else if (trimmedItem.startsWith('## 💡')) {
        currentSection = 'proposals';
        lines.push('## Brainstorming Proposals'); // Clean header
        lines.push('');
      } else if (trimmedItem === '---') {
        lines.push(''); // Add spacing for separator
      } else if (trimmedItem.length > 0) {
        if (currentSection === 'thinking') {
          // In simplified mode, each item is a theme
          lines.push(`• ${trimmedItem}`);
        } else if (currentSection === 'proposals') {
          // For proposals, keep them as is
          lines.push(`• ${trimmedItem}`); 
        } else {
          // Default formatting for any other content
          lines.push(`• ${trimmedItem}`);
        }
      }
    });
    
    return lines.join('\n');
  }
  
  /**
   * Creates a brainstorming proposals document with multiple design concepts
   */
  public static async createBrainstormingProposalsDocument(
    frameTitle: string,
    proposals: string[],
    customStyling: Partial<DocumentStyling> = {}
  ): Promise<any> {
    try {
      // First, try to create a native Miro document
      try {
        return await this.createMiroNativeDocument(frameTitle, 'Design Concept Proposals', proposals);
      } catch (docError) {
        Logger.warn(LOG_CONTEXT, 'Failed to create native Miro document for brainstorming, falling back to text box:', docError);
      }
      
      // Fall back to text box if native document API fails
      // Find or create the frame
      let frame = await MiroFrameService.findFrameByTitle(frameTitle);
      
      if (!frame) {
        frame = await MiroFrameService.createFrame(
          frameTitle,
          -1000,
          0,
          650,
          Math.max(800, proposals.length * 150) // More space for each proposal
        );
      }
      
      // Process the proposals to improve readability
      const formattedProposals = this.formatBrainstormingProposals(proposals);
      
      // Merge default styling with custom styling
      const styling = { ...this.DEFAULT_STYLING, ...customStyling };
      
      // Create the text box
      const textBox = await miro.board.createText({
        content: formattedProposals,
        x: frame.x,
        y: frame.y,
        width: styling.width || 600,
        style: {
          textAlign: styling.textAlign || 'left',
          fontSize: styling.fontSize || 16,
          color: styling.textColor || '#1a1a1a',
          fontFamily: this.mapFontFamily(styling.fontFamily)
        }
      });
      
      // Focus on the created document
      await miro.board.viewport.zoomTo(textBox);
      
      return textBox;
    } catch (error) {
      Logger.error(LOG_CONTEXT, 'Error creating brainstorming proposals document:', error);
      throw error;
    }
  }
  
  /**
   * Format brainstorming proposals into well-structured content
   */
  private static formatBrainstormingProposals(proposals: string[]): string {
    const lines: string[] = [];
    
    // Add title with lightbulb emoji
    lines.push('💡 Design Concept Proposals');
    lines.push('');
    lines.push('Multiple design approaches to address the challenge:');
    lines.push('');
    
    // Process each proposal
    proposals.forEach((proposal, index) => {
      // Format the concept as a section with proper styling
      
      // Check if the proposal already has a heading (##, Concept:, etc.)
      const hasHeading = /^(##|\s*Concept|\s*Design Concept|\s*Approach)\s*/i.test(proposal);
      
      if (hasHeading) {
        // If it already has a heading, just number it
        lines.push(`Concept ${index + 1}: ${proposal.replace(/^(##|\s*Concept|\s*Design Concept|\s*Approach)\s*/i, '')}`);
      } else {
        // Otherwise add a heading
        lines.push(`Concept ${index + 1}:`);
        lines.push(proposal);
      }
      
      // Add a spacer between concepts
      lines.push('');
      lines.push('---');
      lines.push('');
    });
    
    return lines.join('\n');
  }

  /**
   * Creates a Miro native document using the Document API via direct REST call (if available)
   * or falls back to other methods.
   */
  public static async createMiroNativeDocument(
    frameTitle: string,
    title: string,
    content: string[], // Expects combined content with headers
    options: {
      position?: { x: number, y: number },
      width?: number,
      height?: number 
    } = {}
  ): Promise<any> {
    Logger.log(LOG_CONTEXT, 'Starting native document creation process...', { frameTitle, title });
    
    try {
      // Find or create frame (logic remains the same)
      let frame = await MiroFrameService.findFrameByTitle(frameTitle);
      Logger.log(LOG_CONTEXT, 'Frame found/created:', frame ? { id: frame.id, title: frame.title } : 'Frame not found');
      
      if (!frame) {
        Logger.log(LOG_CONTEXT, 'Creating new frame with title:', frameTitle);
        frame = await MiroFrameService.createFrame(
          frameTitle,
          -1000,
          0,
          1500,
          900
        );
        Logger.log(LOG_CONTEXT, 'New frame created:', { id: frame.id, title: frame.title });
      }
      
      // Generate HTML content using the updated helper
      const htmlContent = this.generateHtmlDocument(title, content); // Pass combined content
      Logger.log(LOG_CONTEXT, 'HTML content generated, length:', htmlContent.length);
      
      // Set default position if not provided
      const position = options.position || { x: frame.x, y: frame.y };
      Logger.log(LOG_CONTEXT, 'Using position:', position);
      
      let documentUrl;
      try {
        const { uploadHtmlToFirebase } = await import('../../utils/firebase');
        documentUrl = await uploadHtmlToFirebase(
          htmlContent, 
          `miro_doc_${title.replace(/[^a-z0-9]/gi, '').toLowerCase()}_${Date.now()}.html`
        );
        Logger.log(LOG_CONTEXT, 'Successfully created Firebase URL for HTML content:', documentUrl);
        
        // Create a sticky note with the URL
        await miro.board.createStickyNote({
          content: `📝 **Document URL:**\n${documentUrl}\n\nOpen this URL to see the full formatted document.`,
          x: position.x - 200,
          y: position.y - 150,
          width: 300,
          style: {
            fillColor: 'light_yellow'
          }
        });
        
        // Generate a screenshot of the HTML content and add it to the frame
        await this.generateScreenshot(htmlContent, frame, { x: position.x, y: position.y + 300 });
      } catch (firebaseError) {
        Logger.error(LOG_CONTEXT, 'Failed to create URL via Firebase:', firebaseError);
        documentUrl = null;
      }
      
      // Format content as plain text for Miro text element (fallback display)
      const plainTextContent = this.formatCombinedContent(content, title); // Use helper
      
      // Create a text element with the content
      const textElement = await miro.board.createText({
        content: plainTextContent,
        x: position.x,
        y: position.y,
        width: options.width || 1400,
        style: {
          textAlign: 'left',
          fontSize: 16,
          color: '#1a1a1a'
        }
      });
      
      // Focus the view on the created elements
      try {
        Logger.log(LOG_CONTEXT, 'Zooming to frame...');
        await miro.board.viewport.zoomTo(frame);
        Logger.log(LOG_CONTEXT, 'Successfully zoomed to frame');
      } catch (zoomError) {
        Logger.error(LOG_CONTEXT, 'Failed to zoom to frame, but elements were created:', zoomError);
        // Don't throw error here, as the elements were created successfully
      }
      
      return textElement;
    } catch (error) {
      Logger.error(LOG_CONTEXT, 'Error in createMiroNativeDocument:', error);
      throw error;
    }
  }
  
  /**
   * Generate an HTML document from combined thinking/proposal content
   */
  public static generateHtmlDocument(title: string, content: string[]): string {
    let htmlBody = '';
    let currentSection = '';
    let currentTheme = '';

    content.forEach((item, index) => {
      const trimmedItem = item.trim();
      
      // Check for main section headers first
      if (trimmedItem.startsWith('## 🧠')) {
        currentSection = 'thinking';
        htmlBody += `<h2>${trimmedItem.replace('## ', '')}</h2>\n<div class="section-content thinking-themes">`; // Start thinking section div
      } else if (trimmedItem.startsWith('## 💡')) {
        if (currentSection === 'thinking') htmlBody += `</div>`; // Close previous section div
        currentSection = 'proposals';
        htmlBody += `<h2>${trimmedItem.replace('## ', '')}</h2>\n<div class="section-content proposal-item">`; // Start proposal section div
      } else if (trimmedItem === '---') {
        htmlBody += `<hr>`;
      } else if (trimmedItem.length > 0) {
        if (currentSection === 'thinking') {
          // In simplified mode, all items in thinking section are themes
          htmlBody += `<div class="theme-bubble">${trimmedItem}</div>`;
        } else if (currentSection === 'proposals') {
          // Format proposals (e.g., as distinct blocks)
          htmlBody += `<div class="proposal">${trimmedItem.replace(/\n/g, '<br>')}</div>`;
        } else {
          // Content before the first section header (should ideally not happen with new structure)
          htmlBody += `<p>${trimmedItem.replace(/\n/g, '<br>')}</p>`;
        }
      }
    });
    
    if (currentSection) htmlBody += `</div>`; // Close the last section div

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.4; margin: 20px; max-width: 1400px; }
        h1 { color: #2c3e50; font-size: 28px; margin-bottom: 15px; }
        h2 { color: #3498db; font-size: 22px; margin-top: 25px; border-bottom: 1px solid #eee; padding-bottom: 5px; }
        .section-content { background-color: #ffffff; padding: 12px 15px; margin: 12px 0; border-radius: 8px; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
        .thinking-themes { display: flex; flex-wrap: wrap; justify-content: flex-start; gap: 12px; }
        .theme-bubble { 
          background-color: #e8f4fc; 
          color: #2980b9; 
          border-radius: 20px; 
          padding: 8px 15px; 
          margin: 5px 0; 
          display: inline-block;
          font-size: 0.95em;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
        .proposal-item .proposal { margin-bottom: 15px; padding: 10px; background-color: #fdf9e8; border-left: 3px solid #f1c40f; border-radius: 4px; }
        hr { border: none; border-top: 1px solid #eee; margin: 15px 0; }
      </style>
    </head>
    <body>
      <h1>${title}</h1>
      ${htmlBody}
    </body>
    </html>
    `;
    return html;
  }

  /**
   * Generates a screenshot of HTML content and adds it to a Miro frame
   * @param htmlContent The HTML content to render
   * @param frame The frame to add the screenshot to
   * @param position Position for the screenshot
   */
  public static async generateScreenshot(
    htmlContent: string,
    frame: Frame,
    position: { x: number, y: number }
  ): Promise<void> {
    try {
      Logger.log(LOG_CONTEXT, 'Generating HTML screenshot...');
      
      // Create a temporary div to render the HTML
      const tempDiv = document.createElement('div');
      tempDiv.style.position = 'absolute';
      tempDiv.style.left = '-9999px';
      tempDiv.style.width = '1400px';
      tempDiv.style.height = 'auto';
      tempDiv.style.backgroundColor = 'white';
      tempDiv.innerHTML = htmlContent;
      
      // Add the div to the body
      document.body.appendChild(tempDiv);
      
      // Give the browser a moment to render
      await new Promise(resolve => setTimeout(resolve, 100));
      
      try {
        // Try to load html2canvas dynamically
        const html2canvasModule = await import('html2canvas');
        const html2canvas = html2canvasModule.default;
        
        // Capture the rendered HTML as a canvas
        const canvas = await html2canvas(tempDiv, {
          backgroundColor: 'white',
          scale: 2, // Higher quality
          logging: false,
          width: 1400,
          height: tempDiv.offsetHeight
        });
        
        // Convert canvas to data URL
        const dataUrl = canvas.toDataURL('image/png');
        
        // Create an image in Miro
        await miro.board.createImage({
          url: dataUrl,
          x: position.x,
          y: position.y,
          width: 1200
        });
        
        Logger.log(LOG_CONTEXT, 'Screenshot added to Miro board');
      } catch (canvasError) {
        Logger.error(LOG_CONTEXT, 'Error generating canvas screenshot:', canvasError);
        
        // Fallback: Create a placeholder image with text explaining the issue
        await miro.board.createText({
          content: '📷 **Screenshot could not be generated**\n\nThe html2canvas library is required. Please add it to your project:\n```\nnpm install html2canvas\n```',
          x: position.x,
          y: position.y,
          width: 300,
          style: {
            textAlign: 'center',
            fontSize: 14,
            color: '#d13438'
          }
        });
      }
      
      // Remove the temporary div
      document.body.removeChild(tempDiv);
      
    } catch (error) {
      Logger.error(LOG_CONTEXT, 'Error generating screenshot:', error);
      // Don't throw - this is a non-critical feature
    }
  }

  /**
   * Extracts sections from a thinking step
   */
  private static extractSections(text: string | any): { mainHeading: string, subsections: string[] } {
    // Default result structure
    const result = {
      mainHeading: 'Thinking Step',
      subsections: [] as string[]
    };
    
    if (!text || typeof text !== 'string') return result;
    
    // Split by lines
    const lines = text.split('\n');
    
    // If there's at least one line, use it as the main heading
    if (lines.length > 0) {
      // Remove any numbering or special characters from the first line
      result.mainHeading = lines[0].replace(/^\d+[\.\)]\s*/, '').trim();
      
      // Collect all subsections into a single array
      const subsectionText: string[] = [];
      
      // Process remaining lines as subsections
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line) {
          // Remove any lettering or special characters
          const cleanedLine = line.replace(/^[a-z][\.\)]\s*/i, '').trim();
          subsectionText.push(cleanedLine);
        }
      }
      
      // Group related subsections together
      if (subsectionText.length > 0) {
        result.subsections = subsectionText;
      }
    }
    
    return result;
  }
} 