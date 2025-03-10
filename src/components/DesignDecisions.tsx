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
  const [functionsVisible, setFunctionsVisible] = useState(true);
  const [toolsVisible, setToolsVisible] = useState(false);

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
      {/* Title and Tools Row */}
      <div style={{ 
        marginBottom: '2px',
        display: 'flex', 
        flexDirection: 'column',
      }}>
        <h2 style={{ 
          margin: '0 0 2px 0', 
          fontSize: '28px',
          fontWeight: 600,
          color: '#333',
          lineHeight: 1.2,
          whiteSpace: 'nowrap'
        }}>
          Design Decisions
        </h2>

        {/* Button Row */}
        <div style={{ 
          display: 'flex', 
          gap: '6px',
          marginBottom: '2px'
        }}>
          <button
            onClick={handleRefreshDesignDecisions}
            className="button button-secondary"
            disabled={isRefreshing}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: '6px 10px',
              borderRadius: '6px',
              border: '1px solid #e0e0e0',
              backgroundColor: '#f8f9fa',
              color: '#333',
              fontWeight: 500,
              fontSize: '14px',
              flex: 1,
              cursor: isRefreshing ? 'not-allowed' : 'pointer',
              maxWidth: '120px'
            }}
          >
            <span style={{ fontSize: '14px' }}>↻</span>
            {isRefreshing ? 'Refreshing' : 'Refresh'}
          </button>
          
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="button button-secondary"
            style={{ 
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px 10px', 
              borderRadius: '6px',
              border: '1px solid #e0e0e0',
              backgroundColor: '#f8f9fa',
              color: '#333',
              fontWeight: 500,
              fontSize: '14px',
              flex: 1,
              cursor: 'pointer',
              maxWidth: '120px'
            }}
          >
            {isExpanded ? 'Collapse' : 'Expand'}
          </button>
          
          <button
            onClick={() => setToolsVisible(!toolsVisible)}
            className="button button-secondary"
            style={{ 
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '6px 10px', 
              borderRadius: '6px',
              border: '1px solid #e0e0e0',
              backgroundColor: toolsVisible ? '#f0f0f0' : '#f8f9fa',
              color: '#333',
              fontWeight: 500,
              fontSize: '14px',
              flex: 1,
              cursor: 'pointer',
              maxWidth: '120px'
            }}
          >
            {toolsVisible ? 'Hide Tools' : 'Show Tools'}
          </button>
        </div>
      </div>

      {/* Tools Section */}
      {toolsVisible && (
        <div style={{
          marginBottom: '8px',
          borderRadius: '6px',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px'
        }}>
          {/* Function Toggle Button */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 10px',
            backgroundColor: '#f5f5f5',
            borderRadius: '6px',
            cursor: 'pointer',
            border: '1px solid #e0e0e0'
          }} onClick={() => setFunctionsVisible(!functionsVisible)}>
            <span style={{ 
              fontSize: '14px', 
              fontWeight: 500, 
              color: '#444',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <span style={{ fontSize: '16px' }}>🛠️</span>
              Recording & Analysis Tools
            </span>
            <span style={{ fontSize: '14px' }}>
              {functionsVisible ? '🔼' : '🔽'}
            </span>
          </div>

          {/* Tool Components */}
          {functionsVisible && (
            <div style={{
              padding: '8px',
              borderRadius: '6px',
              border: '1px solid #e0e0e0',
              backgroundColor: '#f9f9f9'
            }}>
              <div style={{ marginBottom: '8px' }}>
                <h3 style={{ 
                  margin: '0 0 6px 0', 
                  fontSize: '14px', 
                  color: '#555',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <span style={{ fontSize: '15px' }}>🎤</span>
                  Voice Recording
                </h3>
                <VoiceRecorder 
                  mode="decision"
                  onNewPoints={handleNewDesignPoints}
                  enableRealTimeCritique={true}
                />
              </div>
              
              <div style={{ marginBottom: '8px' }}>
                <h3 style={{ 
                  margin: '0 0 6px 0', 
                  fontSize: '14px', 
                  color: '#555',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <span style={{ fontSize: '15px' }}>🔊</span>
                  Audio File Upload
                </h3>
                <FileUploadTest 
                  mode="decision"
                  onNewPoints={handleNewDesignPoints}
                  skipParentCallback={true}
                />
              </div>

              <div>
                <h3 style={{ 
                  margin: '0 0 6px 0', 
                  fontSize: '14px', 
                  color: '#555',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  <span style={{ fontSize: '15px' }}>🖼️</span>
                  Image Actions
                </h3>
                <div style={{ 
                  display: 'flex', 
                  flexDirection: 'column',
                  gap: '6px'
                }}>
                  <button
                    onClick={handleSaveRobotImage}
                    className="button button-secondary"
                    disabled={isSavingImage}
                    style={{
                      padding: '6px 10px',
                      borderRadius: '6px',
                      border: '1px solid #e0e0e0',
                      backgroundColor: '#ffffff',
                      color: '#555',
                      fontWeight: 500,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      cursor: isSavingImage ? 'not-allowed' : 'pointer'
                    }}
                  >
                    <span style={{ fontSize: '15px' }}>🖼️</span>
                    {isSavingImage ? 'Saving Images...' : 'Save Images'}
                  </button>
                  <button
                    onClick={handleParseRobotImage}
                    className="button button-secondary"
                    disabled={isParsingImage}
                    style={{
                      padding: '6px 10px',
                      borderRadius: '6px',
                      border: '1px solid #e0e0e0',
                      backgroundColor: '#ffffff',
                      color: '#555',
                      fontWeight: 500,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      cursor: isParsingImage ? 'not-allowed' : 'pointer'
                    }}
                  >
                    <span style={{ fontSize: '15px' }}>🔍</span>
                    {isParsingImage ? 'Parsing Images...' : 'Parse Images'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Decision Tree Section */}
      {isExpanded && (
        designNotes.length === 0 ? (
          <div style={{
            padding: '10px',
            textAlign: 'center',
            backgroundColor: '#f8f9fa',
            borderRadius: '6px',
            color: '#666',
            fontSize: '14px',
            border: '1px solid #e0e0e0'
          }}>
            <p style={{ margin: 0 }}>No design decisions found in the "Design-Decision" frame.</p>
            <p style={{ margin: '8px 0 0 0', fontSize: '13px' }}>Record your thoughts or upload an audio file to get started.</p>
          </div>
        ) : (
          <div style={{
            backgroundColor: '#f8f9fa',
            borderRadius: '6px',
            padding: '8px',
            border: '1px solid #e0e0e0'
          }}>
            <p style={{ 
              margin: '0 0 8px 0',
              fontWeight: 500,
              color: '#555',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <span style={{ fontSize: '15px' }}>🔍</span>
              Design Decision Structure
            </p>
            <ul style={{ 
              listStyle: 'none',
              padding: 0,
              margin: 0
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

      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
        <button 
          className="button button-primary"
          onClick={handleAnalysisClick}
          disabled={isAnalyzing}
          style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: 'none',
            backgroundColor: '#3498db',
            color: 'white',
            fontWeight: 600,
            cursor: isAnalyzing ? 'not-allowed' : 'pointer',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            transition: 'all 0.2s ease',
            width: '100%',
            justifyContent: 'center'
          }}
        >
          <span style={{ fontSize: '15px' }}>✨</span>
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
            style={{ marginTop: '8px' }}
          >
            Respond to Analysis
          </button>
        </>
      )}
    </>
  );
} 