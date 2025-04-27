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
  
  // Singleton instance for managing response storage
  const responseStore = ResponseStore.getInstance();
  
  // Ref to prevent duplicate processing
  const processedRef = useRef(false);
  const processingRef = useRef(false);  // New ref to prevent concurrent processing

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
        const thinkingFrame = allFrames.find(f => f.title === 'Thinking-Dialogue');
        Logger.log('AntagoInteract', 'Searching for Thinking-Dialogue frame', { found: !!thinkingFrame });
        
        if (thinkingFrame) {
          // Get both sticky notes and text elements from the frame
          const stickyNotesFromBoard = await miro.board.get({ type: 'sticky_note' });
          const dialogueStickyNotes = stickyNotesFromBoard.filter(
            note => note.parentId === thinkingFrame.id
          );
          const textElements = await miro.board.get({ type: 'text' });
          const dialogueTextElements = textElements.filter(
            text => text.parentId === thinkingFrame.id
          );
          
          Logger.log('AntagoInteract', 'Found content elements in Thinking-Dialogue frame', { 
            stickyNotes: dialogueStickyNotes.length,
            textElements: dialogueTextElements.length 
          });
          
          // Combine content from both sources
          const stickyNotesContent = dialogueStickyNotes.map(note => note.content || '').join('\n');
          const textElementsContent = dialogueTextElements.map(text => text.content || '').join('\n');
          const combinedDialogueContent = [stickyNotesContent, textElementsContent].filter(Boolean).join('\n\n').trim();

          if (combinedDialogueContent) {
            // Parse combined content into Thinking and RAG sections
            const markerIndex = combinedDialogueContent.indexOf(THINKING_MARKER);
            
            if (markerIndex !== -1) {
              ragContextString = combinedDialogueContent.substring(0, markerIndex).trim();
              thinkingContextString = combinedDialogueContent.substring(markerIndex).trim();
              Logger.log('AntagoInteract', 'Parsed frame content into Thinking & RAG', { 
                ragLength: ragContextString.length,
                thinkingLength: thinkingContextString.length 
              });
            } else {
              // If marker not found, treat all content as RAG
              ragContextString = combinedDialogueContent;
              thinkingContextString = ''; // Explicitly empty
              Logger.log('AntagoInteract', 'No thinking marker found, treating all frame content as RAG', { 
                ragLength: ragContextString.length 
              });
            }
            // Keep original combined content for potential backward compatibility or simpler logging if needed
            dialogueContext = combinedDialogueContent; 
          } else {
            Logger.log('AntagoInteract', 'No thinking dialogue/RAG content found in frame');
          }
        } else {
          Logger.warn('AntagoInteract', 'Thinking-Dialogue frame not found');
        }
      } catch (dialogueError) {
        Logger.error('AntagoInteract', 'Error fetching/parsing thinking dialogue/RAG content', dialogueError);
      }
      
      // Set useThinkingDialogue toggle state to false if no enhanced context was actually found/parsed
      if (!thinkingContextString && !ragContextString && useThinkingDialogue) {
        Logger.log('AntagoInteract', 'Setting useThinkingDialogue to false (no enhanced context found)');
        setUseThinkingDialogue(false); // Turn off toggle if no context to enhance with
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
            const response = await OpenAIService.generateAnalysis(
              messageContext, 
              designChallenge,
              synthesizedPoints,
              consensusPoints
            );
            
            setResultsFunc([response]);
            setStoredResponsesFunc({ normal: response });
            return response;
          };
          
          // Run both standard and thinking dialogue enhanced analyses in parallel
          Logger.log('AntagoInteract', 'Generating analyses');
          const [standardResponse, enhancedResponse] = await Promise.all([
            // Standard analysis without thinking dialogue/RAG
            generateAnalysis(baseMessage, setResponses, setStoredFullResponses),
            
            // Analysis enhanced with thinking dialogue/RAG (if context exists)
            (thinkingContextString || ragContextString) 
              ? generateAnalysis(enhancedMessageWithContext, setThinkingResponses, setStoredThinkingFullResponses)
              : Promise.resolve('') // Resolve with empty if no enhanced context
          ]);
          
          Logger.log('AntagoInteract', 'Analysis generation complete', {
            standardLength: standardResponse?.length || 0,
            enhancedLength: enhancedResponse?.length || 0,
            hasEnhancedResults: !!enhancedResponse
          });

          // Update the hasThinkingResults state indirectly by populating the thinkingResponses array
          if (enhancedResponse) {
            Logger.log('AntagoInteract', 'Setting thinking/enhanced responses to enable toggle');
            setThinkingResponses([enhancedResponse]); // Store enhanced results here
          } else {
            Logger.log('AntagoInteract', 'No enhanced context was found or processed');
          }
          
          // Save to Firebase in the background
          try {
            // Save analysis data
            const analysisData = {
              timestamp: null,
              designChallenge: designChallenge,
              decisions: notes, // Use notes directly instead of designStickyNotes.map()
              analysis: {
                full: splitResponse(standardResponse),
                simplified: []
              },
              tone: selectedTone || 'normal',
              consensusPoints: consensusPoints,
              hasThinkingDialogue: useThinkingDialogue,
              ...(useThinkingDialogue && enhancedResponse ? {
                thinkingAnalysis: {
                  full: splitResponse(enhancedResponse),
                  simplified: []
                }
              } : {})
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
          } catch (saveError) {
            console.error('Error saving analysis data to Firebase:', saveError);
            // Error handled silently to not disrupt user experience
          }
          
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
          // Generate all theme analyses in parallel
          OpenAIService.generateAllThemeAnalyses(
            messageContext,
            selectedThemes,
            designChallenge,
            consensusPoints
          ),
          
          // Also generate original response for compatibility and fallback
          OpenAIService.generateAnalysis(
            messageContext, 
            designChallenge,
            synthesizedPoints,
            consensusPoints
          )
        ]);
        
        // Store results
        setResponseFunc([response]);
        setThemedResponsesFunc(themedResponsesData);
        setStoredResponsesFunc({ normal: response });
        
        return { themedResponsesData, response };
      };

      // Run both standard and thinking dialogue enhanced analyses in parallel
      Logger.log('AntagoInteract', 'Generating themed analyses');
      const [standardResults, enhancedResults] = await Promise.all([
        // Standard themed analysis without thinking dialogue/RAG
        generateThemedAnalysis(
          baseMessage, 
          setResponses, 
          setThemedResponses, 
          setStoredFullResponses
        ),
        
        // Themed analysis enhanced with thinking dialogue/RAG (if context exists)
        (thinkingContextString || ragContextString) 
          ? generateThemedAnalysis(
              enhancedMessageWithContext,
              setThinkingResponses, // Still use thinking state vars for enhanced results
              setThinkingThemedResponses,
              setStoredThinkingFullResponses
            )
          : Promise.resolve({ themedResponsesData: [], response: '' }) // Resolve with empty if no enhanced context
      ]);
      
      Logger.log('AntagoInteract', 'Themed analysis generation complete', {
        standardLength: standardResults.response?.length || 0,
        enhancedLength: enhancedResults.response?.length || 0,
        hasEnhancedResults: !!enhancedResults.response
      });
      
      // Update the hasThinkingResults state indirectly by populating the thinkingResponses array
      if (enhancedResults && enhancedResults.response) {
        Logger.log('AntagoInteract', 'Setting thinking/enhanced responses to enable toggle (themed)');
        setThinkingResponses([enhancedResults.response]); // Store enhanced standard response
        setThinkingThemedResponses(enhancedResults.themedResponsesData); // Store enhanced themed responses
      } else {
        Logger.log('AntagoInteract', 'No enhanced context was found or processed for themed generation');
      }
      
      // Use the appropriate results based on current toggle state
      const currentResults = useThinkingDialogue && enhancedResults.response 
        ? enhancedResults 
        : standardResults;
      
      // Create a combined list of all points for backward compatibility
      const allPoints = currentResults.themedResponsesData.flatMap(theme => theme.points);
      
      // Update parent with appropriate responses
      if (useThemedDisplay) {
        // If using themed display, we still need to pass array of strings for compatibility
        onResponsesUpdate?.(allPoints);
      } else {
        // Otherwise, use the standard response format
        const splitResponses = splitResponse(currentResults.response);
        onResponsesUpdate?.(splitResponses);
      }
      
   
      // Create a tracking variable for background operations
      const backgroundPromises = [];
      
      // Always save to Firebase in the background
      const savePromise = (async () => {
        try {
          // First save the main analysis data
          const analysisData = {
            timestamp: null,
            designChallenge: designChallenge,
            decisions: notes, // Use notes directly instead of designStickyNotes.map()
            analysis: {
              full: useThemedDisplay ? currentResults.themedResponsesData.flatMap(theme => theme.points) : splitResponse(currentResults.response),
              simplified: []
            },
            tone: selectedTone || 'normal',
            consensusPoints: consensusPoints,
            hasThinkingDialogue: useThinkingDialogue && dialogueContext && enhancedResults.response ? true : false,
            ...(dialogueContext && enhancedResults && enhancedResults.response ? {
              thinkingAnalysis: {
                full: useThemedDisplay ? enhancedResults.themedResponsesData.flatMap(theme => theme.points) : splitResponse(enhancedResults.response),
                simplified: []
              }
            } : {})
          };
          await saveAnalysis(analysisData);
          
          // If we have themed responses, also save them as design themes
          if (currentResults.themedResponsesData.length > 0) {
            await saveDesignThemes({
              themes: currentResults.themedResponsesData.map(theme => ({
                name: theme.name,
                color: theme.color,
                description: theme.points.join(' | ')
              }))
            });
            
            if (useThinkingDialogue && currentResults.themedResponsesData.length > 0) {
              await saveDesignThemes({
                themes: currentResults.themedResponsesData.map(theme => ({
                  name: `${theme.name} (with thinking dialogue)`,
                  color: theme.color,
                  description: theme.points.join(' | ')
                }))
              });
            }
          }
        } catch (error) {
          console.error('Error saving analysis data to Firebase:', error);
          // Error handled silently to not disrupt user experience
        }
      })();
      backgroundPromises.push(savePromise);
      
      // Generate simplified version immediately if in simplified mode
      if (isSimplifiedMode) {
        
        const simplifyPromise = (async () => {
          try {
            setIsChangingTone(true);
            
            // Simplify both standard and thinking analyses if needed
            const [simplified, thinkingSimplified] = await Promise.all([
              OpenAIService.simplifyAnalysis(standardResults.response),
              dialogueContext && enhancedResults && enhancedResults.response 
                ? OpenAIService.simplifyAnalysis(enhancedResults.response) 
                : Promise.resolve('')
            ]);
            
            // Store simplifications
            setSimplifiedResponses([simplified]);
            setStoredSimplifiedResponses({ normal: simplified });
            
            if (useThinkingDialogue && thinkingSimplified) {
              setThinkingSimplifiedResponses([thinkingSimplified]);
              setStoredThinkingSimplifiedResponses({ normal: thinkingSimplified });
            }
            
            // Update UI with the appropriate simplified response
            const currentSimplified = useThinkingDialogue && thinkingSimplified ? thinkingSimplified : simplified;
            if (isSimplifiedMode && !useThemedDisplay) {
              onResponsesUpdate?.(splitResponse(currentSimplified));
            }
            
            setIsChangingTone(false);
          } catch (error) {
            setIsChangingTone(false);
          }
        })();
        backgroundPromises.push(simplifyPromise);
      }
      
      // Wait for all background tasks to complete
      await Promise.all(backgroundPromises);
      
      // Clean up
      setLoading(false);
      processingRef.current = false;
      onComplete?.();
      
      // Log user activity
      logUserActivity({
        action: 'generate_analysis',
        additionalData: {
          hasThemes: existingThemes.length > 0, 
          themedDisplay: useThemedDisplay,
          challengeLength: designChallenge?.length || 0,
          consensusCount: consensusPoints?.length || 0,
          useThinkingDialogue: useThinkingDialogue,
          thinkingDialogueLength: dialogueContext?.length || 0
        }
      });
      
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
            
            
          </div>
        </>
      )}
    </div>
  );
};

export default AntagoInteract;
