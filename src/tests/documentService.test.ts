/**
 * Tests for DocumentService functionality
 * This file contains tests for the document creation and rendering features
 */
import { DocumentService } from '../services/miro/documentService';
import { MiroFrameService } from '../services/miro/frameService';

/**
 * Test HTML document creation with Firebase Storage
 * This test creates a simple HTML document, uploads it to Firebase Storage, and displays it in Miro
 */
export async function testHtmlDocument(): Promise<void> {
  try {
    console.log('Testing HTML document creation with Firebase Storage...');
    
    // Create a very simple HTML document
    const simpleHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Simple Test Document</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 20px;
          padding: 20px;
          background-color: #f8f9fa;
          color: #333;
        }
        h1 {
          color: #2264d1;
          border-bottom: 1px solid #eee;
          padding-bottom: 10px;
        }
        p {
          line-height: 1.5;
        }
      </style>
    </head>
    <body>
      <h1>Simple Test Document</h1>
      <p>This is a simple test document to diagnose Miro document creation issues.</p>
      <p>Current time: ${new Date().toISOString()}</p>
      <p>This content is rendered as HTML and captured as a screenshot.</p>
    </body>
    </html>
    `;
    
    // Find or create a frame for our test
    let frame = await MiroFrameService.findFrameByTitle('Test-Document-Frame');
    if (!frame) {
      frame = await MiroFrameService.createFrame(
        'Test-Document-Frame',
        0,
        0,
        800,
        600
      );
    }
    
    // Try to upload to Firebase first
    let htmlUrl;
    try {
      // Import the Firebase storage utility
      const { uploadHtmlToFirebase } = await import('../utils/firebase');
      htmlUrl = await uploadHtmlToFirebase(simpleHtml, `test_${Date.now()}.html`);
      console.log('Successfully uploaded to Firebase. Public URL:', htmlUrl);
      
      // Create a sticky note with the URL
      await miro.board.createStickyNote({
        content: `📝 **Document URL:**\n${htmlUrl}\n\nOpen this URL to see the content directly.`,
        x: frame.x - 200,
        y: frame.y - 150,
        width: 300,
        style: {
          fillColor: 'light_yellow'
        }
      });
      
      // Generate a screenshot of the HTML content and add it to the frame
      await DocumentService.generateScreenshot(simpleHtml, frame, { x: frame.x, y: frame.y + 200 });
      
    } catch (uploadError) {
      console.error('Failed to upload HTML to Firebase:', uploadError);
      htmlUrl = null;
    }
    
    // Create a formatted text element with the HTML content
    const formattedContent = `# Simple Test Document
    
    This is a simple test document to diagnose Miro document creation issues.
    
    Current time: ${new Date().toISOString()}
    
    ${htmlUrl ? `URL: ${htmlUrl}` : 'Failed to create URL'}`;
    
    // Create a text element with the formatted content
    const textElement = await miro.board.createText({
      content: formattedContent,
      x: frame.x,
      y: frame.y,
      width: 600,
      style: {
        textAlign: 'left',
        fontSize: 16,
        color: '#1a1a1a'
      }
    });
    
    // Zoom to frame
    await miro.board.viewport.zoomTo(frame);
    
    console.log('Test completed successfully', textElement);
  } catch (error) {
    console.error('Test failed:', error);
    throw error;
  }
}

/**
 * Test thinking process document creation
 * This test creates a document with formatted thinking steps
 */
export async function testThinkingDocument(): Promise<void> {
  try {
    console.log('Testing thinking process document creation...');
    
    const thinkingSteps = [
      'Analyzing the user research data to identify key patterns',
      'Considering the main user pain points: navigation complexity, information overload',
      'Evaluating potential solutions based on technical constraints',
      'Prioritizing accessibility concerns for diverse user groups',
      'Finalizing the design approach with clear next steps'
    ];
    
    const result = await DocumentService.createMiroNativeDocument(
      'Test-Thinking-Document',
      'Designer Thinking Process',
      thinkingSteps,
      { width: 600 }
    );
    
    console.log('Test completed successfully', result);
  } catch (error) {
    console.error('Test failed:', error);
    throw error;
  }
}

/**
 * Test document creation with full HTML content
 * This test creates a document with custom HTML content
 */
export async function testCustomHtmlDocument(): Promise<void> {
  try {
    console.log('Testing custom HTML document creation...');
    
    const customHtml = `
      <h1>Custom Design Document</h1>
      <p>This is a test of the custom HTML document creation feature.</p>
      <ul>
        <li>It supports rich formatting</li>
        <li>It can include lists, tables, and other HTML elements</li>
        <li>It's captured as a screenshot in Miro</li>
      </ul>
      <p>Current time: ${new Date().toLocaleString()}</p>
    `;
    
    const result = await DocumentService.createMiroNativeDocument(
      'Test-Custom-HTML',
      'Custom HTML Document',
      customHtml,
      { width: 650 }
    );
    
    console.log('Test completed successfully', result);
  } catch (error) {
    console.error('Test failed:', error);
    throw error;
  }
}

// Export all tests
export default {
  testHtmlDocument,
  testThinkingDocument,
  testCustomHtmlDocument
}; 