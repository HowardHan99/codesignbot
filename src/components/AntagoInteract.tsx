/**
 * Main component for handling antagonistic analysis of design decisions.
 * Coordinates between UI components and services while managing the analysis state.
 */
'use client';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { OpenAIService } from '../services/openaiService';
import { MiroService } from '../services/miroService';
import { AnalysisControls } from './AnalysisControls';
import { AnalysisResults } from './AnalysisResults';
import ResponseStore from '../utils/responseStore';
import { saveAnalysis, getSynthesizedPoints, logUserActivity, saveDesignThemes } from '../utils/firebase';
import { splitResponse } from '../utils/textProcessing';
import { VoiceRecorder } from './VoiceRecorder';
import { FileUploadTest } from './FileUploadTest';
import { TranscriptProcessingService } from '../services/transcriptProcessingService';
import { DesignThemeService } from '../services/designThemeService';
import { EmbeddingService } from '../services/embeddingService';
import { Logger } from '../utils/logger';
import { frameConfig, stickyConfig } from '../utils/config';
import { MiroApiClient } from '../services/miro/miroApiClient';
import { StickyNoteService } from '../services/miro/stickyNoteService';

/**
 * Interface for themed response
 */
interface ThemedResponse {
  name: string;
  color: string;
  points: string[];
  isSelected?: boolean;
}

interface DesignThemeWithSelection {
  name: string;
  description: string;
  relatedPoints: string[];
  color: string;
  isSelected?: boolean;
}

// Add interface for variations to send
interface VariationsToSend {
  rag: boolean;
  principles: boolean;
  prompt: boolean;
}

interface AntagoInteractProps {
  stickyNotes: string[];          // Array of sticky note contents from the design decisions
  onComplete?: () => void;        // Callback when analysis is complete
  onResponsesUpdate?: (responses: string[]) => void;  // Callback to update parent with new responses
  shouldRefresh?: boolean;        // Flag to trigger a refresh of the analysis
  imageContext?: string;          // Context from analyzed images
}

interface StoredResponses {
  normal: string;
  persuasive?: string;
  aggressive?: string;
  critical?: string;
}

const AntagoInteract: React.FC<AntagoInteractProps> = ({ 
  stickyNotes, 
  onComplete,
  onResponsesUpdate,
  shouldRefresh = false,
  imageContext
}) => {
  // State management for responses and UI
  const [responses, setResponses] = useState<string[]>([]);
  const [themedResponses, setThemedResponses] = useState<ThemedResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSimplifiedMode, setIsSimplifiedMode] = useState(() => {
    // Initialize from localStorage if available, otherwise default to false
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('isSimplifiedMode');
      return saved ? JSON.parse(saved) : false;
    }
    return false;
  });
  
  // New state for thinking dialogue toggle
  const [useThinkingDialogue, setUseThinkingDialogue] = useState(() => {
    // Initialize from localStorage if available, otherwise default to false
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('useThinkingDialogue');
      return saved ? JSON.parse(saved) : false;
    }
    return false;
  });
  
  // State for storing results with thinking dialogue
  const [thinkingResponses, setThinkingResponses] = useState<string[]>([]);
  const [thinkingThemedResponses, setThinkingThemedResponses] = useState<ThemedResponse[]>([]);
  const [thinkingSimplifiedResponses, setThinkingSimplifiedResponses] = useState<string[]>([]);
  const [storedThinkingFullResponses, setStoredThinkingFullResponses] = useState<StoredResponses>({ normal: '' });
  const [storedThinkingSimplifiedResponses, setStoredThinkingSimplifiedResponses] = useState<StoredResponses>({ normal: '' });
  
  const [simplifiedResponses, setSimplifiedResponses] = useState<string[]>([]);
  const [selectedTone, setSelectedTone] = useState<string>('');
  const [synthesizedPoints, setSynthesizedPoints] = useState<string[]>([]);
  const [designChallenge, setDesignChallenge] = useState<string>('');
  const [consensusPoints, setConsensusPoints] = useState<string[]>([]);
  const [isChangingTone, setIsChangingTone] = useState(false);
  const [storedFullResponses, setStoredFullResponses] = useState<StoredResponses>({ normal: '' });
  const [storedSimplifiedResponses, setStoredSimplifiedResponses] = useState<StoredResponses>({ normal: '' });
  const [useThemedDisplay, setUseThemedDisplay] = useState<boolean>(true);
  
  // Add new state variables for varied response generation
  const [designPrinciplesText, setDesignPrinciplesText] = useState<string | null>(null);
  const [customPromptText, setCustomPromptText] = useState<string | null>(null);
  const [variationsToSend, setVariationsToSend] = useState<VariationsToSend>({
    rag: false,
    principles: false,
    prompt: false
  });
  
  // Singleton instance for managing response storage
  const responseStore = ResponseStore.getInstance();
  
  // Ref to prevent duplicate processing
  const processedRef = useRef(false);
  const processingRef = useRef(false);  // New ref to prevent concurrent processing

  // Add a state variable to track the current RAG content
  const [currentRagContent, setCurrentRagContent] = useState<string>('');

  // Add a separate loading state for variations
  const [isVariationLoading, setIsVariationLoading] = useState<boolean>(false);

  // Save to localStorage whenever useThinkingDialogue changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('useThinkingDialogue', JSON.stringify(useThinkingDialogue));
    }
  }, [useThinkingDialogue]);
  
  // Save to localStorage whenever isSimplifiedMode changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('isSimplifiedMode', JSON.stringify(isSimplifiedMode));
    }
  }, [isSimplifiedMode]);

  // Fetch design challenge and consensus points on mount
  useEffect(() => {
    Promise.all([
      MiroService.getDesignChallenge(),
      MiroService.getConsensusPoints()
    ]).then(([challenge, consensus]) => {
      // console.log('Fetched initial consensus points:', consensus);
      setDesignChallenge(challenge);
      setConsensusPoints(consensus);
    });
  }, []);

  // Fetch synthesized points on mount
  useEffect(() => {
    const fetchSynthesizedPoints = async () => {
      try {
        const points = await getSynthesizedPoints();
        setSynthesizedPoints(points);
      } catch (error) {
        // console.error('Error fetching synthesized points:', error);
      }
    };
    fetchSynthesizedPoints();
  }, []);

  /**
   * Process sticky notes to generate analysis
   */
  const processNotes = useCallback(async (notes: string[], forceProcess: boolean = false) => {
    // If forcing process, reset state flags first
    if (forceProcess) {
      Logger.log('AntagoInteract', 'Force processing requested, resetting state');
      processedRef.current = false;
      processingRef.current = false;
    }
    
    // Don't process if already processed and not forcing
    if (processedRef.current && !forceProcess) {
      Logger.log('AntagoInteract', 'Notes already processed, skipping processing');
      return;
    }
    
    // Prevent concurrent processing
    if (processingRef.current) {
      Logger.log('AntagoInteract', 'Already processing notes, skipping duplicate processing');
      return;
    }
    
    Logger.log('AntagoInteract', `Processing ${notes.length} notes`, { forceProcess });
    
    try {
      // Mark as processing
      processingRef.current = true;
      processedRef.current = true;
      setLoading(true);
      setSelectedTone('');
      
      // Get thinking dialogue context if the toggle is enabled
      let dialogueContext = ''; // Combined raw content
      let thinkingContextString = ''; // Parsed thinking process
      let ragContextString = ''; // Parsed external knowledge/RAG
      const THINKING_MARKER = "Designer Process & Concepts";
      
      Logger.log('AntagoInteract', 'Checking for thinking dialogue/RAG content', { useThinkingDialogue });
      
      // Always check for the frame, even if toggle is off (for debugging)
      try {
        const allFrames = await miro.board.get({ type: 'frame' });
        const thinkingFrame = allFrames.find(f => f.title === frameConfig.names.thinkingDialogue);
        const enhancedContextFrame = allFrames.find(f => f.title === frameConfig.names.ragContent);
        const variedResponsesFrame = allFrames.find(f => f.title === frameConfig.names.variedResponses);
        const agentPromptFrame = allFrames.find(f => f.title === frameConfig.names.agentPrompt);
        
        Logger.log('AntagoInteract', 'Searching for frames', { 
          foundThinking: !!thinkingFrame,
          foundEnhancedContext: !!enhancedContextFrame,
          foundVariedResponses: !!variedResponsesFrame,
          foundAgentPrompt: !!agentPromptFrame
        });
        
        // Function to extract content from a frame
        const extractContentFromFrame = async (frame: any) => {
          if (!frame) return '';
          
          // Get both sticky notes and text elements from the frame
          const stickyNotesFromBoard = await miro.board.get({ type: 'sticky_note' });
          const frameStickyNotes = stickyNotesFromBoard.filter(
            note => note.parentId === frame.id
          );
          const textElements = await miro.board.get({ type: 'text' });
          const frameTextElements = textElements.filter(
            text => text.parentId === frame.id
          );
          
          // Combine content from both sources
          const stickyNotesContent = frameStickyNotes.map(note => note.content || '').join('\n');
          const textElementsContent = frameTextElements.map(text => text.content || '').join('\n');
          return [stickyNotesContent, textElementsContent].filter(Boolean).join('\n\n').trim();
        };
        
        // Extract content from each frame separately
        thinkingContextString = await extractContentFromFrame(thinkingFrame);
        ragContextString = await extractContentFromFrame(enhancedContextFrame);
        
        // Extract design principles and custom agent prompt from agent prompt frame (not varied responses)
        if (agentPromptFrame) {
          // Use IDs instead of tag names
          const DESIGN_PRINCIPLES_TAG_ID = "3458764626534754570";
          const AGENT_SYSTEM_PROMPT_TAG_ID = "3458764626530355983";
          
          // Get sticky notes from the agent prompt frame
          const stickyNotesFromBoard = await miro.board.get({ type: 'sticky_note' });
          const frameStickyNotes = stickyNotesFromBoard.filter(
            note => note.parentId === agentPromptFrame.id
          );
          
          Logger.log('AntagoInteract', 'Found agent prompt stickynotes ', {
            frameStickyNotes: frameStickyNotes
          });
          
          // Find sticky notes with specific tag IDs
          const designPrinciplesSticky = frameStickyNotes.find(note => {
            // @ts-ignore - Miro API types issue
            return note.tagIds && note.tagIds.includes(DESIGN_PRINCIPLES_TAG_ID);
          });
          
          const agentPromptSticky = frameStickyNotes.find(note => {
            // @ts-ignore - Miro API types issue
            return note.tagIds && note.tagIds.includes(AGENT_SYSTEM_PROMPT_TAG_ID);
          });
          
          // Update state with found content
          if (designPrinciplesSticky) {
            setDesignPrinciplesText(designPrinciplesSticky.content || null);
          }
          
          if (agentPromptSticky) {
            setCustomPromptText(agentPromptSticky.content || null);
          }
          
          Logger.log('AntagoInteract', 'Found agent prompt content', {
            designPrinciples: !!designPrinciplesSticky,
            agentPrompt: !!agentPromptSticky
          });
        }
        
        // Update the current RAG content state
        setCurrentRagContent(ragContextString);
        
        // Combine for backwards compatibility if needed
        dialogueContext = [ragContextString, thinkingContextString].filter(Boolean).join('\n\n');
        
        // Set useThinkingDialogue toggle state to false if no enhanced context was actually found/parsed
        if (!thinkingContextString && !ragContextString && useThinkingDialogue) {
          Logger.log('AntagoInteract', 'Setting useThinkingDialogue to false (no enhanced context found)');
          setUseThinkingDialogue(false); // Turn off toggle if no context to enhance with
        }
      } catch (dialogueError) {
        Logger.error('AntagoInteract', 'Error fetching/parsing thinking dialogue/RAG content', dialogueError);
      }
      
      // --- Message Construction --- 
      // Directly use the notes parameter passed from the parent component
      const baseMessage = imageContext 
        ? `${notes.map((noteContent, index) => 
            `Design Decision ${index + 1}: ${noteContent || ''}`
          ).join('\n')}\n\nRelevant visual context from design sketches:\n${imageContext}`
        : notes.map((noteContent, index) => 
            `Design Decision ${index + 1}: ${noteContent || ''}`
          ).join('\n');
        
      // Construct the enhanced message with clear labels for the LLM
      let enhancedContextParts: string[] = [];
      if (ragContextString) {
        enhancedContextParts.push(`Relevant Knowledge Context:\n${ragContextString}`);
      }
      if (thinkingContextString) {
        enhancedContextParts.push(`Thinking Process Context:\n${thinkingContextString}`);
      }
      
      const enhancedMessageWithContext = enhancedContextParts.length > 0
        ? `${baseMessage}\n\n${enhancedContextParts.join('\n\n')}`
        : baseMessage;

      // Log final message lengths for debugging
      Logger.log('AntagoInteract', 'Generated message contexts', {
        baseLength: baseMessage.length,
        enhancedLength: enhancedMessageWithContext.length,
        hasDialogue: !!dialogueContext, // Use original combined content flag for simplicity here
        hasThinkingParsed: !!thinkingContextString,
        hasRAGParsed: !!ragContextString
      });
      
      // --- End Message Construction ---
      
      // Simply read existing themes from the board and their selection state
      console.log('Reading themes from the board...');
      const existingThemes = await DesignThemeService.getCurrentThemesFromBoard();
      console.log(`Found ${existingThemes.length} existing themes on the board`);
      
      // If no themes exist on the board, we can't do themed analysis
      if (existingThemes.length === 0) {
        console.log('No themes found on board. Using standard analysis without themes.');
        // Generate standard analysis
        try {
          const generateAnalysis = async (
            messageContext: string,
            setResultsFunc: React.Dispatch<React.SetStateAction<string[]>>,
            setStoredResponsesFunc: React.Dispatch<React.SetStateAction<StoredResponses>>
          ) => {
            // Pass design principles and custom prompt to the analysis service
            const response = await OpenAIService.generateAnalysis(
              messageContext, 
              designChallenge,
              synthesizedPoints,
              consensusPoints,
              designPrinciplesText || undefined,
              customPromptText || undefined
            );
            
            setResultsFunc([response]);
            setStoredResponsesFunc({ normal: response });
            return response;
          };
          
          // Run standard analysis first to show results quickly
          Logger.log('AntagoInteract', 'Generating standard analysis first');
          const standardResponse = await generateAnalysis(
            baseMessage, 
            setResponses, 
            setStoredFullResponses
          );
          
          // Update parent immediately with standard response
          onResponsesUpdate?.(splitResponse(standardResponse));
          
          // Mark as no longer loading once we have the initial response 
          setLoading(false);
          
          // Now generate the enhanced response in the background if needed
          if (thinkingContextString || ragContextString) {
            // Use IIFE to create background process
            (async () => {
              try {
                const enhancedResponse = await generateAnalysis(
                  enhancedMessageWithContext,
                  setThinkingResponses,
                  setStoredThinkingFullResponses
                );
                
                Logger.log('AntagoInteract', 'Thinking dialogue enhanced analysis complete', {
                  standardLength: standardResponse?.length || 0,
                  enhancedLength: enhancedResponse?.length || 0,
                  hasEnhancedResults: !!enhancedResponse
                });
              } catch (error) {
                console.error('Error generating enhanced analysis in background:', error);
              }
            })();
          }
          
          // If simplified mode is active, generate the simplified version in the background
          if (isSimplifiedMode) {
            (async () => {
              try {
                setIsChangingTone(true);
                const simplified = await OpenAIService.simplifyAnalysis(standardResponse);
                setSimplifiedResponses([simplified]);
                setStoredSimplifiedResponses({ normal: simplified });
                
                // Update UI with simplified response if in simplified mode
                if (isSimplifiedMode && !useThemedDisplay) {
                  onResponsesUpdate?.(splitResponse(simplified));
                }
                
                setIsChangingTone(false);
              } catch (error) {
                console.error('Error generating simplified response:', error);
                setIsChangingTone(false);
              }
            })();
          }
          
          // Save to Firebase in the background
          (async () => {
            try {
              // First save the main analysis data
              const analysisData = {
                timestamp: null,
                designChallenge: designChallenge,
                decisions: notes,
                analysis: {
                  full: splitResponse(standardResponse),
                  simplified: []
                },
                tone: selectedTone || 'normal',
                consensusPoints: consensusPoints,
                hasThinkingDialogue: useThinkingDialogue
              };
              await saveAnalysis(analysisData);
              
              // Log user activity
              logUserActivity({
                action: 'generate_analysis',
                additionalData: {
                  hasThemes: false,
                  themedDisplay: false,
                  challengeLength: designChallenge?.length || 0,
                  consensusCount: consensusPoints?.length || 0,
                  useThinkingDialogue: useThinkingDialogue,
                  thinkingDialogueLength: dialogueContext?.length || 0
                }
              });
            } catch (error) {
              console.error('Error saving analysis data to Firebase:', error);
              // Error handled silently to not disrupt user experience
            }
          })();
          
          // Complete the loading state
          setLoading(false);
          processingRef.current = false;
          onComplete?.();
        } catch (error) {
          console.error('Error generating standard analysis:', error);
          setError('Failed to generate analysis. Please try again.');
          setLoading(false);
          processingRef.current = false;
          onComplete?.();
        }
        
        // Skip the rest of the themed processing
        return;
      }
      
      // Read theme selection state from localStorage
      let selectedThemes = [...existingThemes]; // Default to using all themes
      
      if (typeof window !== 'undefined') {
        try {
          const savedSelectionJson = localStorage.getItem('themeSelectionState');
          if (savedSelectionJson) {
            console.log('Reading theme selection state from localStorage');
            const savedSelection = JSON.parse(savedSelectionJson);
            
            if (Array.isArray(savedSelection) && savedSelection.length > 0) {
              // Create a map of theme names to selection state
              const selectionMap = new Map<string, boolean>();
              savedSelection.forEach(item => {
                selectionMap.set(item.name.toLowerCase(), item.isSelected !== false);
              });
              
              // Filter themes based on selection state
              const filteredThemes = existingThemes.filter(theme => {
                // Try to find this theme in the selection map
                for (const [savedName, isSelected] of selectionMap.entries()) {
                  if (theme.name.toLowerCase() === savedName || 
                      theme.name.toLowerCase().includes(savedName) || 
                      savedName.includes(theme.name.toLowerCase())) {
                    return isSelected; // Keep only if selected
                  }
                }
                return true; // If not found in selection map, include by default
              });
              
              // Use filtered themes if we have any
              if (filteredThemes.length > 0) {
                selectedThemes = filteredThemes;
                console.log(`Using ${selectedThemes.length} selected themes from localStorage`);
              }
            }
          }
        } catch (e) {
          console.error('Error reading theme selection from localStorage:', e);
        }
      }
      
      // No need to regenerate themes or recalculate positions - the existing themes already have positions
 
      // Function to generate themed analysis
      const generateThemedAnalysis = async (
        messageContext: string,
        setResponseFunc: React.Dispatch<React.SetStateAction<string[]>>,
        setThemedResponsesFunc: React.Dispatch<React.SetStateAction<ThemedResponse[]>>,
        setStoredResponsesFunc: React.Dispatch<React.SetStateAction<StoredResponses>>
      ) => {
        // Generate all theme analyses in parallel with standard response
        const [themedResponsesData, response] = await Promise.all([
          // Generate all theme analyses in parallel, passing design principles and custom prompt
          OpenAIService.generateAllThemeAnalyses(
            messageContext,
            selectedThemes,
            designChallenge,
            consensusPoints,
            designPrinciplesText || undefined,
            customPromptText || undefined
          ),
          
          // Also generate original response for compatibility and fallback
          OpenAIService.generateAnalysis(
            messageContext, 
            designChallenge,
            synthesizedPoints,
            consensusPoints,
            designPrinciplesText || undefined,
            customPromptText || undefined
          )
        ]);
        
        // Store results
        setResponseFunc([response]);
        setThemedResponsesFunc(themedResponsesData);
        setStoredResponsesFunc({ normal: response });
        
        return { themedResponsesData, response };
      };

      // Generate standard themed analysis first to show results quickly
      Logger.log('AntagoInteract', 'Generating standard themed analysis first');
      const standardResults = await generateThemedAnalysis(
        baseMessage, 
        setResponses, 
        setThemedResponses, 
        setStoredFullResponses
      );

      // Create a combined list of all points for backward compatibility
      const allPoints = standardResults.themedResponsesData.flatMap(theme => theme.points);

      // Update parent with appropriate responses immediately 
      if (useThemedDisplay) {
        // If using themed display, pass all themed points
        onResponsesUpdate?.(allPoints);
      } else {
        // Otherwise, use the standard response format
        onResponsesUpdate?.(splitResponse(standardResults.response));
      }

      // Mark as no longer loading once we have the initial results
      setLoading(false);

      // Now generate the enhanced response in the background if needed
      if (thinkingContextString || ragContextString) {
        // Use IIFE to create background process
        (async () => {
          try {
            const enhancedResults = await generateThemedAnalysis(
              enhancedMessageWithContext,
              setThinkingResponses,
              setThinkingThemedResponses,
              setStoredThinkingFullResponses
            );
            
            Logger.log('AntagoInteract', 'Thinking dialogue enhanced themed analysis complete', {
              standardThemes: standardResults.themedResponsesData.length || 0,
              enhancedThemes: enhancedResults.themedResponsesData.length || 0
            });
          } catch (error) {
            console.error('Error generating enhanced themed analysis in background:', error);
          }
        })();
      }

      // If simplified mode is active, generate the simplified version in the background
      if (isSimplifiedMode) {
        (async () => {
          try {
            setIsChangingTone(true);
            
            // Simplify standard response
            const simplified = await OpenAIService.simplifyAnalysis(standardResults.response);
            setSimplifiedResponses([simplified]);
            setStoredSimplifiedResponses({ normal: simplified });
            
            // Update UI with simplified response if in simplified mode and not themed display
            if (isSimplifiedMode && !useThemedDisplay) {
              onResponsesUpdate?.(splitResponse(simplified));
            }
            
            setIsChangingTone(false);
          } catch (error) {
            console.error('Error generating simplified response:', error);
            setIsChangingTone(false);
          }
        })();
      }

      // Save to Firebase in the background
      (async () => {
        try {
          // First save the main analysis data
          const analysisData = {
            timestamp: null,
            designChallenge: designChallenge,
            decisions: notes,
            analysis: {
              full: useThemedDisplay ? standardResults.themedResponsesData.flatMap(theme => theme.points) : splitResponse(standardResults.response),
              simplified: []
            },
            tone: selectedTone || 'normal',
            consensusPoints: consensusPoints,
            hasThinkingDialogue: useThinkingDialogue
          };
          await saveAnalysis(analysisData);
          
          // If we have themed responses, also save them as design themes
          if (standardResults.themedResponsesData.length > 0) {
            await saveDesignThemes({
              themes: standardResults.themedResponsesData.map(theme => ({
                name: theme.name,
                color: theme.color,
                description: theme.points.join(' | ')
              }))
            });
          }
          
          // Log user activity
          logUserActivity({
            action: 'generate_analysis',
            additionalData: {
              hasThemes: standardResults.themedResponsesData.length > 0, 
              themedDisplay: useThemedDisplay,
              challengeLength: designChallenge?.length || 0,
              consensusCount: consensusPoints?.length || 0,
              useThinkingDialogue: useThinkingDialogue,
              thinkingDialogueLength: dialogueContext?.length || 0
            }
          });
        } catch (error) {
          console.error('Error saving analysis data to Firebase:', error);
          // Error handled silently to not disrupt user experience
        }
      })();
      
      // Add a small delay to ensure all background processes have started
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Clean up and complete
      processingRef.current = false;
      
      // Call onComplete to signal we have at least the initial results ready
      onComplete?.();
    } catch (error) {
      setError('Failed to process notes: ' + (error as Error).message);
      setLoading(false);
      processingRef.current = false;
    }
  }, [designChallenge, imageContext, isSimplifiedMode, onComplete, onResponsesUpdate, selectedTone, synthesizedPoints, consensusPoints, useThemedDisplay, useThinkingDialogue]);

  // Process notes when they change or when shouldRefresh is true
  useEffect(() => {
    if (stickyNotes.length > 0) {
      processNotes(stickyNotes, shouldRefresh || false)
        .catch(console.error);
    }
  }, [stickyNotes, shouldRefresh, processNotes]);

  /**
   * Toggle between standard and thinking dialogue enhanced analysis
   */
  const handleThinkingDialogueToggle = useCallback(() => {
    setUseThinkingDialogue((prev: boolean) => {
      const newMode = !prev;
      
      // Ensure we have the thinking dialogue results before enabling
      if (newMode && thinkingResponses.length === 0) {
        // If we don't have thinking dialogue results, we can't toggle
        console.warn('Thinking dialogue results not available');
        return prev;
      }
      
      // Update UI with appropriate responses based on new mode
      if (useThemedDisplay) {
        // If themed display is active, update with appropriate themed responses
        const themedResponsesToUse = newMode ? thinkingThemedResponses : themedResponses;
        if (themedResponsesToUse.length > 0) {
          const allPoints = themedResponsesToUse.flatMap(theme => theme.points);
          onResponsesUpdate?.(allPoints);
        }
      } else {
        // Otherwise update with standard or simplified responses
        const responsesToUse = isSimplifiedMode 
          ? (newMode ? thinkingSimplifiedResponses : simplifiedResponses)
          : (newMode ? thinkingResponses : responses);
          
        if (responsesToUse.length > 0) {
          onResponsesUpdate?.(splitResponse(responsesToUse[0]));
        }
      }
      
      // Log the toggle action
      logUserActivity({
        action: 'toggle_thinking_dialogue',
        additionalData: {
          newMode,
          hasThinkingResults: thinkingResponses.length > 0
        }
      });
      
      return newMode;
    });
  }, [
    thinkingResponses, 
    thinkingThemedResponses, 
    thinkingSimplifiedResponses, 
    themedResponses, 
    responses, 
    simplifiedResponses, 
    useThemedDisplay, 
    isSimplifiedMode, 
    onResponsesUpdate
  ]);

  // Handle mode toggle
  const handleModeToggle = useCallback(() => {
    // Don't process mode toggle if themed display is active
    if (useThemedDisplay) return;
    
    setIsSimplifiedMode((prev: boolean) => {
      const newMode = !prev;
      
      // Get the correct response data based on thinking dialogue toggle
      const currentResponses = useThinkingDialogue ? thinkingResponses : responses;
      const currentSimplifiedResponses = useThinkingDialogue ? thinkingSimplifiedResponses : simplifiedResponses;
      
      // If switching to simplified mode but we don't have simplified responses yet
      if (newMode && currentResponses.length > 0 && !currentSimplifiedResponses.length) {
        // Generate simplified version on demand
        (async () => {
          try {
            setIsChangingTone(true);
            
            // Choose the correct response to simplify based on current toggle state
            const responseToSimplify = useThinkingDialogue ? thinkingResponses[0] : responses[0];
            const simplified = await OpenAIService.simplifyAnalysis(responseToSimplify);
            
            // Store in the correct state variable based on current toggle
            if (useThinkingDialogue) {
              setThinkingSimplifiedResponses([simplified]);
              setStoredThinkingSimplifiedResponses({ normal: simplified });
            } else {
              setSimplifiedResponses([simplified]);
              setStoredSimplifiedResponses({ normal: simplified });
            }
            
            if (!useThemedDisplay) {
              onResponsesUpdate?.(splitResponse(simplified));
            }
            setIsChangingTone(false);
          } catch (error) {
            console.error('Error generating simplified response:', error);
            // If we failed to generate simplified version, fall back to full version
            setIsSimplifiedMode(false);
            setIsChangingTone(false);
          }
        })();
      } else if (currentResponses.length > 0 && !useThemedDisplay) {
        // If we already have the right responses, just update
        const responsesToShow = newMode ? currentSimplifiedResponses : currentResponses;
        onResponsesUpdate?.(splitResponse(responsesToShow[0]));
      }
      
      // Log user activity
      try {
        logUserActivity({
          action: 'toggle_simplified_mode',
          additionalData: {
            newMode: !prev,
            responseLength: currentResponses[0]?.length || 0,
            simplifiedLength: currentSimplifiedResponses[0]?.length || 0,
            withThinkingDialogue: useThinkingDialogue
          }
        });
      } catch (error) {
        console.error('Error logging mode change:', error);
      }
      
      return newMode;
    });
  }, [
    responses, 
    simplifiedResponses, 
    thinkingResponses, 
    thinkingSimplifiedResponses, 
    onResponsesUpdate, 
    useThemedDisplay, 
    useThinkingDialogue
  ]);

  /**
   * Toggle between themed and standard display
   */
  const handleDisplayToggle = useCallback(() => {
    // Keep track of current settings before toggle
    
    setUseThemedDisplay(prev => {
      const newDisplayMode = !prev;
      
      // Choose the correct data source based on thinking dialogue toggle
      const currentResponses = useThinkingDialogue ? thinkingResponses : responses;
      const currentSimplifiedResponses = useThinkingDialogue ? thinkingSimplifiedResponses : simplifiedResponses;
      const currentThemedResponses = useThinkingDialogue ? thinkingThemedResponses : themedResponses;
      
      // When switching to themed display, update UI state
      if (newDisplayMode) {
        // No need to change tone selection as it's visually disabled
        // No need to change simplified mode as it's visually disabled
      } else {
        // When switching back to standard display, restore previous settings
        if (isSimplifiedMode && !currentSimplifiedResponses.length && currentResponses.length > 0) {
          // If we need to generate simplified responses
          (async () => {
            try {
              setIsChangingTone(true);
              const responseToSimplify = currentResponses[0];
              const simplified = await OpenAIService.simplifyAnalysis(responseToSimplify);
              
              // Store in the correct state variable
              if (useThinkingDialogue) {
                setThinkingSimplifiedResponses([simplified]);
                setStoredThinkingSimplifiedResponses({ normal: simplified });
              } else {
                setSimplifiedResponses([simplified]);
                setStoredSimplifiedResponses({ normal: simplified });
              }
              
              if (!useThemedDisplay) {
                onResponsesUpdate?.(splitResponse(simplified));
              }
              setIsChangingTone(false);
            } catch (error) {
              console.error('Error generating simplified response:', error);
              setIsSimplifiedMode(false);
              setIsChangingTone(false);
            }
          })();
        }
      }
      
      // Update parent with appropriate responses based on new display mode
      if (newDisplayMode && currentThemedResponses.length > 0) {
        // If switching to themed display, pass all themed points
        const allPoints = currentThemedResponses.flatMap(theme => theme.points);
        onResponsesUpdate?.(allPoints);
      } else if (!newDisplayMode && currentResponses.length > 0) {
        // If switching to standard display, use the normal or simplified responses
        const responsesToShow = isSimplifiedMode ? currentSimplifiedResponses : currentResponses;
        if (responsesToShow.length > 0) {
          onResponsesUpdate?.(splitResponse(responsesToShow[0]));
        }
      }
      
      // Log user activity
      logUserActivity({
        action: 'toggle_themed_display',
        additionalData: {
          newMode: !useThemedDisplay,
          withThinkingDialogue: useThinkingDialogue
        }
      });
      
      return newDisplayMode;
    });
  }, [
    themedResponses, 
    responses, 
    simplifiedResponses, 
    thinkingThemedResponses,
    thinkingResponses,
    thinkingSimplifiedResponses,
    isSimplifiedMode, 
    selectedTone, 
    onResponsesUpdate, 
    useThinkingDialogue
  ]);

  /**
   * Handle tone changes and update responses accordingly
   */
  const handleToneChange = useCallback(async (newTone: string) => {
    // Don't process tone changes if themed display is active
    if (useThemedDisplay) return;
    
    setSelectedTone(newTone);
    
    // Choose the correct data source based on thinking dialogue toggle
    const currentResponses = useThinkingDialogue ? thinkingResponses : responses;
    const currentSimplifiedResponses = useThinkingDialogue ? thinkingSimplifiedResponses : simplifiedResponses;
    const currentStoredFullResponses = useThinkingDialogue ? storedThinkingFullResponses : storedFullResponses;
    const currentStoredSimplifiedResponses = useThinkingDialogue ? storedThinkingSimplifiedResponses : storedSimplifiedResponses;
    
    // References to the correct setter functions
    const setCurrentResponses = useThinkingDialogue ? setThinkingResponses : setResponses;
    const setCurrentSimplifiedResponses = useThinkingDialogue ? setThinkingSimplifiedResponses : setSimplifiedResponses;
    const setCurrentStoredFullResponses = useThinkingDialogue ? setStoredThinkingFullResponses : setStoredFullResponses;
    const setCurrentStoredSimplifiedResponses = useThinkingDialogue ? setStoredThinkingSimplifiedResponses : setStoredSimplifiedResponses;
    
    if (!currentResponses.length) return;

    try {
      setIsChangingTone(true);
      
      // If no tone selected, use normal version
      if (!newTone) {
        const normalFull = currentStoredFullResponses.normal;
        const normalSimplified = currentStoredSimplifiedResponses.normal;
        setCurrentResponses([normalFull]);
        setCurrentSimplifiedResponses([normalSimplified]);
        
        if (!useThemedDisplay) {
          onResponsesUpdate?.(splitResponse(isSimplifiedMode ? normalSimplified : normalFull));
        }
        return;
      }

      // Check if we already have this tone version stored
      const storedResponses = isSimplifiedMode ? currentStoredSimplifiedResponses : currentStoredFullResponses;
      if (storedResponses[newTone as keyof StoredResponses]) {
        const storedResponse = storedResponses[newTone as keyof StoredResponses]!;
        if (isSimplifiedMode) {
          setCurrentSimplifiedResponses([storedResponse]);
        } else {
          setCurrentResponses([storedResponse]);
        }
        
        if (!useThemedDisplay) {
          onResponsesUpdate?.(splitResponse(storedResponse));
        }
        return;
      }

      // If we don't have this tone stored, generate it
      const currentResponse = isSimplifiedMode ? currentSimplifiedResponses[0] : currentResponses[0];
      const adjustedResponse = await OpenAIService.adjustTone(currentResponse, newTone);
      
      // Store the new tone version
      if (isSimplifiedMode) {
        setCurrentStoredSimplifiedResponses(prev => ({ ...prev, [newTone]: adjustedResponse }));
        setCurrentSimplifiedResponses([adjustedResponse]);
      } else {
        setCurrentStoredFullResponses(prev => ({ ...prev, [newTone]: adjustedResponse }));
        setCurrentResponses([adjustedResponse]);
      }

      if (!useThemedDisplay) {
        onResponsesUpdate?.(splitResponse(adjustedResponse));
      }

      // Save tone change to Firebase
      try {
        await saveAnalysis({
          timestamp: null,
          designChallenge: designChallenge,
          decisions: stickyNotes,
          analysis: {
            full: splitResponse(isSimplifiedMode ? currentSimplifiedResponses[0] : currentResponses[0]),
            simplified: splitResponse(isSimplifiedMode ? currentSimplifiedResponses[0] : currentResponses[0])
          },
          tone: newTone,
          consensusPoints: consensusPoints,
          hasThinkingDialogue: useThinkingDialogue
        });
        
        // Log the tone change
        logUserActivity({
          action: 'change_tone',
          additionalData: {
            newTone: newTone,
            isSimplifiedMode,
            analysisLength: (isSimplifiedMode ? currentSimplifiedResponses[0] : currentResponses[0])?.length || 0,
            withThinkingDialogue: useThinkingDialogue
          }
        });
      } catch (error) {
        console.error('Error saving tone change to Firebase:', error);
      }
    } catch (error) {
      console.error('Error updating tone:', error);
    } finally {
      setIsChangingTone(false);
    }
  }, [
    responses, 
    simplifiedResponses, 
    thinkingResponses,
    thinkingSimplifiedResponses,
    storedFullResponses,
    storedSimplifiedResponses,
    storedThinkingFullResponses,
    storedThinkingSimplifiedResponses,
    isSimplifiedMode, 
    onResponsesUpdate, 
    useThemedDisplay, 
    designChallenge, 
    stickyNotes, 
    consensusPoints,
    useThinkingDialogue
  ]);

  // Store responses in local storage
  useEffect(() => {
    if (responses.length > 0) {
      responseStore.storeResponse('full-response', 'full', responses[0]);
    }
  }, [responses]);

  useEffect(() => {
    if (simplifiedResponses.length > 0) {
      responseStore.storeResponse('simplified-response', 'simplified', simplifiedResponses[0]);
    }
  }, [simplifiedResponses]);

  // Store themed responses in local storage
  useEffect(() => {
    if (themedResponses.length > 0) {
      responseStore.storeResponse('themed-responses', 'themed', JSON.stringify(themedResponses));
    }
  }, [themedResponses]);

  // Restore responses from storage on mount
  useEffect(() => {
    const storedFull = responseStore.getStoredResponse('full-response');
    const storedSimplified = responseStore.getStoredResponse('simplified-response');
    const storedThemed = responseStore.getStoredResponse('themed-responses');
    
    if (storedFull?.response) {
      setResponses([storedFull.response]);
      setStoredFullResponses({ normal: storedFull.response });
    }
    if (storedSimplified?.response) {
      setSimplifiedResponses([storedSimplified.response]);
      setStoredSimplifiedResponses({ normal: storedSimplified.response });
    }
    if (storedThemed?.response) {
      try {
        const themed = JSON.parse(storedThemed.response);
        if (Array.isArray(themed)) {
          setThemedResponses(themed);
        }
      } catch (e) {
        console.error('Error parsing stored themed responses', e);
      }
    }

    // Update parent with the correct response type based on saved mode
    if (storedThemed?.response && useThemedDisplay) {
      try {
        const themed = JSON.parse(storedThemed.response);
        if (Array.isArray(themed)) {
          const allPoints = themed.flatMap(theme => theme.points);
          onResponsesUpdate?.(allPoints);
        }
      } catch (e) {
        console.error('Error parsing stored themed responses for parent update', e);
      }
    } else if (isSimplifiedMode && storedSimplified?.response) {
      onResponsesUpdate?.(splitResponse(storedSimplified.response));
    } else if (!isSimplifiedMode && storedFull?.response) {
      onResponsesUpdate?.(splitResponse(storedFull.response));
    }
  }, []); // Keep empty dependency array for mount-only execution

  // Add effect to update responses when mode changes
  useEffect(() => {
    if (useThemedDisplay && themedResponses.length > 0) {
      const allPoints = themedResponses.flatMap(theme => theme.points);
      onResponsesUpdate?.(allPoints);
    } else {
      const currentResponses = isSimplifiedMode ? simplifiedResponses : responses;
      if (currentResponses.length > 0) {
        onResponsesUpdate?.(splitResponse(currentResponses[0]));
      }
    }
  }, [isSimplifiedMode, useThemedDisplay, responses, simplifiedResponses, themedResponses, onResponsesUpdate]);

  // Reset stored responses when analysis is refreshed
  useEffect(() => {
    if (shouldRefresh) {
      setStoredFullResponses({ normal: '' });
      setStoredSimplifiedResponses({ normal: '' });
    }
  }, [shouldRefresh]);

  // Handle new response points from voice recording
  const handleNewResponsePoints = useCallback(async (points: string[]) => {
    if (!points.length) return;
    
    try {
      // Create sticky notes in the Analysis-Response frame
      await TranscriptProcessingService.createDesignProposalStickies(
        points.map(point => ({ 
          proposal: point,
          category: 'response' // This will make the sticky notes blue
        })),
        'Analysis-Response'
      );
    } catch (error) {
      console.error('Error processing response points:', error);
    }
  }, []);

  /**
   * Handle sending variations to the board
   */
  const handleSendVariations = useCallback(async () => {
    try {
      // Find the varied responses frame
      const allFrames = await miro.board.get({ type: 'frame' });
      const variedResponsesFrame = allFrames.find(f => f.title === frameConfig.names.variedResponses);
      
      if (!variedResponsesFrame) {
        console.error('Varied Responses frame not found');
        return;
      }
      
      // Create message context from sticky notes
      const designDecisionsContext = stickyNotes.map((noteContent, index) => 
        `Design Decision ${index + 1}: ${noteContent || ''}`
      ).join('\n');
      
      // Set a separate loading state for variations that doesn't affect the main UI
      setIsVariationLoading(true);
      
      // Define specific positions for each variation type
      //DON'T CHANGE THESE POSITIONS AS THEY ARE THE ONLY ONES THAT WORK
      const positions = {
        rag: {
          x: variedResponsesFrame.x -800, // Position to align with RAG-Content header
          y: variedResponsesFrame.y -800, // Position below the RAG-Content header
          width: variedResponsesFrame.width - 400 // More space for content
        },
        principles: {
          x: variedResponsesFrame.x -800, // Position to align with Design Principles header
          y: variedResponsesFrame.y -100, // Position below the Design Principles header
          width: variedResponsesFrame.width - 400 // More space for content
        },
        prompt: {
          x: variedResponsesFrame.x -800, // Position to align with Customize System Prompt header
          y: variedResponsesFrame.y +600, // Position below the Customize System Prompt header
          width: variedResponsesFrame.width - 400 // More space for content
        }
      };
      
      // Custom function to create horizontal layout of sticky notes
      const createHorizontalStickyNotes = async (
        points: string[], 
        baseX: number, 
        baseY: number, 
        maxWidth: number,
        color: string
      ) => {
        if (!points.length) return;
        
        //DON'T CHANGE THESE VALUES AS THEY ARE THE ONLY ONES THAT WORK
        const stickyWidth = 500;     // Width of each sticky note - increased from 240
        const stickyHeight = 200;    // Height for row spacing calculation - increased from 160
        const spacing = 30;          // Spacing between sticky notes - increased from 25
        
        // Calculate how many sticky notes can fit horizontally
        const maxPerRow = Math.floor(maxWidth / (stickyWidth + spacing));
        
        // Create sticky notes in a horizontal layout
        for (let i = 0; i < points.length; i++) {
          // Calculate position (horizontally first, then new row)
          const col = i % maxPerRow;
          const row = Math.floor(i / maxPerRow);
          
          const x = baseX + col * (stickyWidth + spacing);
          const y = baseY + row * (stickyHeight + spacing); // Use sticky height for row spacing
          
          // Create the sticky note with rectangular shape
          await MiroApiClient.createStickyNote({
            content: points[i],
            x: x,
            y: y,
            width: stickyWidth,
            shape: 'rectangle', // Use shape parameter instead of height
            style: {
              fillColor: color
            }
          });
          
          // Add a small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      };
      
      // Process each selected variation
      if (variationsToSend.rag) {
        try {
          // For RAG content, use the EXISTING antagonistic points 
          // (the ones already generated with RAG in the background)
          const currentResponse = useThinkingDialogue 
            ? (isSimplifiedMode ? thinkingSimplifiedResponses[0] : thinkingResponses[0])
            : (isSimplifiedMode ? simplifiedResponses[0] : responses[0]);
          
          if (currentResponse) {
            // Split the response into individual points
            const points = splitResponse(currentResponse);
            
            // Create sticky notes with horizontal layout
            await createHorizontalStickyNotes(
              points,
              positions.rag.x,
              positions.rag.y,
              positions.rag.width,
              'light_blue'
            );
          }
        } catch (error) {
          console.error('Error creating RAG sticky notes:', error);
        }
      }
      
      // For design principles, generate NEW points using only design principles
      if (variationsToSend.principles && designPrinciplesText) {
        try {
          // Generate a NEW analysis using only the design principles
          const principlesResponse = await OpenAIService.generateAnalysis(
            designDecisionsContext,  // Use the created context
            designChallenge,
            synthesizedPoints, 
            consensusPoints,
            designPrinciplesText, // Use design principles
            undefined // No custom prompt
          );
          
          // Split the response into individual points
          const points = splitResponse(principlesResponse);
          
          // Create sticky notes with horizontal layout
          await createHorizontalStickyNotes(
            points,
            positions.principles.x,
            positions.principles.y,
            positions.principles.width,
            'light_yellow'
          );
        } catch (error) {
          console.error('Error generating principles-based analysis:', error);
        }
      }
      
      // For custom prompt, generate NEW points using only custom prompt
      if (variationsToSend.prompt && customPromptText) {
        try {
          // Generate a NEW analysis using only the custom prompt
          const customPromptResponse = await OpenAIService.generateAnalysis(
            designDecisionsContext,  // Use the created context
            designChallenge,
            synthesizedPoints, 
            consensusPoints,
            undefined, // No design principles
            customPromptText // Use custom prompt
          );
          
          // Split the response into individual points
          const points = splitResponse(customPromptResponse);
          
          // Create sticky notes with horizontal layout
          await createHorizontalStickyNotes(
            points,
            positions.prompt.x,
            positions.prompt.y,
            positions.prompt.width,
            'light_green'
          );
        } catch (error) {
          console.error('Error generating custom-prompt-based analysis:', error);
        }
      }
      
      // Reset selection state
      setVariationsToSend({
        rag: false,
        principles: false,
        prompt: false
      });
      
      // Log user activity
      logUserActivity({
        action: 'send_variations_to_board',
        additionalData: {
          sentRAG: variationsToSend.rag,
          sentPrinciples: variationsToSend.principles,
          sentPrompt: variationsToSend.prompt,
        }
      });
      
      // Always reset the variation loading state when done
      setIsVariationLoading(false);
    } catch (error) {
      console.error('Error sending variations to board:', error);
      // Ensure loading state is reset even on error
      setIsVariationLoading(false);
    }
  }, [
    designPrinciplesText, 
    customPromptText, 
    variationsToSend, 
    responses, 
    simplifiedResponses, 
    thinkingResponses, 
    thinkingSimplifiedResponses, 
    isSimplifiedMode, 
    useThinkingDialogue,
    designChallenge,
    synthesizedPoints,
    consensusPoints,
    stickyNotes
  ]);

  /**
   * Handle variation selection change
   */
  const handleVariationSelectionChange = useCallback((variation: keyof VariationsToSend, selected: boolean) => {
    setVariationsToSend(prev => ({
      ...prev,
      [variation]: selected
    }));
  }, []);

  if (error) {
    return <div className="error-message">{error}</div>;
  }

  return (
    <div className="antago-responses">
      {loading ? (
        <div>Processing sticky notes...</div>
      ) : (
        <>
          <div style={{ marginBottom: '20px' }}>
            <h2 style={{ margin: '0 0 16px 0' }}>Antagonistic Analysis</h2>
            
            {/* Voice Recorder for Responses */}
            <VoiceRecorder 
              mode="response"
              onNewPoints={handleNewResponsePoints}
            />
            
            {/* Test button for audio file upload */}
            <FileUploadTest 
              mode="response"
              onNewPoints={handleNewResponsePoints}
              skipParentCallback={true}
            />
            {/* Analysis Controls */}
            <AnalysisControls
              selectedTone={selectedTone}
              isSimplifiedMode={isSimplifiedMode}
              synthesizedPointsCount={synthesizedPoints.length}
              onToneChange={handleToneChange}
              onModeToggle={handleModeToggle}
              onShowSynthesizedPoints={() => MiroService.sendSynthesizedPointsToBoard(synthesizedPoints)}
              useThemedDisplay={useThemedDisplay}
              onDisplayToggle={handleDisplayToggle}
              useThinkingDialogue={useThinkingDialogue}
              onThinkingDialogueToggle={handleThinkingDialogueToggle}
              hasThinkingResults={thinkingResponses.length > 0}
              // Add new props for variations
              hasRagContent={!!currentRagContent}
              hasPrinciples={!!designPrinciplesText}
              hasPrompt={!!customPromptText}
              variationsToSend={variationsToSend}
              onVariationSelectionChange={handleVariationSelectionChange}
              onSendVariations={handleSendVariations}
            />
            {/* Analysis Results - Moved above controls */}
            <AnalysisResults
              responses={
                useThinkingDialogue
                  ? splitResponse((isSimplifiedMode ? thinkingSimplifiedResponses : thinkingResponses)[0] || '')
                  : splitResponse((isSimplifiedMode ? simplifiedResponses : responses)[0] || '')
              }
              isSimplifiedMode={isSimplifiedMode}
              selectedTone={selectedTone}
              onCleanAnalysis={() => MiroService.cleanAnalysisBoard()}
              isChangingTone={isChangingTone}
              themedResponses={useThinkingDialogue ? thinkingThemedResponses : themedResponses}
              useThemedDisplay={useThemedDisplay}
            />
            
            <div className="mb-2">
              <h3 className="font-semibold text-lg mb-2">Send To Board:</h3>
              <div className="mb-3">
                <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                  <label style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    opacity: !!currentRagContent ? 1 : 0.5, 
                    cursor: !!currentRagContent ? 'pointer' : 'not-allowed',
                    backgroundColor: !!currentRagContent ? (variationsToSend.rag ? '#e6f7ff' : 'transparent') : '#f5f5f5',
                    padding: '5px 10px',
                    borderRadius: '4px',
                    border: `1px solid ${!!currentRagContent ? (variationsToSend.rag ? '#4a86e8' : '#e0e0e0') : '#e0e0e0'}`,
                    transition: 'all 0.2s ease'
                  }}>
                    <input 
                      type="checkbox" 
                      checked={variationsToSend.rag} 
                      onChange={(e) => setVariationsToSend(prev => ({ ...prev, rag: e.target.checked }))}
                      disabled={!currentRagContent}
                      style={{ marginRight: '5px' }}
                    />
                    RAG Content
                  </label>
                  
                  <label style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    opacity: !!designPrinciplesText ? 1 : 0.5, 
                    cursor: !!designPrinciplesText ? 'pointer' : 'not-allowed',
                    backgroundColor: !!designPrinciplesText ? (variationsToSend.principles ? '#e6f7ff' : 'transparent') : '#f5f5f5',
                    padding: '5px 10px',
                    borderRadius: '4px',
                    border: `1px solid ${!!designPrinciplesText ? (variationsToSend.principles ? '#4a86e8' : '#e0e0e0') : '#e0e0e0'}`,
                    transition: 'all 0.2s ease'
                  }}>
                    <input 
                      type="checkbox" 
                      checked={variationsToSend.principles} 
                      onChange={(e) => setVariationsToSend(prev => ({ ...prev, principles: e.target.checked }))}
                      disabled={!designPrinciplesText}
                      style={{ marginRight: '5px' }}
                    />
                    Design Principles
                  </label>
                  
                  <label style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    opacity: !!customPromptText ? 1 : 0.5, 
                    cursor: !!customPromptText ? 'pointer' : 'not-allowed',
                    backgroundColor: !!customPromptText ? (variationsToSend.prompt ? '#e6f7ff' : 'transparent') : '#f5f5f5',
                    padding: '5px 10px',
                    borderRadius: '4px',
                    border: `1px solid ${!!customPromptText ? (variationsToSend.prompt ? '#4a86e8' : '#e0e0e0') : '#e0e0e0'}`,
                    transition: 'all 0.2s ease'
                  }}>
                    <input 
                      type="checkbox" 
                      checked={variationsToSend.prompt} 
                      onChange={(e) => setVariationsToSend(prev => ({ ...prev, prompt: e.target.checked }))}
                      disabled={!customPromptText}
                      style={{ marginRight: '5px' }}
                    />
                    Agent Prompt
                  </label>
                </div>
                <button
                  onClick={handleSendVariations}
                  className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 font-medium transition-colors"
                  disabled={isVariationLoading || !(variationsToSend.rag || variationsToSend.principles || variationsToSend.prompt)}
                >
                  {isVariationLoading ? "Processing variations..." : "Send Selected Variations to Board"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AntagoInteract;
