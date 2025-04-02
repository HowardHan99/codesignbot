# Retrieving Items from Miro Frames

## Overview

This document explains the approach used in our application to retrieve items (sticky notes, text, shapes, etc.) from Miro frames. Understanding this process is important for interacting with Miro boards, especially when working with design data organized in frames.

## Key Concepts

### Coordinate-Based Positioning

Miro originally used a parent-child relationship (`parentId` property) to track which items belonged to which frames. However, this approach had limitations and is now considered deprecated in some contexts. 

Our application uses a **coordinate-based approach** to determine frame membership, which is more reliable and works across different Miro versions.

### Frame Boundaries

Every Miro frame has:
- A center position (`x`, `y`)
- Dimensions (`width`, `height`)

From these properties, we can calculate the frame's boundaries:
```typescript
const frameBounds = {
  left: frame.x - frame.width / 2,
  right: frame.x + frame.width / 2,
  top: frame.y - frame.height / 2,
  bottom: frame.y + frame.height / 2
};
```

### Item Containment

An item is considered "within" a frame if its center position (`x`, `y`) is within the frame's boundaries.

## Implementation

### Helper Function

The `MiroFrameService` class provides a helper method to check if an item is within a frame:

```typescript
/**
 * Checks if an item is within a frame's bounds
 * @param item The Miro item to check
 * @param frame The frame to check against
 * @returns True if the item is within the frame's bounds
 */
public static isItemInFrame(item: any, frame: Frame): boolean {
  // Calculate frame boundaries
  const frameLeft = frame.x - frame.width / 2;
  const frameRight = frame.x + frame.width / 2;
  const frameTop = frame.y - frame.height / 2;
  const frameBottom = frame.y + frame.height / 2;
  
  // Check if the item's center is within the frame's bounds
  return (
    item.x >= frameLeft &&
    item.x <= frameRight &&
    item.y >= frameTop &&
    item.y <= frameBottom
  );
}
```

### Generic Retrieval Function

For retrieving items of any type within a frame:

```typescript
/**
 * Gets all items of specified types within a frame using spatial bounds
 * @param frame The frame to get items for
 * @param types Array of item types to retrieve (e.g., ['text', 'shape', 'sticky_note'])
 * @returns Array of items that are within the frame's bounds
 */
public static async getItemsWithinFrame<T = any>(
  frame: Frame,
  types: string[] = ['sticky_note', 'text', 'shape', 'connector']
): Promise<T[]> {
  try {
    // Get all items of the specified types
    const allItems = await miro.board.get({ type: types });
    
    // Filter items that are within the frame's bounds
    const itemsInFrame = allItems.filter(item => this.isItemInFrame(item, frame));
    
    return itemsInFrame as T[];
  } catch (error) {
    console.error(`Error getting items within frame ${frame.title}:`, error);
    return [] as T[];
  }
}
```

## Usage Examples

### Finding Text Elements in a Frame

```typescript
// Find a frame by title
const frame = await MiroFrameService.findFrameByTitle('My Frame');
if (frame) {
  // Get all text elements within the frame
  const textElements = await MiroFrameService.getItemsWithinFrame(frame, ['text']);
  console.log(`Found ${textElements.length} text elements in the frame`);
}
```

### Finding Multiple Item Types

```typescript
// Get both sticky notes and shapes in one call
const items = await MiroFrameService.getItemsWithinFrame(frame, ['sticky_note', 'shape']);
```

### Position-Based Filtering

Sometimes you need to filter items further based on their position within the frame:

```typescript
// Example: Find items in the top half of a frame
const frame = await MiroFrameService.findFrameByTitle('My Frame');
const allItems = await MiroFrameService.getItemsWithinFrame(frame);

const topHalfItems = allItems.filter(item => {
  const frameTop = frame.y - frame.height / 2;
  const frameMidpoint = frameTop + (frame.height / 2);
  return item.y < frameMidpoint;
});
```

## Best Practices

1. **Batch Requests**: Minimize the number of API calls by getting multiple item types at once.

2. **Type Safety**: Use TypeScript generics to ensure type safety when working with specific item types:
   ```typescript
   const shapes = await MiroFrameService.getItemsWithinFrame<Shape>(frame, ['shape']);
   ```

3. **Error Handling**: Always include error handling when working with the Miro API.

4. **Logging**: Include detailed logging to help diagnose issues with item retrieval.

5. **Caching**: Consider caching frame contents if you need to reference them multiple times in quick succession.

## Applying to Design Themes

The application uses this approach to retrieve design themes from a dedicated frame:

1. Find the theme frame by title ('Antagonistic-Response')
2. Get all text elements and shapes within the frame
3. Filter text elements to identify theme headers based on their position
4. Match each header with its corresponding colored shape
5. Extract theme information from these matched items

This spatial organization allows users to visually organize themes while our application can reliably retrieve them using coordinate-based positioning. 