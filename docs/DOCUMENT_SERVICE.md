# Document Service

The Document Service provides functionality for creating and displaying rich documents in Miro boards. This service offers an alternative to simple sticky notes by generating visually appealing, well-formatted documents that can be shared and displayed directly within Miro.

## Overview

The Document Service combines several technologies:

1. **HTML Generation**: Creates styled HTML documents from content
2. **Firebase Storage**: Hosts the HTML files with public access
3. **Screenshot Generation**: Captures visual representations of documents
4. **Miro Integration**: Displays documents in Miro boards with proper formatting

## Architecture

```
┌─────────────────┐     ┌───────────────┐     ┌──────────────┐
│ DocumentService │────►│ Firebase      │────►│ HTML Storage │
└─────────────────┘     │ Storage       │     └──────────────┘
        │               └───────────────┘             ▲
        │                                             │
        ▼                                             │
┌─────────────────┐     ┌───────────────┐     ┌──────────────┐
│ HTML Generation │────►│ Public URL    │────►│ Miro Board   │
└─────────────────┘     └───────────────┘     └──────────────┘
        │                                             ▲
        │                                             │
        ▼                                             │
┌─────────────────┐                          ┌──────────────┐
│ html2canvas     │─────────────────────────►│ Screenshot   │
└─────────────────┘                          └──────────────┘
```

## Key Components

### 1. HTML Generation

The `generateHtmlDocument` method creates styled HTML documents with:
- Custom styling for different content types
- Support for thinking process documents with steps
- Regular document formatting with headers and sections

```typescript
public static generateHtmlDocument(title: string, content: string[] | string): string
```

### 2. Firebase Storage Integration

The Document Service uses Firebase Storage to host the HTML content:

```typescript
// Integrated into firebase.ts
export async function uploadHtmlToFirebase(html: string, fileName?: string): Promise<string>
```

This function:
- Uploads HTML content to Firebase Storage
- Sets proper MIME types and metadata
- Returns a public URL that can be accessed from anywhere

### 3. Screenshot Generation

For visual representation, the service can generate screenshots of HTML content:

```typescript
public static async generateScreenshot(
  htmlContent: string,
  frame: Frame,
  position: { x: number, y: number }
): Promise<void>
```

This uses:
- [html2canvas](https://html2canvas.hertzen.com/) library to render HTML to canvas
- Creates temporary DOM elements for rendering
- Converts the canvas to a data URL
- Uploads the image to Miro

### 4. Miro Document Creation

The main method for creating documents in Miro:

```typescript
public static async createMiroNativeDocument(
  frameTitle: string,
  title: string,
  content: string[] | string,
  options: {
    position?: { x: number, y: number },
    width?: number,
    height?: number 
  } = {}
): Promise<any>
```

This combines all other functionality to:
1. Create or find a frame in Miro
2. Generate HTML content
3. Upload content to Firebase
4. Create a sticky note with a URL to the content
5. Generate and display a screenshot
6. Create formatted text in Miro

## Special Document Types

### Thinking Process Documents

The service provides specialized formatting for thinking process documents which:
- Format each thinking step with proper numbering
- Extract sections and subsections from text
- Apply consistent styling across steps

```typescript
public static async createThinkingProcessDocument(
  frameTitle: string,
  thoughts: string[],
  customStyling: Partial<DocumentStyling> = {}
): Promise<any>
```

### Research Documents

For long-form content, the service offers research document formatting:

```typescript
public static async createResearchDocument(
  frameTitle: string,
  title: string,
  content: string,
  customStyling: Partial<DocumentStyling> = {}
): Promise<any>
```

## Usage

To create a document in Miro:

```typescript
// Import the service
import { DocumentService } from '../services/miro/documentService';

// Create a thinking process document
const thinkingSteps = [
  'Analyzing the user research data to identify key patterns',
  'Considering the main user pain points',
  'Evaluating potential solutions based on technical constraints'
];

const result = await DocumentService.createMiroNativeDocument(
  'Thinking-Process-Frame',
  'Designer Thinking Process',
  thinkingSteps,
  { width: 600 }
);
```

## Styling Options

The service supports customization through the `DocumentStyling` interface:

```typescript
interface DocumentStyling {
  fontSize?: number;
  fontFamily?: string;
  textColor?: string;
  backgroundColor?: string;
  textAlign?: 'left' | 'center' | 'right';
  width?: number;
}
```

## Document Formatting

The document service uses a sophisticated HTML/CSS formatting system optimized for clear information hierarchy and space efficiency.

### Document Width and Layout

- Documents use a maximum width of 1400px for optimal readability on large screens
- Content containers have a minimum width of 800px with responsive behavior
- Screenshots are generated at 1400px width and scaled appropriately for display in Miro

### Content Structure and Hierarchy

The formatting system automatically detects and applies styling to different content elements:

1. **Section Headers** - Identified by:
   - Text with capitalized first words followed by colons
   - Text in **bold** format or wrapped in markdown headers (#)
   - Lines matching common section names (e.g., "User Needs:", "Technical Innovation:")

2. **Content Items** - Any text not identified as a header:
   - Plain text with consistent sizing (0.96em)
   - Properly indented (15px) under their parent section
   - Bullet/number markers automatically removed for clean presentation

### HTML Structure

The generated HTML uses a semantic structure that maintains clarity:

```html
<div class="section-content thinking-step">
  <!-- Section Header -->
  <div class="theme-section">
    <div class="theme-header">User Needs:</div>
  </div>
  
  <!-- Content Items -->
  <div class="content-item">Need spaces for both social gathering and quiet study</div>
  <div class="content-item">Desire areas for relaxation between classes</div>
</div>
```

### CSS Styling

The system applies the following key styles:

```css
body { font-family: Arial, sans-serif; line-height: 1.4; max-width: 1400px; }
.theme-header { font-weight: bold; color: #2980b9; font-size: 1.05em; border-left: 3px solid #3498db; padding-left: 8px; }
.content-item { margin: 3px 0 3px 15px; font-size: 0.96em; color: #333; }
```

This styling ensures:
- Section headers clearly stand out with color and left border accent
- Content items take minimal vertical space while remaining readable
- Proper visual hierarchy is maintained throughout the document

### Best Practices for Content Formatting

When preparing content for the Document Service:

1. Use clear section headers with colons (e.g., "Research Findings:", "User Personas:")
2. Keep content items concise and focused
3. Use lists where appropriate but don't nest them too deeply
4. For thinking process documents, make the first line of each step a clear headline
5. Avoid repeating section headers or creating redundant hierarchy

## Testing

Test functionality is available in the `documentService.test.ts` file, providing:
- Simple HTML document testing
- Thinking process document testing
- Custom HTML document testing

## Implementation Details

- The service uses dynamic imports to load Firebase and html2canvas on demand
- HTML content is sanitized and properly formatted
- Error handling includes fallbacks for failed uploads or rendering
- Screenshots are generated using an offscreen rendering approach

## Security Considerations

- Firebase Storage security rules must be configured to allow uploads
- Public URLs are accessible to anyone with the link
- Consider implementing authentication for production use 