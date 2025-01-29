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

const DEBOUNCE_DELAY = 2000; // 2 seconds

export function MainBoard({ boards }: BoardDisplayProps) {
  // State for sticky notes and frame
  const [designNotes, setDesignNotes] = useState<StickyNote[]>([]);
  const [designFrameId, setDesignFrameId] = useState<string | null>(null);
  
  // State for analysis and responses
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [responseMap, setResponseMap] = useState<ResponseMap>({});
  const [gptResponses, setGptResponses] = useState<string[]>([]);
  
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
  const updateDesignNotes = useCallback(async () => {
    console.log('updateDesignNotes called');
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateRef.current;

    // Clear any pending update
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }

    // If we've updated recently, schedule an update for later
    if (timeSinceLastUpdate < DEBOUNCE_DELAY) {
      console.log('Debouncing update...');
      updateTimeoutRef.current = setTimeout(updateDesignNotes, DEBOUNCE_DELAY - timeSinceLastUpdate);
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
        
        // If we're analyzing, check for new notes that need responses
        if (showAnalysis) {
          const newNotes = notes.filter(note => !responseMap[note.id]);
          if (newNotes.length > 0) {
            console.log('New notes found, triggering analysis:', newNotes);
            setIsAnalyzing(true);
          }
        }
      } else {
        console.log('No changes in notes');
      }

      lastUpdateRef.current = Date.now();
    } catch (error) {
      console.error('Error updating design notes:', error);
    }
  }, [showAnalysis, responseMap, designNotes]);

  // Set up event listeners for sticky note changes
  useEffect(() => {
    let isSubscribed = true;

    const setupSubscription = async () => {
      try {
        // Initial fetch
        console.log('Setting up initial subscription...');
        if (isSubscribed) {
          await updateDesignNotes();
        }

        // Subscribe to board events
        const handleBoardChange = async () => {
          if (!isSubscribed) return;
          console.log('Board change detected');
          await updateDesignNotes();
        };

        // Subscribe to all relevant events
        miro.board.ui.on('selection:update', async () => {
          if (!isSubscribed) return;
          const selection = await miro.board.getSelection();
          console.log('Selection changed:', selection);
          await handleBoardChange();
        });

        miro.board.ui.on('content_change', handleBoardChange);
        miro.board.ui.on('widgets_created', handleBoardChange);
        miro.board.ui.on('widgets_deleted', handleBoardChange);
        miro.board.ui.on('widgets_transformation_updated', handleBoardChange);

      } catch (error) {
        console.error('Error setting up event listeners:', error);
      }
    };

    setupSubscription();

    return () => {
      console.log('Cleaning up subscriptions...');
      isSubscribed = false;
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [updateDesignNotes]);

  // Handle analysis button click
  const handleAnalysisClick = useCallback(() => {
    if (isAnalyzing) return;
    
    if (showAnalysis) {
      // Instead of just hiding, refresh the analysis
      setIsAnalyzing(true);
      // Clear previous responses
      setGptResponses([]);
      setResponseMap({});
      // This will trigger a re-analysis with the current notes
    } else {
      setShowAnalysis(true);
      setIsAnalyzing(true);
    }
  }, [isAnalyzing, showAnalysis]);

  // Handle analysis completion
  const onAnalysisComplete = useCallback(() => {
    setIsAnalyzing(false);
  }, []);

  // Handle responses update
  const handleResponsesUpdate = useCallback((responses: string[]) => {
    setGptResponses(responses);
    
    // Update response map
    const newResponseMap: ResponseMap = {};
    designNotes.forEach((note, index) => {
      if (responses[index]) {
        newResponseMap[note.id] = responses[index];
      }
    });
    setResponseMap(newResponseMap);
  }, [designNotes]);

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
          onClick={handleAnalysisClick}
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