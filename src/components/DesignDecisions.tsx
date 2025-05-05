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
import { DesignerRolePlayService, DesignerModelType } from '../services/designerRolePlayService';
import { DesignThemeService } from '../services/designThemeService';
import { MiroFrameService } from '../services/miro/frameService';
import { DesignThemeDisplay } from './DesignThemeDisplay';
import { StickyNoteService } from '../services/miro/stickyNoteService';
import { logUserActivity, saveDesignProposals, saveThinkingDialogues, saveDesignThemes } from '../utils/firebase';
import { frameConfig } from '../utils/config';
import { Logger } from '../utils/logger';

// Log context for this component
const LOG_CONTEXT = 'DESIGN-DECISIONS';

const AntagoInteract = dynamic(() => import('./AntagoInteract'), { 
  loading: () => <div>Loading...</div>,
  ssr: false,
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

// Define the DesignOutput type
interface DesignOutput {
  thinking?: string[];
  designDecisions: string[];
}

// Helper function to build a decision tree from notes and connections
const buildDecisionTree = (notes: StickyNote[], connections: Connection[]) => {
  Logger.log(LOG_CONTEXT, 'Building decision tree from:', { 
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
  Logger.log(LOG_CONTEXT, 'Notes in tree:', Array.from(noteMap.keys()));

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
      Logger.log(LOG_CONTEXT, 'Connection refers to notes not in the map:', { from: fromContent, to: toContent });
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
  Logger.log(LOG_CONTEXT, 'Relationship data:', {
    notes: noteMap.size,
    connections: connections.length,
    childrenCount: Array.from(childrenMap.entries()).map(([k, v]) => ({ note: k, children: v.size })),
    parentCount: Array.from(parentMap.entries()).map(([k, v]) => ({ note: k, parents: v.size })),
  });

  // Find root nodes (nodes with no parents)
  const rootNodes = Array.from(noteMap.keys())
    .filter(content => !parentMap.get(content)?.size);
  
  Logger.log(LOG_CONTEXT, 'Root nodes:', rootNodes);

  // Recursive function to build the tree structure
  const buildTree = (content: string, visited = new Set<string>()): any => {
    if (visited.has(content)) {
      Logger.log(LOG_CONTEXT, 'Circular reference detected:', content);
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
    Logger.log(LOG_CONTEXT, 'No root nodes found, using all notes as separate trees');
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
  const [isRolePlayingDesigner, setIsRolePlayingDesigner] = useState<boolean>(false);
  const [designChallenge, setDesignChallenge] = useState<string>('');
  const [currentResponses, setCurrentResponses] = useState<string[]>([]);
  const [imageContext, setImageContext] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [functionsVisible, setFunctionsVisible] = useState(true);
  const [toolsVisible, setToolsVisible] = useState(false);
  const [shouldRefreshAnalysis, setShouldRefreshAnalysis] = useState(false);
  const [isGeneratingThemes, setIsGeneratingThemes] = useState<boolean>(false);
  const [themeRefreshTrigger, setThemeRefreshTrigger] = useState<number>(0);
  const [selectedDesignerModel, setSelectedDesignerModel] = useState<DesignerModelType>(DesignerModelType.GPT4);
  const [designDecisions, setDesignDecisions] = useState<string[]>([]);
  const [thinking, setThinking] = useState<string[]>([]);
  const [roleplayLoading, setRoleplayLoading] = useState<boolean>(false);
  const [rolePlayError, setRolePlayError] = useState<string>("");
  const [stickyCharLimit, setStickyCharLimit] = useState<number>(StickyNoteService.getStickyCharLimit());

  // Memoize the decision tree to avoid unnecessary recalculations
  const decisionTree = useMemo(() => {
    return buildDecisionTree(designNotes, designConnections);
  }, [designNotes, designConnections]);

  // Function to get the Design-Proposal frame ID
  const getDesignFrameId = async () => {
    try {
      const frames = await miro.board.get({ type: 'frame' });
      const designFrame = frames.find(f => f.title === frameConfig.names.designProposal);
      
      if (designFrame) {
        setDesignFrameId(designFrame.id);
        Logger.log(LOG_CONTEXT, `Found ${frameConfig.names.designProposal} frame ID:`, designFrame.id);
        return designFrame.id;
      } else {
        Logger.log(LOG_CONTEXT, `${frameConfig.names.designProposal} frame not found`);
        setDesignFrameId(null);
        return null;
      }
    } catch (err) {
      Logger.error(LOG_CONTEXT, `Error getting ${frameConfig.names.designProposal} frame:`, err);
      return null;
    }
  };

  // Function to get current sticky notes and connections
  const getCurrentDesignData = async () => {
    try {
      const frameId = designFrameId || await getDesignFrameId();
      if (!frameId) {
        Logger.log(LOG_CONTEXT, `${frameConfig.names.designProposal} frame not found, cannot get data.`); 
        return { notes: [], connections: [] }; 
      }

      // Get the frame by ID
      const frames = await miro.board.get({ type: 'frame' });
      const designFrame = frames.find(f => f.id === frameId);
      
      if (!designFrame) {
        Logger.log(LOG_CONTEXT, `${frameConfig.names.designProposal} frame object not found even though we have the ID`); 
        return { notes: [], connections: [] };
      }

      Logger.log(LOG_CONTEXT, `Getting data from ${frameConfig.names.designProposal} frame with ID: ${frameId}`);
      
      // Use the frame service to get content with connections
      const { stickies, connections } = await MiroFrameService.getFrameContentWithConnections(designFrame);
      
      // Format the data for our component
      const notes = stickies.map(item => ({
        id: item.id,
        content: item.content || ''
      }));
      
      Logger.log(LOG_CONTEXT, `Retrieved ${notes.length} design notes and ${connections.length} connections from ${frameConfig.names.designProposal} frame`);

      // Log the first few notes for debugging
      if (notes.length > 0) {
        Logger.log(LOG_CONTEXT, `First 3 design notes: ${notes.slice(0, 3).map(n => n.content.substring(0, 30) + '...').join(', ')}`);
      }

      return { notes, connections };
    } catch (err) {
      Logger.error(LOG_CONTEXT, 'Error getting design data:', err);
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
      Logger.log(LOG_CONTEXT, 'Triggered design theme refresh');
      
      logUserActivity({
        action: 'refresh_design_decisions'
      });
      
      // Save design proposals to Firebase
      try {
        const proposalTexts = notes.map(note => note.content);
        await saveDesignProposals({
          proposals: proposalTexts,
          boardId: await getCurrentBoardId()
        });
        Logger.log(LOG_CONTEXT, `Saved ${proposalTexts.length} design proposals to Firebase`);
      } catch (error) {
        Logger.error(LOG_CONTEXT, 'Error saving design proposals to Firebase:', error);
      }
      
    } catch (error) {
      Logger.error(LOG_CONTEXT, 'Error refreshing design decisions:', error);
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
        Logger.log(LOG_CONTEXT, `Initial data loaded: ${notes.length} notes, ${connections.length} connections`);
      } catch (error) {
        Logger.error(LOG_CONTEXT, 'Error loading initial design data:', error);
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

      logUserActivity({
        action: 'analysis_click',
        additionalData: {
          showAnalysis
        }
      });
    } catch (error) {
      Logger.error(LOG_CONTEXT, 'Error during analysis:', error);
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
        Logger.log(LOG_CONTEXT, 'Images saved successfully:', imagePaths);
      } else {
        Logger.log(LOG_CONTEXT, `No images found in ${frameConfig.names.sketchReference} frame`); 
      }
    } catch (error) {
      Logger.error(LOG_CONTEXT, 'Error saving images:', error);
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
      Logger.error(LOG_CONTEXT, 'Error parsing images:', error);
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
      // The VoiceRecorder component now handles creating stickies in "Thinking-Dialogue"
      // This callback might be used just to know *that* new points were generated
      // or to trigger a refresh if needed, but shouldn't duplicate sticky creation.
      
      // // Get the design frame ID if we don't have it yet
      // let frameId = designFrameId;
      // if (!frameId) {
      //   frameId = await getDesignFrameId();
      // }
      
      // // Process each point and create sticky notes in the Design-Proposal frame - REMOVED
      // await TranscriptProcessingService.createDesignProposalStickies(
      //   points.map(point => ({ proposal: point })),
      //   'Design-Proposal'
      // );
      
      Logger.log(LOG_CONTEXT, `[DesignDecisions] handleNewDesignPoints received ${points.length} points (sticky creation handled by VoiceRecorder).`);
      
      // Optional: Trigger refresh if necessary, but seems redundant as it's called below?
      // Consider if handleRefreshDesignDecisions is still needed here or if it's implicitly covered.
      // await handleRefreshDesignDecisions(); 
    } catch (error) {
      Logger.error(LOG_CONTEXT, 'Error processing design points callback:', error);
    }
  }, [/* keep relevant dependencies like handleRefreshDesignDecisions if needed */ handleRefreshDesignDecisions]);

  // New function to handle designer role play
  const handleDesignerRolePlay = async () => {
    if (isRolePlayingDesigner) {
      Logger.log(LOG_CONTEXT, '[DESIGNER ROLE PLAY UI] Button clicked but already role playing, ignoring');
      return;
    }
    
    Logger.log(LOG_CONTEXT, '[DESIGNER ROLE PLAY UI] Role play designer button clicked');
    const startTime = Date.now();
    
    try {
      setIsRolePlayingDesigner(true);
      Logger.log(LOG_CONTEXT, `[DESIGNER ROLE PLAY UI] Starting designer role play simulation with model: ${selectedDesignerModel}`);
      
      // If Claude is selected, show a message about the thinking process
      if (selectedDesignerModel === DesignerModelType.CLAUDE) {
        miro.board.notifications.showInfo('Using Claude with extended thinking enabled. This will show the designer\'s thinking process separately from decisions.');
      }
      
      // Call the designer role play service
      const designerThinking = await DesignerRolePlayService.simulateDesigner(selectedDesignerModel);
      Logger.log(LOG_CONTEXT, '[DESIGNER ROLE PLAY UI] Designer role play simulation completed successfully');
      
      // Log detailed information about the thinking content for debugging
      if (designerThinking && designerThinking.thinking && designerThinking.thinking.length > 0) {
        Logger.log(LOG_CONTEXT, '[DESIGNER ROLE PLAY UI] Received thinking content:', {
          thinkingPointsCount: designerThinking.thinking.length,
          firstThinkingPoint: designerThinking.thinking[0].substring(0, 150) + '...',
          isFromAPIExtendedThinking: selectedDesignerModel === DesignerModelType.CLAUDE,
        });
        
        // Set the thinking content in state
        setThinking(designerThinking.thinking);
        
        // Show a success message specifically mentioning the thinking feature
        if (selectedDesignerModel === DesignerModelType.CLAUDE) {
          miro.board.notifications.showInfo('Designer role play completed with extended thinking! View the thinking process in the Thinking-Dialogue frame.');
        }
      } else {
        Logger.log(LOG_CONTEXT, '[DESIGNER ROLE PLAY UI] No thinking content received from the API');
        setThinking([]);
      }
      
      // Refresh design decisions after role play
      Logger.log(LOG_CONTEXT, '[DESIGNER ROLE PLAY UI] Refreshing design decisions');
      await handleRefreshDesignDecisions();
      Logger.log(LOG_CONTEXT, '[DESIGNER ROLE PLAY UI] Design decisions refreshed');
      
      const duration = Date.now() - startTime;
      Logger.log(LOG_CONTEXT, `[DESIGNER ROLE PLAY UI] Complete designer role play process finished in ${duration}ms`);
      
      // Show success notification
      miro.board.notifications.showInfo('Designer role play completed successfully!');

      logUserActivity({
        action: 'designer_role_play',
        additionalData: {
          modelType: selectedDesignerModel,
          transcriptLength: designerThinking?.thinking?.length > 0 ? designerThinking.thinking[0].length : 0,
          hasThinking: designerThinking?.thinking?.length > 0,
          duration: Date.now() - startTime
        }
      });

      // Save thinking dialogues to Firebase
      if (designerThinking && designerThinking.thinking && designerThinking.thinking.length > 0) {
        try {
          await saveThinkingDialogues({
            dialogues: designerThinking.thinking,
            boardId: await getCurrentBoardId(),
            modelType: selectedDesignerModel
          });
          Logger.log(LOG_CONTEXT, `Saved ${designerThinking.thinking.length} thinking dialogues to Firebase`);
        } catch (error) {
          Logger.error(LOG_CONTEXT, 'Error saving thinking dialogues to Firebase:', error);
        }
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      Logger.error(LOG_CONTEXT, `[DESIGNER ROLE PLAY UI] Error role playing designer after ${duration}ms:`, error);
      
      // Create a detailed error message, especially for Claude
      let errorMessage = 'Failed to role play designer. Please try again.';
      
      // Check if it's a Claude-specific error
      if (selectedDesignerModel === DesignerModelType.CLAUDE && error instanceof Error) {
        errorMessage = 'Claude API Error: ';
        
        if (error.message.includes('401')) {
          errorMessage += 'Authentication failed. Please check your Anthropic API key.';
        } else if (error.message.includes('403')) {
          errorMessage += 'Access denied. Your API key may not have permission to use this Claude model.';
        } else if (error.message.includes('429')) {
          errorMessage += 'Rate limit exceeded. Please try again later.';
        } else if (error.message.includes('500') || error.message.includes('502') || error.message.includes('503')) {
          errorMessage += 'Claude service error. The API might be temporarily unavailable.';
        } else if (error.message.includes('Validation error') || error.message.includes('character(s)')) {
          errorMessage += 'Message format validation error. This is likely an issue with our implementation. Please try GPT-4 while we fix this.';
          Logger.error(LOG_CONTEXT, '[DESIGNER ROLE PLAY UI] Validation error details:', error.message);
        } else if (error.message.includes('not_found_error') || error.message.includes('No available Claude models found')) {
          errorMessage += 'None of the Claude models are available with your API key. Please check your Anthropic account permissions and available models.';
          Logger.error(LOG_CONTEXT, '[DESIGNER ROLE PLAY UI] Model availability error details:', error.message);
        } else if (error.message.includes('model:') && error.message.includes('404')) {
          errorMessage += 'The Claude model was not found. This has been fixed to use the correct model name format. Please try again.';
          Logger.error(LOG_CONTEXT, '[DESIGNER ROLE PLAY UI] Model name error:', error.message);
        } else if (error.message.includes('thinking: Input should be') || 
                  error.message.includes('invalid_request_error') ||
                  error.message.includes('thinking.type: Field required') ||
                  error.message.includes('thinking.budget_tokens:') ||
                  error.message.includes('max_tokens must be greater than') ||
                  error.message.includes('content.type') ||
                  error.message.includes('thinking blocks')) {
          errorMessage += 'Error with the extended thinking feature format. This has been fixed and will work the next time you try.';
          Logger.error(LOG_CONTEXT, '[DESIGNER ROLE PLAY UI] Thinking parameter error:', error.message);
        } else {
          // Include the actual error message for debugging
          errorMessage += error.message;
        }
      }
      
      // Show error to user
      miro.board.notifications.showError(errorMessage);
    } finally {
      setIsRolePlayingDesigner(false);
      Logger.log(LOG_CONTEXT, '[DESIGNER ROLE PLAY UI] Reset role playing state');
    }
  };

  // Handle model change
  const handleModelChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedDesignerModel(event.target.value as DesignerModelType);
    Logger.log(LOG_CONTEXT, `[DESIGNER ROLE PLAY UI] Model changed to: ${event.target.value}`);
  };

  // New function to handle design theme generation
  const handleGenerateThemes = async () => {
    if (isGeneratingThemes) {
      Logger.log(LOG_CONTEXT, '[DESIGN THEMES UI] Button clicked but already generating themes, ignoring');
      return;
    }
    
    Logger.log(LOG_CONTEXT, '[DESIGN THEMES UI] Generate themes button clicked');
    const startTime = Date.now();
    
    try {
      setIsGeneratingThemes(true);
      Logger.log(LOG_CONTEXT, '[DESIGN THEMES UI] Starting theme generation');
      
      await DesignThemeService.generateAndVisualizeThemes();
      Logger.log(LOG_CONTEXT, '[DESIGN THEMES UI] Theme generation completed successfully');
      
      const duration = Date.now() - startTime;
      Logger.log(LOG_CONTEXT, `[DESIGN THEMES UI] Complete theme generation process finished in ${duration}ms`);
      
      // Show success notification
      miro.board.notifications.showInfo('Design themes generated successfully!');

      logUserActivity({
        action: 'generate_themes',
        additionalData: {
          duration: Date.now() - startTime
        }
      });

      // Get the generated themes and save to Firebase
      try {
        const generatedThemes = await DesignThemeService.getCurrentThemesFromBoard();
        if (generatedThemes.length > 0) {
          await saveDesignThemes({
            themes: generatedThemes.map(theme => ({
              name: theme.name,
              color: theme.color,
              description: theme.description || ''
            })),
            boardId: await getCurrentBoardId()
          });
          Logger.log(LOG_CONTEXT, `Saved ${generatedThemes.length} design themes to Firebase`);
        }
      } catch (error) {
        Logger.error(LOG_CONTEXT, 'Error saving design themes to Firebase:', error);
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      Logger.error(LOG_CONTEXT, `[DESIGN THEMES UI] Error generating themes after ${duration}ms:`, error);
      
      // Show error to user
      miro.board.notifications.showError('Failed to generate design themes. Please try again.');
    } finally {
      setIsGeneratingThemes(false);
      Logger.log(LOG_CONTEXT, '[DESIGN THEMES UI] Reset theme generation state');
    }
  };

  // Initial frame ID fetch
  useEffect(() => {
    getDesignFrameId();
  }, []);

  // Keep this useEffect for sticky char limit initialization
  useEffect(() => {
    // Set the initial sticky character limit from the service
    setStickyCharLimit(StickyNoteService.getStickyCharLimit());
  }, []);

  // Keep this handler function for programmatic updates to sticky char limit
  const handleStickyCharLimitChange = (newLimit: number) => {
    if (!isNaN(newLimit) && newLimit > 0) {
      setStickyCharLimit(newLimit);
      StickyNoteService.setStickyCharLimit(newLimit);
      Logger.log(LOG_CONTEXT, `Sticky note character limit updated to ${newLimit}`);
      miro.board.notifications.showInfo(`Sticky note character limit updated to ${newLimit}`);
    }
  };

  const callClaudeDesigner = async (designPrompt: string): Promise<DesignOutput> => {
    Logger.log(LOG_CONTEXT, `[DesignDecisions] Calling Claude designer with prompt length: ${designPrompt.length}`);
    Logger.log(LOG_CONTEXT, `[DesignDecisions] Prompt preview: ${designPrompt.substring(0, 100)}...`);
    
    try {
      const start = performance.now();
      Logger.log(LOG_CONTEXT, '[DesignDecisions] Sending request to /api/designer-roleplay');
      
      const response = await fetch('/api/designer-roleplay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: designPrompt,
          model: 'claude-3-opus-20240229',
          useClaudeDirect: true
        })
      });

      const duration = performance.now() - start;
      Logger.log(LOG_CONTEXT, `[DesignDecisions] Request completed in ${duration.toFixed(0)}ms`);
      
      // Log response status
      Logger.log(LOG_CONTEXT, `[DesignDecisions] Response status: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        Logger.error(LOG_CONTEXT, `[DesignDecisions] Error response from API: ${response.status} ${response.statusText}`);
        
        // Try to extract error details if possible
        try {
          const errorText = await response.text();
          Logger.error(LOG_CONTEXT, `[DesignDecisions] Error details: ${errorText}`);
          
          try {
            // Try to parse as JSON
            const errorJson = JSON.parse(errorText);
            Logger.error(LOG_CONTEXT, `[DesignDecisions] Parsed error: ${JSON.stringify(errorJson)}`);
            
            if (errorJson?.error?.message) {
              throw new Error(errorJson.error.message);
            }
          } catch (e) {
            // Not JSON or JSON parsing failed
            Logger.error(LOG_CONTEXT, '[DesignDecisions] Could not parse error as JSON');
          }
        } catch (e) {
          Logger.error(LOG_CONTEXT, '[DesignDecisions] Could not extract error text', e);
        }
        
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      Logger.log(LOG_CONTEXT, '[DesignDecisions] API response received:', {
        thinkingPointsCount: data.thinking?.length || 0,
        designDecisionsCount: data.designDecisions?.length || 0,
        firstThinkingPreview: data.thinking && data.thinking.length > 0 
          ? data.thinking[0].substring(0, 100) + '...' 
          : 'None',
        firstDecisionPreview: data.designDecisions && data.designDecisions.length > 0 
          ? data.designDecisions[0].substring(0, 100) + '...' 
          : 'None'
      });
      
      // Validate response data
      if (!data.designDecisions || !Array.isArray(data.designDecisions)) {
        Logger.error(LOG_CONTEXT, '[DesignDecisions] Invalid response format - missing designDecisions array', data);
        throw new Error('Invalid API response: missing designDecisions');
      }
      
      Logger.log(LOG_CONTEXT, '[DesignDecisions] Processing complete, returning design output');
      return data;
    } catch (error) {
      Logger.error(LOG_CONTEXT, '[DesignDecisions] Error calling Claude designer:', error);
      
      // Enhanced error handling
      let errorMessage = 'Failed to generate design decisions';
      
      if (error instanceof Error) {
        Logger.error(LOG_CONTEXT, '[DesignDecisions] Error details:', error.message);
        Logger.error(LOG_CONTEXT, '[DesignDecisions] Error stack:', error.stack);
        
        errorMessage = error.message;
        
        // Detect specific error patterns
        if (
          error.message.includes('thinking.type: Field required') ||
          error.message.includes('thinking.budget_tokens:') ||
          error.message.includes('max_tokens must be greater than') ||
          error.message.includes('thinking: Input should be') ||
          error.message.includes('invalid_request_error') ||
          error.message.includes('content.type') ||
          error.message.includes('thinking blocks')
        ) {
          Logger.error(LOG_CONTEXT, '[DesignDecisions] Detected Claude API format error');
          errorMessage = 'There was an error with the extended thinking feature format. This has been fixed for future attempts.';
        }
      }
      
      throw new Error(errorMessage);
    }
  };

  // Add a helper function to get the current board ID
  const getCurrentBoardId = async (): Promise<string> => {
    try {
      const boardInfo = await miro.board.getInfo();
      return boardInfo.id;
    } catch (error) {
      Logger.error(LOG_CONTEXT, 'Error getting board ID:', error);
      return 'unknown-board';
    }
  };

  // Fetch images from Miro (Sketch-Reference frame)
  const handleFetchImages = useCallback(async () => {
    setIsSavingImage(true);
    Logger.log(LOG_CONTEXT, 'Starting image fetch...');
    try {
      await MiroService.getAllImagesFromFrame();
      Logger.log(LOG_CONTEXT, 'Images fetched and saved successfully');
    } catch (error) {
      Logger.error(LOG_CONTEXT, 'Error fetching or saving images:', error);
      // Optionally check if error is specific to frame not found
      if (error instanceof Error && error.message.includes('frame not found')) {
        Logger.log(LOG_CONTEXT, `No images found in ${frameConfig.names.sketchReference} frame`);
      }
    } finally {
      setIsSavingImage(false);
    }
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
                  //Here is where we can enable or disable the real time critique
                  enableRealTimeCritique={false}
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
                  <div style={{ 
                    display: 'flex', 
                    gap: '8px',
                    alignItems: 'center' 
                  }}>
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
                        flex: '1',
                        justifyContent: 'flex-start'
                      }}
                    >
                      <span style={{ fontSize: '15px', minWidth: '16px', textAlign: 'center' }}>🧠</span>
                      {isRolePlayingDesigner ? 'Designing...' : 'Role Play Designer'}
                    </button>
                    <select 
                      value={selectedDesignerModel}
                      onChange={handleModelChange}
                      disabled={isRolePlayingDesigner}
                      style={{
                        padding: '8px 10px',
                        borderRadius: '6px',
                        border: '1px solid #e0e0e0',
                        backgroundColor: '#ffffff',
                        color: '#555',
                        fontWeight: 500,
                        fontSize: '14px',
                        cursor: isRolePlayingDesigner ? 'not-allowed' : 'pointer',
                        minWidth: '110px'
                      }}
                    >
                      <option value={DesignerModelType.GPT4}>GPT-4 (Balanced)</option>
                      <option value={DesignerModelType.CLAUDE}>Claude (Creative)</option>
                      <option value={DesignerModelType.GPT_O3}>GPT O3 (Fast)</option>
                      <option value={DesignerModelType.GEMINI}>Gemini 2.5 Pro (Visual)</option>
                    </select>
                  </div>
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
                  <div style={{ 
                    display: 'flex', 
                    gap: '8px',
                    alignItems: 'center' 
                  }}>
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
                      <span style={{ fontSize: '15px', minWidth: '16px', textAlign: 'center' }}>✨</span>
                      {isGeneratingThemes ? 'Generating...' : 'Generate Design Themes'}
                    </button>
                  </div>
                </div>
                
                {/* Knowledge Base Management Section */}
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
                    <span style={{ fontSize: '15px', minWidth: '16px', textAlign: 'center' }}>📚</span>
                    Knowledge Base
                  </h3>
                  <div style={{ 
                    display: 'flex', 
                    gap: '8px',
                    alignItems: 'center' 
                  }}>
                    <button
                      onClick={() => window.open('/knowledge', '_blank')}
                      className="button button-secondary"
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
                        cursor: 'pointer',
                        width: '100%',
                        justifyContent: 'flex-start'
                      }}
                    >
                      <span style={{ fontSize: '15px', minWidth: '16px', textAlign: 'center' }}>💾</span>
                      Manage Knowledge Base
                    </button>
                  </div>
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
            <p style={{ margin: 0 }}>No design decisions found in the "{frameConfig.names.designProposal}" frame.</p>
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