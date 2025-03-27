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