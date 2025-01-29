'use client';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';

const AntagoInteract = dynamic(() => import('./AntagoInteract'), { 
  ssr: false 
});

interface SerializedBoard {
  id: string;
  name: string;
}

interface BoardDisplayProps {
  boards: SerializedBoard[];
}

interface StickyNote {
  id: string;
  content: string;
}

interface ResponseMap {
  [key: string]: string; // Maps sticky note ID to its response
}

interface MainBoardProps {
  showAnalysis: boolean;
  isAnalyzing: boolean;
  onAnalysisClick: () => void;
  onAnalysisComplete: () => void;
  onResponsesUpdate: (responses: string[]) => void;
}

// Constants for timing
const DEBOUNCE_DELAY = 5000; // Increased to 5 seconds
const UPDATE_INTERVAL = 1000; // 10 seconds between forced updates

export function MainBoard({ 
  showAnalysis, 
  isAnalyzing, 
  onAnalysisClick, 
  onAnalysisComplete, 
  onResponsesUpdate 
}: MainBoardProps) {
  // State for sticky notes and frame
  const [designNotes, setDesignNotes] = useState<StickyNote[]>([]);
  const [designFrameId, setDesignFrameId] = useState<string | null>(null);
  const [responseMap, setResponseMap] = useState<ResponseMap>({});
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(0);
  
  // Refs for debouncing
  const updateTimeoutRef = useRef<NodeJS.Timeout>();
  const lastUpdateRef = useRef<number>(0);

  // Function to get the Design-Decision frame ID
  const getDesignFrameId = async () => {
    try {
      const frames = await miro.board.get({ type: 'frame' });
      const designFrame = frames.find(f => f.title === 'Design-Decision');
      
      if (designFrame) {
        setDesignFrameId(designFrame.id);
        console.log('Found Design-Decision frame:', designFrame.id);
        return designFrame.id;
      }
      console.log('Design-Decision frame not found');
      return null;
    } catch (err) {
      console.error('Error getting Design-Decision frame:', err);
      return null;
    }
  };

  // Function to get current sticky notes from the Design-Decision frame
  const getCurrentStickyNotes = async () => {
    try {
      const frameId = await getDesignFrameId();
      if (!frameId) {
        console.log('Design-Decision frame not found');
        return [];
      }

      // Get all sticky notes on the board
      const allStickies = await miro.board.get({ type: 'sticky_note' });
      console.log('Total sticky notes found:', allStickies.length);
      
      // Filter sticky notes that belong to the Design-Decision frame
      const frameStickies = allStickies.filter(sticky => {
        const belongs = sticky.parentId === frameId;
        console.log(`Sticky note ${sticky.id}: parentId=${sticky.parentId}, frameId=${frameId}, belongs=${belongs}`);
        return belongs;
      });
      
      console.log('Sticky notes in Design-Decision frame:', frameStickies.length);

      const notes = frameStickies.map(item => ({
        id: item.id,
        content: item.content || ''
      }));

      console.log('Processed notes:', notes);
      return notes;

    } catch (err) {
      console.error('Error getting sticky notes:', err);
      return [];
    }
  };

  // Function to update design notes with debouncing
  const updateDesignNotes = useCallback(async (forceUpdate: boolean = false) => {
    console.log('updateDesignNotes called, force update:', forceUpdate);
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateRef.current;

    // Clear any pending update
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }

    // If we've updated recently and this isn't a forced update, schedule an update for later
    if (!forceUpdate && timeSinceLastUpdate < DEBOUNCE_DELAY) {
      console.log('Debouncing update...');
      updateTimeoutRef.current = setTimeout(() => updateDesignNotes(true), DEBOUNCE_DELAY - timeSinceLastUpdate);
      return;
    }

    // If not enough time has passed since last update and not forced, skip
    if (!forceUpdate && (now - lastUpdateTime) < UPDATE_INTERVAL) {
      console.log('Skipping update due to frequency limit');
      return;
    }

    try {
      const notes = await getCurrentStickyNotes();
      console.log('Got new notes:', notes);
      
      // Compare with current notes to see if there are actual changes
      const hasChanges = JSON.stringify(notes) !== JSON.stringify(designNotes);
      
      if (hasChanges) {
        console.log('Notes changed, updating state...');
        setDesignNotes(notes);
        setLastUpdateTime(now);
        
        // Don't automatically trigger analysis for content updates
        // Only update the display
      }

      lastUpdateRef.current = now;
    } catch (error) {
      console.error('Error updating design notes:', error);
    }
  }, [designNotes, lastUpdateTime]);

  // Set up event listeners for sticky note changes
  useEffect(() => {
    let isSubscribed = true;

    const setupSubscription = async () => {
      try {
        // Initial fetch
        console.log('Setting up initial subscription...');
        if (isSubscribed) {
          await updateDesignNotes(true); // Force initial update
        }

        // Subscribe to board events
        const handleBoardChange = async () => {
          if (!isSubscribed) return;
          console.log('Board change detected');
          await updateDesignNotes(false); // Regular update with debounce
        };

        // Subscribe to all relevant events with reduced frequency
        const events = [
          'WIDGETS_CREATED',
          'WIDGETS_DELETED',
          'WIDGETS_TRANSFORMATION_UPDATED',
          'ALL_WIDGETS_LOADED',
          'METADATA_CHANGED'
        ];

        events.forEach(event => {
          miro.board.ui.on(event as any, async () => {
            if (!isSubscribed) return;
            console.log(`Event triggered: ${event}`);
            await handleBoardChange();
          });
        });

        // Handle selection updates separately and less frequently
        miro.board.ui.on('SELECTION_UPDATED', async () => {
          if (!isSubscribed) return;
          const selection = await miro.board.getSelection();
          const hasStickies = selection.some(item => item.type === 'sticky_note');
          if (hasStickies) {
            console.log('Sticky note selection changed');
            await handleBoardChange();
          }
        });

      } catch (error) {
        console.error('Error setting up event listeners:', error);
      }
    };

    setupSubscription();

    // Set up periodic forced updates
    const intervalId = setInterval(() => {
      if (isSubscribed) {
        updateDesignNotes(true);
      }
    }, UPDATE_INTERVAL);

    // Cleanup function
    return () => {
      console.log('Cleaning up subscriptions...');
      isSubscribed = false;
      clearInterval(intervalId);
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [updateDesignNotes]);

  // Handle responses update
  const handleResponsesUpdate = useCallback((responses: string[]) => {
    // Update response map
    const newResponseMap: ResponseMap = {};
    designNotes.forEach((note, index) => {
      if (responses[index]) {
        newResponseMap[note.id] = responses[index];
      }
    });
    setResponseMap(newResponseMap);
    onResponsesUpdate(responses);
  }, [designNotes, onResponsesUpdate]);

  return (
    <>
      <div style={{ marginBottom: '20px' }}>
        <h2>Design Decisions</h2>
        {designNotes.length === 0 ? (
          <p>No sticky notes found in the "Design-Decision" frame.</p>
        ) : (
          <div>
            <p>Current sticky notes in "Design-Decision" frame:</p>
            <ul style={{ marginBottom: '20px' }}>
              {designNotes.map((note, index) => (
                <li key={`${note.id}-${index}`}>
                  <div><strong>Content:</strong> {note.content}</div>
                  {showAnalysis && responseMap[note.id] && (
                    <div style={{ marginLeft: '20px', color: '#666' }}>
                      <strong>Response:</strong> {responseMap[note.id]}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button 
          className="button button-primary"
          onClick={onAnalysisClick}
          disabled={isAnalyzing || designNotes.length === 0}
        >
          {isAnalyzing ? 'Analysis in Progress...' : 
           showAnalysis ? 'Refresh Analysis' : 'Analyze Sticky Notes'}
        </button>
      </div>

      {showAnalysis && designNotes.length > 0 && (
        <div>
          <AntagoInteract 
            stickyNotes={designNotes.map(note => note.content)}
            onComplete={onAnalysisComplete}
            onResponsesUpdate={handleResponsesUpdate}
          />
        </div>
      )}
    </>
  );
} 