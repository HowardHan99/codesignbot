# Miro Integration Guidelines

## Working with Sticky Notes and Frames

### Frame Assignment and Positioning

When creating sticky notes that should appear within a specific frame in Miro, follow these critical guidelines:

1. **Position-Based Frame Assignment**: In the Miro SDK, a sticky note's parent frame is determined **entirely by its position**. There is no API to directly set a sticky note's parent frame (no direct `parentId` assignment).

2. **Coordinate Constraints are Critical**: To ensure a sticky note appears in a frame:
   - The sticky must be positioned **within the frame's bounds**
   - Calculate the frame bounds from its position and dimensions:
     ```javascript
     const frameLeft = frame.x - frame.width/2;
     const frameTop = frame.y - frame.height/2;
     const frameRight = frame.x + frame.width/2;
     const frameBottom = frame.y + frame.height/2;
     ```
   - Position sticky notes with a margin from the frame edges:
     ```javascript
     const margin = 10; // px from frame edge
     const adjustedX = Math.max(
       frameLeft + stickyWidth/2 + margin, 
       Math.min(frameRight - stickyWidth/2 - margin, desiredX)
     );
     ```

3. **Common Errors**:
   - Attempting to change `parentId` after sticky creation doesn't work
   - Using `miro.board.update(sticky, { parentId: frame.id })` fails silently
   - Creating a sticky note outside a frame's bounds and trying to move it afterward often fails

4. **Best Practice**: Use the `StickyNoteService.createStickyWithRelevance()` method which implements the correct positioning logic.

### Example

```javascript
// CORRECT - Position within frame bounds
const sticky = await MiroApiClient.createStickyNote({
  content: "My sticky note",
  x: positionWithinFrameBounds.x,
  y: positionWithinFrameBounds.y,
  width: width,
  style: {
    fillColor: color
  }
});

// INCORRECT - Will not work
await miro.board.update(sticky, { parentId: frame.id });
```

## Design Decisions Caching

To prevent unnecessary API calls and improve performance, the app implements a caching mechanism for design decisions:

1. **Using Cached Data**: Always use `InclusiveDesignCritiqueService.getDesignDecisions()` to retrieve design decisions. This method:
   - Returns cached decisions if they exist and haven't expired
   - Automatically refreshes the cache when needed
   - Provides consistent access across components

2. **Cache Settings**:
   - Default TTL: 60 seconds (configurable in `InclusiveDesignCritiqueService.CACHE_TTL`)
   - Cached in memory during the app session

3. **Example Usage**:

```javascript
// Get design decisions (with caching)
const designDecisions = await InclusiveDesignCritiqueService.getDesignDecisions();

// Use for relevance evaluation
const { category, score } = await RelevanceService.evaluateRelevance(
  point.proposal, 
  designDecisions,
  threshold
);
```

4. **Avoid Direct Fetching**: Don't use the following as it bypasses the cache:
```javascript
// AVOID - Bypasses cache
const designDecisions = await StickyNoteService.getStickiesFromNamedFrame(
  ConfigurationService.getFrameConfig().names.designDecision
);
```

## Unified Sticky Note Creation API

The application uses a unified API for creating sticky notes to ensure consistency and maintainability. This was implemented to remove duplicate code across multiple components.

### Core Method: `createStickyNotesFromPoints`

Always use the unified method in `StickyNoteService` to create sticky notes from processed points:

```typescript
await StickyNoteService.createStickyNotesFromPoints(
  frameName,        // Name of the frame to place sticky notes in
  processedPoints,  // Array of ProcessedDesignPoint objects
  mode,             // 'decision' or 'response'
  designDecisions,  // Optional - array of design decisions for relevance evaluation
  relevanceThreshold // Optional - threshold for relevance calculation
);
```

This method handles:
1. Finding or creating the target frame
2. Evaluating the relevance of points (if not already evaluated)
3. Creating sticky notes with proper positioning
4. Adding appropriate delays between creations to avoid rate limiting

### Flow of Sticky Note Creation

The process follows this pattern:
1. Points are processed from input (transcription, file upload, etc.)
2. Points are converted to `ProcessedDesignPoint` objects
3. The unified method handles frame management and positioning
4. Each sticky is positioned correctly within frame bounds
5. The method ensures consistent delay between API calls

## Architecture and Service Layer

The application follows a layered architecture with specialized services:

### Service Hierarchy

1. **MiroService**: Facade for Miro operations (uses other specialized services)
2. **StickyNoteService**: Handles sticky note creation and positioning
3. **MiroApiClient**: Provides direct API calls to Miro with error handling
4. **ConfigurationService**: Manages application configuration
5. **InclusiveDesignCritiqueService**: Handles critique generation and caching of design decisions
6. **RelevanceService**: Evaluates the relevance of content to design decisions

### Facade Pattern Implementation

The `MiroService` acts as a facade to simplify interactions with more specialized services:

```typescript
// CORRECT: Use the facade for high-level operations
await MiroService.createStickiesFromPoints(points, frameName);

// AVOID: Bypassing the facade for operations it handles
// This duplicates functionality and may miss important logic
```

### API Client and Error Handling

All API calls use the `MiroApiClient` with standardized error handling:

1. All API calls use the `safeApiCall` utility function
2. Retry logic is implemented for API operations
3. Consistent delay is applied between calls to avoid rate limiting
4. Detailed error logging is provided

Example:
```typescript
// Inside a service method:
return await safeApiCall<ReturnType>(
  async () => {
    // API call logic here
  },
  fallbackValue,
  'Operation Name',
  { contextInfo }
);
```

## Component Integration with Services

UI components should follow these guidelines when integrating with services:

### VoiceRecorder Component

The `VoiceRecorder` component handles voice recording and transcription:

1. Uses `VoiceRecordingService` to manage recording state
2. Processes transcripts with `TranscriptProcessingService`
3. Creates sticky notes using `StickyNoteService.createStickyNotesFromPoints`
4. Fetches design decisions via `InclusiveDesignCritiqueService.getDesignDecisions()`

Best practice:
```typescript
// Get cached design decisions for relevance calculation
const designDecisions = await InclusiveDesignCritiqueService.getDesignDecisions();

// Use the unified method to create sticky notes
await StickyNoteService.createStickyNotesFromPoints(
  "Thinking-Dialogue",
  processedPoints,
  'decision',
  designDecisions
);
```

### FileUploadTest Component

The `FileUploadTest` component handles file upload and processing:

1. Transcribes audio files with `ApiService`
2. Processes transcripts in chunks
3. Creates sticky notes using `StickyNoteService.createStickyNotesFromPoints`
4. Manages user progress indication and cancellation

Important:
```typescript
// Always check for stop requests before expensive operations
if (stopRequestedRef.current) {
  console.log(`Stop requested, aborting`);
  return;
}
```

### SendtoBoard Component

The `SendtoBoard` component sends responses to the Miro board:

1. Converts string responses to `ProcessedDesignPoint` objects
2. Creates sticky notes using `StickyNoteService.createStickyNotesFromPoints`
3. Zooms to the created frame

## Configuration and Frame Management

### Frame Configuration

Frames are configured in `config.ts` and accessed via `ConfigurationService`:

```typescript
const frameConfig = ConfigurationService.getFrameConfig();
const frameName = frameConfig.names.thinkingDialogue;
```

Key frame names:
- `designDecision`: 'Design-Proposal'
- `thinkingDialogue`: 'Thinking-Dialogue'
- `realTimeResponse`: 'Real-time-response'

### Frame Creation and Finding

Always use `StickyNoteService.ensureFrameExists(frameName)` to find or create frames:

```typescript
const frame = await StickyNoteService.ensureFrameExists(frameName);
if (!frame) {
  console.error(`Failed to get or create frame: ${frameName}`);
  return;
}
```

## Adding New Features

When adding new features that interact with Miro:

1. **Use Existing Services**: Avoid direct API calls; use the service layer
2. **Follow Patterns**: Use the unified sticky note creation API
3. **Update Documentation**: Document any new patterns or edge cases
4. **Respect Rate Limits**: Always include delays between API calls

Example of adding a new feature:
```typescript
// In a component or service
async function myNewFeature() {
  // Get cached design decisions
  const designDecisions = await InclusiveDesignCritiqueService.getDesignDecisions();
  
  // Process points
  const processedPoints = someProcessingLogic();
  
  // Create sticky notes using the unified API
  await StickyNoteService.createStickyNotesFromPoints(
    'My-Frame-Name',
    processedPoints,
    'decision',
    designDecisions
  );
}
```

## Common Pitfalls and Debugging

### Sticky Notes Appearing in Wrong Frames

If sticky notes appear in the wrong frame:
1. Check the coordinates being used are within frame bounds
2. Verify the frame ID being used
3. Ensure margins are respected (30px minimum recommended)
4. Look for parentId warnings in console logs

### Performance Issues

If you experience performance issues:
1. Check that you're using the caching mechanism for design decisions
2. Verify appropriate delays between API calls
3. Consider batching operations where possible
4. Look for unnecessary re-renders or redundant API calls

### Debug Logging

The application uses extensive debug logging. Enable Chrome DevTools console to see:
1. Frame creation and lookup operations
2. Sticky note creation and positioning
3. API call timings and results
4. Error details and stack traces

## Advanced Miro Functionality

### Working with Connectors

When creating connections between sticky notes:
1. First create all sticky notes
2. Then retrieve them from the frame
3. Create connections with appropriate delay

```typescript
// Example from MiroService.createStickiesFromPoints
// Get all stickies in the frame
const frameStickies = await MiroApiClient.getStickiesInFrame(frame.id);

// Create a map of content to sticky
const stickiesMap = new Map<string, any>();
for (const sticky of frameStickies) {
  stickiesMap.set(sticky.content, sticky);
}

// Create connections
for (const connection of existingConnections) {
  const fromSticky = stickiesMap.get(connection.from);
  const toSticky = stickiesMap.get(connection.to);
  
  if (fromSticky && toSticky) {
    // Create connector
  }
}
``` 