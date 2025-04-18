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