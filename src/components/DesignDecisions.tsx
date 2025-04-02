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
import { DesignerRolePlayService } from '../services/designerRolePlayService';
import { DesignThemeService } from '../services/designThemeService';
import { MiroFrameService } from '../services/miro/frameService';
import { DesignThemeDisplay } from './DesignThemeDisplay';

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

// Helper function to build a decision tree from notes and connections
const buildDecisionTree = (notes: StickyNote[], connections: Connection[]) => {
  console.log('Building decision tree from:', { 
    notes: notes.length, 
    connections: connections.length 
  });
  
  // Create a map of notes by their content for easy lookup
  const noteMap = new Map<string, StickyNote>();
  notes.forEach(note => {
    // Clean content to make matching more reliable
    const cleanContent = note.content.replace(/<\/?p>/g, '').trim();
    // If duplicate content exists, keep the one with shorter ID (usually older notes)
    if (!noteMap.has(cleanContent) || noteMap.get(cleanContent)!.id.length > note.id.length) {
      noteMap.set(cleanContent, note);
    }
  });

  // Log all note content for debugging
  console.log('Notes in tree:', Array.from(noteMap.keys()));

  // Create a map to track children for each note
  const childrenMap = new Map<string, Set<string>>();
  // Create a map to track parents for each note (to identify root nodes)
  const parentMap = new Map<string, Set<string>>();

  // Initialize maps
  Array.from(noteMap.keys()).forEach(content => {
    childrenMap.set(content, new Set());
    parentMap.set(content, new Set());
  });

  // Build the relationship maps from connections
  connections.forEach(connection => {
    const fromContent = connection.from;
    const toContent = connection.to;
    
    // Skip if we don't have either note in our map
    if (!noteMap.has(fromContent) || !noteMap.has(toContent)) {
      console.log('Connection refers to notes not in the map:', { from: fromContent, to: toContent });
      return;
    }
    
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

  // Log relationship maps for debugging
  console.log('Relationship data:', {
    notes: noteMap.size,
    connections: connections.length,
    childrenCount: Array.from(childrenMap.entries()).map(([k, v]) => ({ note: k, children: v.size })),
    parentCount: Array.from(parentMap.entries()).map(([k, v]) => ({ note: k, parents: v.size })),
  });

  // Find root nodes (nodes with no parents)
  const rootNodes = Array.from(noteMap.keys())
    .filter(content => !parentMap.get(content)?.size);
  
  console.log('Root nodes:', rootNodes);

  // Recursive function to build the tree structure
  const buildTree = (content: string, visited = new Set<string>()): any => {
    if (visited.has(content)) {
      console.log('Circular reference detected:', content);
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
  const trees = rootNodes.map(root => buildTree(root));
  
  // If no root nodes found, use all notes as separate trees
  if (trees.length === 0 && noteMap.size > 0) {
    console.log('No root nodes found, using all notes as separate trees');
    return Array.from(noteMap.keys()).map(content => ({
      content,
      id: noteMap.get(content)?.id,
      children: undefined
    }));
  }
  
  return trees;
};

// Component to render a single node in the decision tree
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
  const [designConnections, setDesignConnections] = useState<Connection[]>([]);
  const [designFrameId, setDesignFrameId] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isSavingImage, setIsSavingImage] = useState(false);
  const [isParsingImage, setIsParsingImage] = useState(false);
  const [isRolePlayingDesigner, setIsRolePlayingDesigner] = useState(false);
  const [designChallenge, setDesignChallenge] = useState<string>('');
  const [currentResponses, setCurrentResponses] = useState<string[]>([]);
  const [imageContext, setImageContext] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [functionsVisible, setFunctionsVisible] = useState(true);
  const [toolsVisible, setToolsVisible] = useState(false);
  const [shouldRefreshAnalysis, setShouldRefreshAnalysis] = useState(false);
  const [isGeneratingThemes, setIsGeneratingThemes] = useState<boolean>(false);
  const [themeRefreshTrigger, setThemeRefreshTrigger] = useState<number>(0);

  // Memoize the decision tree to avoid unnecessary recalculations
  const decisionTree = useMemo(() => {
    return buildDecisionTree(designNotes, designConnections);
  }, [designNotes, designConnections]);

  // Function to get the Design-Proposal frame ID
  const getDesignFrameId = async () => {
    try {
      const frames = await miro.board.get({ type: 'frame' });
      const designFrame = frames.find(f => f.title === 'Design-Proposal');
      
      if (designFrame) {
        setDesignFrameId(designFrame.id);
        return designFrame.id;
      }
      return null;
    } catch (err) {
      console.error('Error getting Design-Proposal frame:', err);
      return null;
    }
  };

  // Function to get current sticky notes and connections
  const getCurrentDesignData = async () => {
    try {
      const frameId = await getDesignFrameId();
      if (!frameId) {
        console.log('Design-Proposal frame not found');
        return { notes: [], connections: [] };
      }

      // Get the frame by ID
      const frames = await miro.board.get({ type: 'frame' });
      const designFrame = frames.find(f => f.id === frameId);
      
      if (!designFrame) {
        console.log('Design-Proposal frame not found even though we have the ID');
        return { notes: [], connections: [] };
      }

      // Use the new method to get frame content with connections
      const { stickies, connections } = await MiroFrameService.getFrameContentWithConnections(designFrame);
      
      // Format the data for our component
      const notes = stickies.map(item => ({
        id: item.id,
        content: item.content || ''
      }));
      
      console.log(`Retrieved ${notes.length} design notes and ${connections.length} connections`);

      return { notes, connections };
    } catch (err) {
      console.error('Error getting design data:', err);
      return { notes: [], connections: [] };
    }
  };

  // Handle refresh button click
  const handleRefreshDesignDecisions = async () => {
    if (isRefreshing) return; // Prevent multiple simultaneous refreshes
    
    try {
      setIsRefreshing(true);
      
      // Get current data for comparison
      const currentNotes = designNotes.map(note => note.content);
      const currentConnections = designConnections.map(conn => `${conn.from}-${conn.to}`);
      
      // Fetch new data
      const { notes, connections } = await getCurrentDesignData();
      
      // Compare new data with current data
      const newNotes = notes.map(note => note.content);
      const newConnections = connections.map(conn => `${conn.from}-${conn.to}`);
      
      const hasChanges = 
        JSON.stringify(currentNotes) !== JSON.stringify(newNotes) ||
        JSON.stringify(currentConnections) !== JSON.stringify(newConnections);
      
      if (hasChanges) {
        setDesignNotes(notes);
        setDesignConnections(connections);
        miro.board.notifications.showInfo('Design decisions refreshed successfully.');
      } else {
        miro.board.notifications.showInfo('No changes detected in design decisions.');
      }
      
      // Also trigger a refresh of the design themes
      setThemeRefreshTrigger(prev => prev + 1);
      console.log('Triggered design theme refresh');
      
    } catch (error) {
      console.error('Error refreshing design decisions:', error);
      miro.board.notifications.showError('Failed to refresh design decisions. Please try again.');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Initial data load
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const { notes, connections } = await getCurrentDesignData();
        setDesignNotes(notes);
        setDesignConnections(connections);
        console.log(`Initial data loaded: ${notes.length} notes, ${connections.length} connections`);
      } catch (error) {
        console.error('Error loading initial design data:', error);
      }
    };
    
    loadInitialData();
  }, []);

  // Handle analysis button click
  const handleAnalysisClick = useCallback(async () => {
    if (isAnalyzing) return;

    try {
      onAnalysisClick();
      
      // Get fresh design data
      const { notes, connections } = await getCurrentDesignData();
      setDesignNotes(notes);
      setDesignConnections(connections);

      // Get fresh design challenge
      const challenge = await MiroDesignService.getDesignChallenge();
      setDesignChallenge(challenge);

      // Clear previous responses and force analysis refresh
      if (showAnalysis) {
        setCurrentResponses([]);
        setShouldRefreshAnalysis(true);
      }
    } catch (error) {
      console.error('Error during analysis:', error);
      miro.board.notifications.showError('Failed to refresh analysis. Please try again.');
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
      
      // Process each point and create sticky notes in the Design-Proposal frame
      await TranscriptProcessingService.createDesignProposalStickies(
        points.map(point => ({ proposal: point })),
        'Design-Proposal'
      );
      
      // Refresh the design decisions after adding new notes
      await handleRefreshDesignDecisions();
    } catch (error) {
      console.error('Error processing design points:', error);
    }
  }, [designFrameId, getDesignFrameId, handleRefreshDesignDecisions]);

  // New function to handle designer role play
  const handleDesignerRolePlay = async () => {
    if (isRolePlayingDesigner) {
      console.log('[DESIGNER ROLE PLAY UI] Button clicked but already role playing, ignoring');
      return;
    }
    
    console.log('[DESIGNER ROLE PLAY UI] Role play designer button clicked');
    const startTime = Date.now();
    
    try {
      setIsRolePlayingDesigner(true);
      console.log('[DESIGNER ROLE PLAY UI] Starting designer role play simulation');
      
      await DesignerRolePlayService.simulateDesigner();
      console.log('[DESIGNER ROLE PLAY UI] Designer role play simulation completed successfully');
      
      // Refresh design decisions after role play
      console.log('[DESIGNER ROLE PLAY UI] Refreshing design decisions');
      await handleRefreshDesignDecisions();
      console.log('[DESIGNER ROLE PLAY UI] Design decisions refreshed');
      
      const duration = Date.now() - startTime;
      console.log(`[DESIGNER ROLE PLAY UI] Complete designer role play process finished in ${duration}ms`);
      
      // Show success notification
      miro.board.notifications.showInfo('Designer role play completed successfully!');
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[DESIGNER ROLE PLAY UI] Error role playing designer after ${duration}ms:`, error);
      
      // Show error to user
      miro.board.notifications.showError('Failed to role play designer. Please try again.');
    } finally {
      setIsRolePlayingDesigner(false);
      console.log('[DESIGNER ROLE PLAY UI] Reset role playing state');
    }
  };

  // New function to handle design theme generation
  const handleGenerateThemes = async () => {
    if (isGeneratingThemes) {
      console.log('[DESIGN THEMES UI] Button clicked but already generating themes, ignoring');
      return;
    }
    
    console.log('[DESIGN THEMES UI] Generate themes button clicked');
    const startTime = Date.now();
    
    try {
      setIsGeneratingThemes(true);
      console.log('[DESIGN THEMES UI] Starting theme generation');
      
      await DesignThemeService.generateAndVisualizeThemes();
      console.log('[DESIGN THEMES UI] Theme generation completed successfully');
      
      const duration = Date.now() - startTime;
      console.log(`[DESIGN THEMES UI] Complete theme generation process finished in ${duration}ms`);
      
      // Show success notification
      miro.board.notifications.showInfo('Design themes generated successfully!');
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[DESIGN THEMES UI] Error generating themes after ${duration}ms:`, error);
      
      // Show error to user
      miro.board.notifications.showError('Failed to generate design themes. Please try again.');
    } finally {
      setIsGeneratingThemes(false);
      console.log('[DESIGN THEMES UI] Reset theme generation state');
    }
  };

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
              gap: '8px'
            }}>
              <span style={{ fontSize: '15px', minWidth: '16px', textAlign: 'center' }}>🛠️</span>
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
                  gap: '8px'
                }}>
                  <span style={{ fontSize: '15px', minWidth: '16px', textAlign: 'center' }}>🎤</span>
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
                  gap: '8px'
                }}>
                  <span style={{ fontSize: '15px', minWidth: '16px', textAlign: 'center' }}>🔊</span>
                  Audio File Upload
                </h3>
                <FileUploadTest 
                  mode="decision"
                  onNewPoints={handleNewDesignPoints}
                  skipParentCallback={true}
                />
              </div>

              <div style={{ 
                margin: '0 0 6px 0', 
                fontSize: '14px', 
                color: '#555',
                fontWeight: 500,
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <h3 style={{ 
                  margin: '0 0 6px 0', 
                  fontSize: '14px', 
                  color: '#555',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span style={{ fontSize: '15px', minWidth: '16px', textAlign: 'center' }}>🖼️</span>
                  Image Actions
                </h3>
                <div style={{ 
                  display: 'flex', 
                  flexDirection: 'row',
                  gap: '8px'
                }}>
                  <button
                    onClick={handleSaveRobotImage}
                    className="button button-secondary"
                    disabled={isSavingImage}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid #e0e0e0',
                      backgroundColor: '#ffffff',
                      color: '#555',
                      fontWeight: 500,
                      fontSize: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: isSavingImage ? 'not-allowed' : 'pointer',
                      flex: '1',
                      justifyContent: 'flex-start'
                    }}
                  >
                    <span style={{ fontSize: '15px', minWidth: '16px', textAlign: 'center' }}>🖼️</span>
                    {isSavingImage ? 'Saving...' : 'Save Images'}
                  </button>
                  <button
                    onClick={handleParseRobotImage}
                    className="button button-secondary"
                    disabled={isParsingImage}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid #e0e0e0',
                      backgroundColor: '#ffffff',
                      color: '#555',
                      fontWeight: 500,
                      fontSize: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: isParsingImage ? 'not-allowed' : 'pointer',
                      flex: '1',
                      justifyContent: 'flex-start'
                    }}
                  >
                    <span style={{ fontSize: '15px', minWidth: '16px', textAlign: 'center' }}>🔍</span>
                    {isParsingImage ? 'Parsing...' : 'Parse Images'}
                  </button>
                </div>

                {/* New section for Designer Role Play */}
                <div style={{ marginBottom: '8px' }}>
                  <h3 style={{ 
                    margin: '0 0 6px 0', 
                    fontSize: '14px', 
                    color: '#555',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span style={{ fontSize: '15px', minWidth: '16px', textAlign: 'center' }}>👩‍🎨</span>
                    Designer Role Play
                  </h3>
                  <button
                    onClick={handleDesignerRolePlay}
                    className="button button-secondary"
                    disabled={isRolePlayingDesigner}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid #e0e0e0',
                      backgroundColor: '#ffffff',
                      color: '#555',
                      fontWeight: 500,
                      fontSize: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: isRolePlayingDesigner ? 'not-allowed' : 'pointer',
                      width: '100%',
                      justifyContent: 'flex-start'
                    }}
                  >
                    <span style={{ fontSize: '15px', minWidth: '16px', textAlign: 'center' }}>🧠</span>
                    {isRolePlayingDesigner ? 'Designing...' : 'Role Play Designer'}
                  </button>
                </div>

                {/* New Design Themes Section */}
                <div style={{ marginBottom: '8px' }}>
                  <h3 style={{ 
                    margin: '0 0 6px 0', 
                    fontSize: '14px', 
                    color: '#555',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span style={{ fontSize: '15px', minWidth: '16px', textAlign: 'center' }}>🎨</span>
                    Design Themes & Groups
                  </h3>
                  <button
                    onClick={handleGenerateThemes}
                    className="button button-secondary"
                    disabled={isGeneratingThemes}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid #e0e0e0',
                      backgroundColor: '#ffffff',
                      color: '#555',
                      fontWeight: 500,
                      fontSize: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      cursor: isGeneratingThemes ? 'not-allowed' : 'pointer',
                      width: '100%',
                      justifyContent: 'flex-start'
                    }}
                  >
                    <span style={{ fontSize: '15px', minWidth: '16px', textAlign: 'center' }}>🔍</span>
                    {isGeneratingThemes ? 'Generating Themes...' : 'Generate Design Themes'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Decision List Section */}
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
            <p style={{ margin: 0 }}>No design decisions found in the "Design-Proposal" frame.</p>
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
              gap: '8px'
            }}>
              <span style={{ fontSize: '15px', minWidth: '16px', textAlign: 'center' }}>🔍</span>
              Design Decisions
            </p>
            <div style={{ 
              maxHeight: '300px', 
              overflowY: 'auto',
              padding: '0 4px'
            }}>
              {/* Replace the flat list with the hierarchical tree view */}
              {decisionTree.length > 0 ? (
                <ul style={{ 
                  listStyle: 'none',
                  padding: 0,
                  margin: 0
                }}>
                  {decisionTree.map((node, index) => (
                    <DecisionTreeNode 
                      key={`${node.id || index}`}
                      node={node}
                      level={0}
                    />
                  ))}
                </ul>
              ) : (
                <div style={{
                  padding: '10px',
                  textAlign: 'center',
                  color: '#666'
                }}>
                  Decision notes found, but no connections between them.
                </div>
              )}
            </div>
          </div>
        )
      )}

      {/* Design Themes Section */}
      {isExpanded && (
        <div style={{
          marginTop: '16px',
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
            gap: '8px'
          }}>
            <span style={{ fontSize: '15px', minWidth: '16px', textAlign: 'center' }}>🎨</span>
            Design Themes
          </p>
          <DesignThemeDisplay refreshTrigger={themeRefreshTrigger} />
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
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
            onComplete={() => {
              onAnalysisComplete();
              setShouldRefreshAnalysis(false);
            }}
            onResponsesUpdate={handleResponsesUpdate}
            imageContext={imageContext}
            shouldRefresh={shouldRefreshAnalysis}
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