'use client';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { MiroService } from '../services/miroService';
import { ConversationBox } from './ConversationBox';
import { OpenAIService } from '../services/openaiService';
import { MiroConversationModal } from './MiroConversationModal';
import { ConversationPanel } from './ConversationPanel';
import { MiroDesignService } from '../services/miro/designService';

const AntagoInteract = dynamic(() => import('./AntagoInteract'), { 
  ssr: false 
});

interface StickyNote {
  id: string;
  content: string;
}

interface Connection {
  from: string;
  to: string;
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

// Add this helper function before the MainBoard component
const buildDecisionTree = (notes: StickyNote[], connections: Connection[]) => {
  // Create a map of notes by their content for easy lookup
  const noteMap = new Map<string, StickyNote>();
  notes.forEach(note => noteMap.set(note.content.replace(/<\/?p>/g, ''), note));

  // Create a map to track children for each note
  const childrenMap = new Map<string, Set<string>>();
  // Create a map to track parents for each note (to identify root nodes)
  const parentMap = new Map<string, Set<string>>();

  // Initialize maps
  notes.forEach(note => {
    const content = note.content.replace(/<\/?p>/g, '');
    childrenMap.set(content, new Set());
    parentMap.set(content, new Set());
  });

  // Build the relationship maps
  connections.forEach(connection => {
    const fromContent = connection.from;
    const toContent = connection.to;
    
    // Add child relationship
    const children = childrenMap.get(fromContent);
    if (children) {
      children.add(toContent);
    }
    
    // Add parent relationship
    const parents = parentMap.get(toContent);
    if (parents) {
      parents.add(fromContent);
    }
  });

  // Find root nodes (nodes with no parents)
  const rootNodes = Array.from(noteMap.keys())
    .filter(content => !parentMap.get(content)?.size);

  // Recursive function to build the tree structure
  const buildTree = (content: string, visited = new Set<string>()): any => {
    if (visited.has(content)) {
      return null; // Prevent circular references
    }
    visited.add(content);

    const children = Array.from(childrenMap.get(content) || [])
      .map(childContent => buildTree(childContent, new Set(visited)))
      .filter(child => child !== null);

    return {
      content,
      id: noteMap.get(content)?.id,
      children: children.length > 0 ? children : undefined
    };
  };

  // Build trees starting from root nodes
  return rootNodes.map(root => buildTree(root));
};

// Add this component before the MainBoard component
const DecisionTreeNode: React.FC<{
  node: any;
  level: number;
}> = ({ node, level }) => {
  return (
    <li style={{ marginLeft: level > 0 ? '5px' : '0' }}>
      <div style={{ 
        display: 'flex',
        alignItems: 'center',
        marginBottom: '8px'
      }}>
        {level > 0 && (
          <span style={{ 
            marginRight: '2px',
            color: '#666',
            fontSize: '14px'
          }}>
            └
          </span>
        )}
        <div style={{
          padding: '2px 12px',
          backgroundColor: '#f5f5f7',
          borderRadius: '4px',
          border: '1px solid #e6e6e6',
          flex: 1
        }}>
          {node.content}
        </div>
      </div>
      {node.children && (
        <ul style={{ 
          listStyle: 'none',
          padding: 0,
          margin: 0
        }}>
          {node.children.map((child: any, index: number) => (
            <DecisionTreeNode
              key={`${child.id}-${index}`}
              node={child}
              level={level + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
};

export function MainBoard({ 
  showAnalysis, 
  isAnalyzing, 
  onAnalysisClick, 
  onAnalysisComplete, 
  onResponsesUpdate 
}: MainBoardProps) {
  const [designNotes, setDesignNotes] = useState<StickyNote[]>([]);
  const [designConnections, setDesignConnections] = useState<Connection[]>([]);
  const [designFrameId, setDesignFrameId] = useState<string | null>(null);
  const [shouldRefresh, setShouldRefresh] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isSavingImage, setIsSavingImage] = useState(false);
  const [isParsingImage, setIsParsingImage] = useState(false);
  const [designChallenge, setDesignChallenge] = useState<string>('');
  const [currentResponses, setCurrentResponses] = useState<string[]>([]);
  const [imageContext, setImageContext] = useState<string>('');

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

  // Handle parse robot image
  const handleParseRobotImage = useCallback(async () => {
    try {
      setIsParsingImage(true);
      const imagePaths = await MiroService.getAllImagesFromFrame();
      if (imagePaths.length > 0) {
        // Get image descriptions from OpenAI Vision
        const descriptions = await OpenAIService.analyzeImages(imagePaths);
        const combinedContext = descriptions.join('\n\nNext Image:\n');
        setImageContext(combinedContext);
        console.log('Images parsed successfully:', descriptions);
      } else {
        console.log('No images found in Sketch-Reference frame');
      }
    } catch (error) {
      console.error('Error parsing images:', error);
    } finally {
      setIsParsingImage(false);
    }
  }, []);

  // Reset refresh flag when analysis completes
  const handleAnalysisComplete = useCallback(() => {
    setShouldRefresh(false);
    setIsExpanded(false);
    onAnalysisComplete();
  }, [onAnalysisComplete]);

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

  // Function to get current sticky notes and connections from the Design-Decision frame
  const getCurrentStickyNotes = async () => {
    try {
      const frameId = await getDesignFrameId();
      if (!frameId) {
        return { notes: [], connections: [] };
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

      // Get connections between sticky notes
      const analysis = await MiroDesignService.analyzeDesignDecisions();
      const connections = analysis[0]?.connections || [];

      return { notes, connections };

    } catch (err) {
      console.error('Error getting sticky notes and connections:', err);
      return { notes: [], connections: [] };
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
      const { notes, connections } = await getCurrentStickyNotes();
      
      // Compare with current notes and connections to see if there are actual changes
      const hasNotesChanged = JSON.stringify(notes) !== JSON.stringify(designNotes);
      const hasConnectionsChanged = JSON.stringify(connections) !== JSON.stringify(designConnections);
      
      if (hasNotesChanged) {
        setDesignNotes(notes);
      }
      if (hasConnectionsChanged) {
        setDesignConnections(connections);
      }
    } catch (error) {
      console.error('Error updating design notes:', error);
    }
  }, [designNotes, designConnections]);

  // Refs for debouncing
  const updateTimeoutRef = useRef<NodeJS.Timeout>();
  const lastUpdateRef = useRef<number>(0);

  // Set up event listeners for sticky note and connector changes
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

        // Listen to both sticky note and connector events
        const events = [
          'WIDGETS_CREATED',
          'WIDGETS_DELETED',
          'CONNECTOR_CREATED',
          'CONNECTOR_DELETED'
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

  const handleResponsesUpdate = useCallback((responses: string[]) => {
    setCurrentResponses(responses);
    onResponsesUpdate(responses);
  }, [onResponsesUpdate]);

  const handleOpenConversation = useCallback(async () => {
    // Open the modal first
    await miro.board.ui.openModal({
      url: '/conversation-modal',
      width: 400,
      height: 600,
      fullscreen: false,
    });

    // Wait a bit for the modal to initialize
    setTimeout(() => {
      // Send the current context to the modal using broadcast channel
      const channel = new BroadcastChannel('miro-conversation');
      channel.postMessage({
        type: 'INIT_MODAL',
        designChallenge,
        currentCriticism: currentResponses
      });
      channel.close();
    }, 500);
  }, [designChallenge, currentResponses]);

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

        {/* Image Action Buttons */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <button
            onClick={handleSaveRobotImage}
            className="button button-secondary"
            disabled={isSavingImage}
          >
            {isSavingImage ? 'Saving Images...' : 'Save Images'}
          </button>
          <button
            onClick={handleParseRobotImage}
            className="button button-secondary"
            disabled={isParsingImage}
          >
            {isParsingImage ? 'Parsing Images...' : 'Parse Images'}
          </button>
        </div>
        
        {isExpanded && (
          designNotes.length === 0 ? (
            <p>No design decisions found in the "Design-Decision" frame.</p>
          ) : (
            <div>
              <p>Design Decision Structure:</p>
              <ul style={{ 
                listStyle: 'none',
                padding: 0,
                margin: 0,
                marginBottom: '20px'
              }}>
                {buildDecisionTree(designNotes, designConnections).map((tree: any, index: number) => (
                  <DecisionTreeNode
                    key={`tree-${index}`}
                    node={tree}
                    level={0}
                  />
                ))}
              </ul>
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
        <>
          <AntagoInteract 
            stickyNotes={designNotes.map(note => note.content)}
            onComplete={handleAnalysisComplete}
            onResponsesUpdate={handleResponsesUpdate}
            shouldRefresh={shouldRefresh}
            imageContext={imageContext}
          />
          <button
            onClick={handleOpenConversation}
            className="button button-primary"
            style={{ marginTop: '16px' }}
          >
            Respond to Analysis
          </button>
        </>
      )}
    </>
  );
} 