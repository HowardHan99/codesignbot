'use client';
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { MiroService } from '../services/miroService';
import { ConversationBox } from './ConversationBox';
import { OpenAIService } from '../services/openaiService';
import { MiroConversationModal } from './MiroConversationModal';
import { ConversationPanel } from './ConversationPanel';
import { MiroDesignService } from '../services/miro/designService';
import { VoiceRecorder } from './VoiceRecorder';
import { FileUploadTest } from './FileUploadTest';
import { TranscriptProcessingService } from '../services/transcriptProcessingService';

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
  const [isExpanded, setIsExpanded] = useState(true);
  const [isSavingImage, setIsSavingImage] = useState(false);
  const [isParsingImage, setIsParsingImage] = useState(false);
  const [designChallenge, setDesignChallenge] = useState<string>('');
  const [currentResponses, setCurrentResponses] = useState<string[]>([]);
  const [imageContext, setImageContext] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  // Function to get current sticky notes and connections
  const getCurrentDesignData = async () => {
    try {
      const frameId = await getDesignFrameId();
      if (!frameId) {
        return { notes: [], connections: [] };
      }

      // Get all sticky notes on the board
      const allStickies = await miro.board.get({ type: 'sticky_note' });
      const frameStickies = allStickies.filter(sticky => sticky.parentId === frameId);
      
      const notes = frameStickies.map(item => ({
        id: item.id,
        content: item.content || ''
      }));

      // Get connections between sticky notes
      const analysis = await MiroDesignService.analyzeDesignDecisions();
      const connections = analysis[0]?.connections || [];

      return { notes, connections };
    } catch (err) {
      console.error('Error getting design data:', err);
      return { notes: [], connections: [] };
    }
  };

  // Handle refresh button click
  const handleRefreshDesignDecisions = async () => {
    try {
      setIsRefreshing(true);
      const { notes, connections } = await getCurrentDesignData();
      setDesignNotes(notes);
      setDesignConnections(connections);
    } catch (error) {
      console.error('Error refreshing design decisions:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Handle analysis button click
  const handleAnalysisClick = useCallback(async () => {
    if (isAnalyzing) return;

    try {
      onAnalysisClick();
      await handleRefreshDesignDecisions();

      // Get fresh design challenge
      const challenge = await MiroDesignService.getDesignChallenge();
      setDesignChallenge(challenge);

      // Clear previous responses if showing analysis
      if (showAnalysis) {
        setCurrentResponses([]);
      }
    } catch (error) {
      console.error('Error during analysis:', error);
      onAnalysisComplete();
    }
  }, [isAnalyzing, showAnalysis, onAnalysisClick, onAnalysisComplete]);

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
        const descriptions = await OpenAIService.analyzeImages(imagePaths);
        const combinedContext = descriptions.join('\n\nNext Image:\n');
        setImageContext(combinedContext);
      }
    } catch (error) {
      console.error('Error parsing images:', error);
    } finally {
      setIsParsingImage(false);
    }
  }, []);

  const handleResponsesUpdate = useCallback((responses: string[]) => {
    setCurrentResponses(responses);
    onResponsesUpdate(responses);
  }, [onResponsesUpdate]);

  const handleOpenConversation = useCallback(async () => {
    await miro.board.ui.openModal({
      url: '/conversation-modal',
      width: 400,
      height: 600,
      fullscreen: false,
    });

    setTimeout(() => {
      const channel = new BroadcastChannel('miro-conversation');
      channel.postMessage({
        type: 'INIT_MODAL',
        designChallenge,
        currentCriticism: currentResponses
      });
      channel.close();
    }, 500);
  }, [designChallenge, currentResponses]);

  // Handle new design points from voice recording
  const handleNewDesignPoints = useCallback(async (points: string[]) => {
    if (!points.length) return;
    
    try {
      // Get the design frame ID if we don't have it yet
      let frameId = designFrameId;
      if (!frameId) {
        frameId = await getDesignFrameId();
      }
      
      // Process each point and create sticky notes in the Design-Decision frame
      await TranscriptProcessingService.createDesignProposalStickies(
        points.map(point => ({ proposal: point })),
        'Design-Decision'
      );
      
      // Refresh the design decisions after adding new notes
      await handleRefreshDesignDecisions();
    } catch (error) {
      console.error('Error processing design points:', error);
    }
  }, [designFrameId, getDesignFrameId, handleRefreshDesignDecisions]);

  // Initial frame ID fetch
  useEffect(() => {
    getDesignFrameId();
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
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleRefreshDesignDecisions}
              className="button button-secondary"
              disabled={isRefreshing}
            >
              {isRefreshing ? 'Refreshing...' : '↻ Refresh'}
            </button>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="button button-secondary"
              style={{ padding: '4px 8px', minWidth: '80px' }}
            >
              {isExpanded ? 'Collapse' : 'Expand'}
            </button>
          </div>
        </div>

        {/* Voice Recorder for Design Thoughts */}
        <VoiceRecorder 
          mode="decision"
          onNewPoints={handleNewDesignPoints}
        />
        
        {/* Test button for audio file upload */}
        <FileUploadTest 
          mode="decision"
          onNewPoints={handleNewDesignPoints}
          skipParentCallback={true}
        />

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
          onClick={handleAnalysisClick}
          disabled={isAnalyzing}
        >
          {isAnalyzing ? 'Analysis in Progress...' : 
           showAnalysis ? 'Refresh Analysis' : 'Analyze the Design Decisions'}
        </button>
      </div>

      {showAnalysis && designNotes.length > 0 && (
        <>
          <AntagoInteract 
            stickyNotes={designNotes.map(note => note.content)}
            onComplete={onAnalysisComplete}
            onResponsesUpdate={handleResponsesUpdate}
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