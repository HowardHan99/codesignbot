/**
 * Service for creating and managing document-style text layouts in Miro
 * Provides methods for creating well-formatted text documents instead of sticky notes
 */
import { MiroFrameService } from './frameService';
import { Frame } from '@mirohq/websdk-types';
import BoardTokenManager from '../../utils/boardTokenManager';

interface DocumentStyling {
  fontSize?: number;
  fontFamily?: string;
  textColor?: string;
  backgroundColor?: string;
  textAlign?: 'left' | 'center' | 'right';
  width?: number;
}

interface SectionFormatting {
  useNumbering?: boolean;
  useHeading?: boolean;
  indentLevel?: number;
  bulletStyle?: 'number' | 'bullet' | 'dash' | 'none';
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
    width: 550
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
      console.error('Error creating document:', error);
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
      console.error('Error creating research document:', error);
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
   */
  public static async createThinkingProcessDocument(
    frameTitle: string,
    thoughts: string[],
    customStyling: Partial<DocumentStyling> = {}
  ): Promise<any> {
    try {
      // First, try to create a native Miro document
      try {
        return await this.createMiroNativeDocument(frameTitle, 'Designer Thinking Process', thoughts);
      } catch (docError) {
        console.warn('Failed to create native Miro document, falling back to text box:', docError);
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
          Math.max(800, thoughts.length * 60)
        );
      }
      
      // Process the thinking steps to improve readability
      const formattedThoughts = this.formatThinkingSteps(thoughts);
      
      // Merge default styling with custom styling
      const styling = { ...this.DEFAULT_STYLING, ...customStyling };
      
      // Create the text box
      const textBox = await miro.board.createText({
        content: formattedThoughts,
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
      console.error('Error creating thinking process document:', error);
      throw error;
    }
  }
  
  /**
   * Format thinking steps into well-structured content
   */
  private static formatThinkingSteps(thoughts: string[]): string {
    const lines: string[] = [];
    
    // Add title with brain emoji
    lines.push('🧠 Designer Thinking Process');
    lines.push('');
    lines.push('This document captures the designer\'s internal thought process:');
    lines.push('');
    
    // Process each thinking step
    thoughts.forEach((thought, index) => {
      // Extract sections and structure them
      const sections = this.extractSections(thought);
      
      // Add the main step number
      lines.push(`${index + 1}. ${sections.mainHeading}`);
      
      // Add formatted subsections with proper indentation
      sections.subsections.forEach((subsection, subIndex) => {
        lines.push(`   ${String.fromCharCode(97 + subIndex)}. ${subsection}`);
      });
      
      // Add a spacer between major steps
      lines.push('');
    });
    
    return lines.join('\n');
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
      
      // Process remaining lines as subsections
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line) {
          // Remove any lettering or special characters
          const cleanedLine = line.replace(/^[a-z][\.\)]\s*/i, '').trim();
          result.subsections.push(cleanedLine);
        }
      }
    }
    
    return result;
  }
  
  /**
   * Creates a Miro native document using the Document API via direct REST call
   * This implements the createDocumentItemUsingUrl functionality without requiring the @api/miro-ea package
   */
  public static async createMiroNativeDocument(
    frameTitle: string,
    title: string,
    content: string[] | string,
    options: {
      position?: { x: number, y: number },
      width?: number,
      height?: number 
    } = {}
  ): Promise<any> {
    console.log('Starting alternative document creation process...', { frameTitle, title });
    
    try {
      // Find or create the frame
      let frame = await MiroFrameService.findFrameByTitle(frameTitle);
      console.log('Frame found/created:', frame ? { id: frame.id, title: frame.title } : 'Frame not found');
      
      if (!frame) {
        console.log('Creating new frame with title:', frameTitle);
        frame = await MiroFrameService.createFrame(
          frameTitle,
          -1000,
          0,
          700,
          900
        );
        console.log('New frame created:', { id: frame.id, title: frame.title });
      }
      
      // Generate HTML content
      const htmlContent = this.generateHtmlDocument(title, content);
      console.log('HTML content generated, length:', htmlContent.length);
      
      // Set default position if not provided
      const position = options.position || { x: frame.x, y: frame.y };
      console.log('Using position:', position);
      
      // Try to upload to Firebase first
      let documentUrl;
      
      try {
        // Import and use the Firebase storage utility
        const { uploadHtmlToFirebase } = await import('../../utils/firebase');
        
        documentUrl = await uploadHtmlToFirebase(
          htmlContent, 
          `miro_doc_${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${Date.now()}.html`
        );
        
        console.log('Successfully created Firebase URL for HTML content:', documentUrl);
        
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
        console.error('Failed to create URL via Firebase:', firebaseError);
        documentUrl = null;
      }
      
      // Format the content as plain text for a Miro text element
      let plainTextContent: string;
      
      if (Array.isArray(content)) {
        // If it's an array, format it as a list
        plainTextContent = `# ${title}\n\n`;
        plainTextContent += content.map((item, index) => `${index + 1}. ${item}`).join('\n\n');
      } else {
        // For regular text, just apply basic formatting
        plainTextContent = `# ${title}\n\n${content}`;
      }
      
      if (documentUrl) {
        plainTextContent += `\n\n**Full formatted document:**\n${documentUrl}`;
      }
      
      // Create a text element with the content
      const textElement = await miro.board.createText({
        content: plainTextContent,
        x: position.x,
        y: position.y,
        width: options.width || 600,
        style: {
          textAlign: 'left',
          fontSize: 16,
          color: '#1a1a1a'
        }
      });
      
      // Focus the view on the created elements
      try {
        console.log('Zooming to frame...');
        await miro.board.viewport.zoomTo(frame);
        console.log('Successfully zoomed to frame');
      } catch (zoomError) {
        console.error('Failed to zoom to frame, but elements were created:', zoomError);
        // Don't throw error here, as the elements were created successfully
      }
      
      return textElement;
    } catch (error) {
      console.error('Error in createMiroNativeDocument:', error);
      throw error;
    }
  }
  
  /**
   * Generate an HTML document from the thinking process
   */
  public static generateHtmlDocument(title: string, content: string[] | string): string {
    // For backwards compatibility, if content is an array, treat the first item as subtitle and rest as thinkingSteps
    let subtitle = '';
    let thinkingSteps: string[] = [];
    
    if (Array.isArray(content)) {
      thinkingSteps = content;
    } else {
      // If it's a string, just use it directly
      return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333333;
            padding: 20px;
            background-color: #f9f9f9;
            max-width: 800px;
            margin: 0 auto;
          }
          h1 {
            color: #2264d1;
            font-size: 28px;
            font-weight: 600;
            text-align: center;
            margin-bottom: 10px;
          }
          h2 {
            color: #4d4d4d;
            font-size: 22px;
            margin-top: 30px;
            border-bottom: 1px solid #eaeaea;
            padding-bottom: 8px;
          }
          .content {
            background-color: #ffffff;
            padding: 15px 20px;
            margin: 20px 0;
            border-radius: 8px;
            box-shadow: 0 2px 6px rgba(0,0,0,0.05);
          }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        <div class="content">
          ${content}
        </div>
      </body>
      </html>
      `;
    }
    
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #333333;
          padding: 20px;
          background-color: #f9f9f9;
          max-width: 800px;
          margin: 0 auto;
        }
        h1 {
          color: #2264d1;
          font-size: 28px;
          font-weight: 600;
          text-align: center;
          margin-bottom: 10px;
        }
        h2 {
          color: #4d4d4d;
          font-size: 22px;
          margin-top: 30px;
          border-bottom: 1px solid #eaeaea;
          padding-bottom: 8px;
        }
        h3 {
          color: #2264d1;
          font-size: 18px;
          margin-top: 20px;
          margin-bottom: 10px;
        }
        .subtitle {
          color: #666666;
          font-size: 18px;
          text-align: center;
          margin-bottom: 30px;
          font-style: italic;
        }
        .thinking-step {
          background-color: #ffffff;
          padding: 15px 20px;
          margin: 20px 0;
          border-radius: 8px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.05);
        }
        .step-number {
          display: inline-block;
          width: 28px;
          height: 28px;
          background-color: #2264d1;
          color: white;
          border-radius: 50%;
          text-align: center;
          line-height: 28px;
          margin-right: 10px;
          font-weight: bold;
        }
        .subsection {
          margin-left: 15px;
          margin-top: 8px;
          position: relative;
          padding-left: 20px;
        }
        .subsection:before {
          content: "•";
          color: #2264d1;
          position: absolute;
          left: 0;
          font-weight: bold;
        }
      </style>
    </head>
    <body>
      <h1>${title}</h1>
      <div class="subtitle">Designer Thinking Process</div>
      
      ${thinkingSteps.map((step: string, index: number) => {
        const { mainHeading, subsections } = this.extractSections(step);
        
        return `
        <div class="thinking-step">
          <h3><span class="step-number">${index + 1}</span>${mainHeading}</h3>
          ${subsections.map((subsection: string) => `
            <div class="subsection">${subsection}</div>
          `).join('')}
        </div>
      `}).join('')}
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
      console.log('Generating HTML screenshot...');
      
      // Create a temporary div to render the HTML
      const tempDiv = document.createElement('div');
      tempDiv.style.position = 'absolute';
      tempDiv.style.left = '-9999px';
      tempDiv.style.width = '800px';
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
          width: 800,
          height: tempDiv.offsetHeight
        });
        
        // Convert canvas to data URL
        const dataUrl = canvas.toDataURL('image/png');
        
        // Create an image in Miro
        await miro.board.createImage({
          url: dataUrl,
          x: position.x,
          y: position.y,
          width: 600
        });
        
        console.log('Screenshot added to Miro board');
      } catch (canvasError) {
        console.error('Error generating canvas screenshot:', canvasError);
        
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
      console.error('Error generating screenshot:', error);
      // Don't throw - this is a non-critical feature
    }
  }
} 