'use client';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { MiroService } from '../services/miroService';
import { ConversationBox } from './ConversationBox';

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
const DEBOUNCE_DELAY = 10000; // Increased to 10 seconds
const UPDATE_INTERVAL = 30000; // 30 seconds between forced updates

export function MainBoard({ 
  showAnalysis, 
  isAnalyzing, 
  onAnalysisClick, 
  onAnalysisComplete, 
  onResponsesUpdate 
}: MainBoardProps) {
  const [designNotes, setDesignNotes] = useState<StickyNote[]>([]);
  const [designFrameId, setDesignFrameId] = useState<string | null>(null);
  const [shouldRefresh, setShouldRefresh] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isSavingImage, setIsSavingImage] = useState(false);
  const [designChallenge, setDesignChallenge] = useState<string>('');
  
  // Handle refresh click
  const handleRefreshClick = useCallback(() => {
    setShouldRefresh(true);
    onAnalysisClick();
  }, [onAnalysisClick]);

  // Handle save robot image
  const handleSaveRobotImage = useCallback(async () => {
    try {
      setIsSavingImage(true);
      const imagePaths = await MiroService.getAllImagesFromFrame();
      if (imagePaths.length > 0) {
        console.log('Images saved successfully:', imagePaths);
      } else {
        console.log('No images found in Sketch-Reference frame');
      }
    } catch (error) {
      console.error('Error saving images:', error);
    } finally {
      setIsSavingImage(false);
    }
  }, []);

  // Reset refresh flag when analysis completes
  const handleAnalysisComplete = useCallback(() => {
    setShouldRefresh(false);
    setIsExpanded(false);
    onAnalysisComplete();
  }, [onAnalysisComplete]);

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
        return designFrame.id;
      }
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
        return [];
      }

      // Get all sticky notes on the board
      const allStickies = await miro.board.get({ type: 'sticky_note' });
      
      // Filter sticky notes that belong to the Design-Decision frame
      const frameStickies = allStickies.filter(sticky => {
        const belongs = sticky.parentId === frameId;
        return belongs;
      });
      
      const notes = frameStickies.map(item => ({
        id: item.id,
        content: item.content || ''
      }));

      return notes;

    } catch (err) {
      console.error('Error getting sticky notes:', err);
      return [];
    }
  };

  // Function to update design notes with debouncing
  const updateDesignNotes = useCallback(async (forceUpdate: boolean = false) => {
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateRef.current;

    // Clear any pending update
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }

    // If we've updated recently and this isn't a forced update, schedule an update for later
    if (!forceUpdate && timeSinceLastUpdate < DEBOUNCE_DELAY) {
      updateTimeoutRef.current = setTimeout(() => updateDesignNotes(true), DEBOUNCE_DELAY - timeSinceLastUpdate);
      return;
    }

    try {
      const notes = await getCurrentStickyNotes();
      
      // Compare with current notes to see if there are actual changes
      const hasChanges = JSON.stringify(notes) !== JSON.stringify(designNotes);
      
      if (hasChanges) {
        setDesignNotes(notes);
      }
    } catch (error) {
      console.error('Error updating design notes:', error);
    }
  }, [designNotes]);

  // Set up event listeners for sticky note changes
  useEffect(() => {
    let isSubscribed = true;

    const setupSubscription = async () => {
      try {
        // Initial fetch
        if (isSubscribed) {
          await updateDesignNotes(true); // Force initial update
        }

        // Subscribe to board events
        const handleBoardChange = async () => {
          if (!isSubscribed) return;
          await updateDesignNotes(false); // Regular update with debounce
        };

        // Only listen to essential events
        const events = [
          'WIDGETS_CREATED',
          'WIDGETS_DELETED'
        ];

        events.forEach(event => {
          miro.board.ui.on(event as any, async () => {
            if (!isSubscribed) return;
            await handleBoardChange();
          });
        });

      } catch (error) {
        console.error('Error setting up event listeners:', error);
      }
    };

    setupSubscription();

    // Set up periodic forced updates with longer interval
    const intervalId = setInterval(() => {
      if (isSubscribed) {
        updateDesignNotes(true);
      }
    }, UPDATE_INTERVAL);

    return () => {
      isSubscribed = false;
      clearInterval(intervalId);
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [updateDesignNotes]);

  useEffect(() => {
    updateDesignNotes();
  }, [updateDesignNotes]);

  useEffect(() => {
    const fetchDesignChallenge = async () => {
      try {
        const challenge = await MiroService.getDesignChallenge();
        setDesignChallenge(challenge);
      } catch (error) {
        console.error('Error fetching design challenge:', error);
      }
    };
    fetchDesignChallenge();
  }, []);

  return (
    <>
      <div style={{ marginBottom: '20px' }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '16px'
        }}>
          <h2 style={{ margin: 0 }}>Design Decisions</h2>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="button button-secondary"
            style={{ padding: '4px 8px', minWidth: '80px' }}
          >
            {isExpanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
        
        {isExpanded && (
          designNotes.length === 0 ? (
            <p>No design decisions found in the "Design-Decision" frame.</p>
          ) : (
            <div>
              <p>Current design decisions you are making:</p>
              <ul style={{ marginBottom: '20px' }}>
                {designNotes.map((note, index) => (
                  <li key={`${note.id}-${index}`}>
                    <div>{note.content.replace(/<\/?p>/g, '')}</div>
                  </li>
                ))}
              </ul>
              <button
                onClick={handleSaveRobotImage}
                className="button button-secondary"
                style={{ marginBottom: '16px' }}
                disabled={isSavingImage}
              >
                {isSavingImage ? 'Saving Images...' : 'Save All Images'}
              </button>

              <ConversationBox
                designChallenge={designChallenge}
                currentCriticism={[]}
                onInstructionReceived={(instruction) => {
                  console.log('Received instruction:', instruction);
                }}
              />
            </div>
          )
        )}
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button 
          className="button button-primary"
          onClick={showAnalysis ? handleRefreshClick : onAnalysisClick}
          disabled={isAnalyzing || designNotes.length === 0}
        >
          {isAnalyzing ? 'Analysis in Progress...' : 
           showAnalysis ? 'Refresh Analysis' : 'Analyze the Design Decisions'}
        </button>
      </div>

      {showAnalysis && designNotes.length > 0 && (
        <div>
          <AntagoInteract 
            stickyNotes={designNotes.map(note => note.content)}
            onComplete={handleAnalysisComplete}
            onResponsesUpdate={onResponsesUpdate}
            shouldRefresh={shouldRefresh}
          />
        </div>
      )}
    </>
  );
} 