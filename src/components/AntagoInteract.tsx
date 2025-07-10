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
import { saveAnalysis, getSynthesizedPoints, logUserActivity, saveDesignThemes, saveTaggedPoints, getHistoricalTaggedPoints, saveTagPreferences } from '../utils/firebase';
import { splitResponse } from '../utils/textProcessing';
import { VoiceRecorder } from './VoiceRecorder';
import { FileUploadTest } from './FileUploadTest';
import { TranscriptProcessingService } from '../services/transcriptProcessingService';
import { DesignThemeService } from '../services/designThemeService';
import { Logger } from '../utils/logger';
import { frameConfig, stickyConfig } from '../utils/config';
import { MiroApiClient } from '../services/miro/miroApiClient';
import { saveFrameData } from '../utils/firebase';
import { readPointTagMappings, PointTagMapping } from '../services/miroService';
import { StickyNoteService } from '../services/miro/stickyNoteService';
import { getFirebaseDB } from '../utils/firebase';
import { ref, push, get, query, orderByChild, limitToLast } from 'firebase/database';
import { MiroFrameService } from '../services/miro/frameService';

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
  sessionId?: string;             // Optional session ID for logging
  consensusPoints?: string[];     // Array of consensus points
  incorporateSuggestions?: string[]; // Array of suggestions to incorporate
}

interface StoredResponses {
  normal: string;
  persuasive?: string;
  aggressive?: string;
  critical?: string;
  // Add selectedForUnpack to track selection state if managed within this component directly,
  // otherwise, this is handled by selectedPointsForUnpack state from point strings.
}

const AntagoInteract: React.FC<AntagoInteractProps> = ({ 
  stickyNotes, 
  onComplete,
  onResponsesUpdate,
  shouldRefresh = false,
  imageContext,
  sessionId,
  consensusPoints: initialConsensusPoints,
  incorporateSuggestions
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
  const [useThemedDisplay, setUseThemedDisplay] = useState<boolean>(false);
  
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

  // State for "Unpack Points" feature
  const [selectedPointsForUnpack, setSelectedPointsForUnpack] = useState<string[]>([]);
  const [isLoadingUnpack, setIsLoadingUnpack] = useState<boolean>(false);

  // State for tag preferences (NEW) - simplified
  const [currentPointTagMappings, setCurrentPointTagMappings] = useState<PointTagMapping[]>([]);

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
      initialConsensusPoints ? Promise.resolve(initialConsensusPoints) : MiroService.getConsensusPoints(sessionId)
    ]).then(([challenge, consensus]) => {
      // console.log('Fetched initial consensus points:', consensus);
      setDesignChallenge(challenge);
      setConsensusPoints(consensus);
    });
  }, [initialConsensusPoints, sessionId]);

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
    const startTime = Date.now(); // Define startTime
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
      
      // --- Tag Reading (SIMPLIFIED) ---
      let pointTagMappings: PointTagMapping[] = [];
      try {
        // Read current board point-tag mappings (simple format)
        pointTagMappings = await readPointTagMappings();
        
        if (pointTagMappings.length > 0) {
          // Save mappings to state for UI display
          setCurrentPointTagMappings(pointTagMappings);
        } else {
          setCurrentPointTagMappings([]);
        }
      } catch (tagError) {
        Logger.warn('AntagoInteract', 'Error reading point-tag mappings, proceeding without:', tagError);
        setCurrentPointTagMappings([]);
      }
      // --- End Tag Reading ---

      // Get thinking dialogue context if the toggle is enabled
      let dialogueContext = ''; // Combined raw content
      let thinkingContextString = ''; // Parsed thinking process
      let ragContextString = ''; // Parsed external knowledge/RAG
      let incorporateSuggestionsString = ''; // New: User responses to previous analysis points
      let consensusPointsString = ''; // Consensus points from frame
      let discardedPointsString = ''; // Discarded points the user found irrelevant or wrong
      let synthesizedRagInsights = ''; // NEW: Synthesized insights from RAG content
      
      // Always check for the frame, even if toggle is off (for debugging)
      try {
        const allFrames = await miro.board.get({ type: 'frame' });
        const thinkingFrame = allFrames.find(f => f.title === frameConfig.names.thinkingDialogue);
        const enhancedContextFrame = allFrames.find(f => f.title === frameConfig.names.ragContent);
        const variedResponsesFrame = allFrames.find(f => f.title === frameConfig.names.variedResponses);
        const agentPromptFrame = allFrames.find(f => f.title === frameConfig.names.agentPrompt);
        const incorporateSuggestionsFrame = allFrames.find(f => f.title === frameConfig.names.incorporateSuggestions);
        const discardedPointsFrame = allFrames.find(f => f.title === frameConfig.names.discardedPoints);
        const consensusFrame = allFrames.find(f => f.title === frameConfig.names.consensus);
        
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
          const combinedContent = [stickyNotesContent, textElementsContent].filter(Boolean).join('\n\n').trim();
          
          return combinedContent;
        };
        
        // Extract content from each frame separately
        thinkingContextString = await extractContentFromFrame(thinkingFrame);
        ragContextString = await extractContentFromFrame(enhancedContextFrame);
        incorporateSuggestionsString = await extractContentFromFrame(incorporateSuggestionsFrame);
        discardedPointsString = await extractContentFromFrame(discardedPointsFrame);
        consensusPointsString = await extractContentFromFrame(consensusFrame);
        
        // Update the current RAG content state
        setCurrentRagContent(ragContextString);
        
        // === NEW: Synthesize RAG content into actionable insights ===
        if (ragContextString && ragContextString.trim()) {
          try {
            Logger.log('AntagoInteract', 'Synthesizing RAG content into insights...');
            
            // Create base context for synthesis
            const baseDesignContext = notes.map((noteContent, index) => 
              `Design Decision ${index + 1}: ${noteContent || ''}`
            ).join('\n');
            
            // If RAG content is very large (>10k chars), warn and truncate to avoid timeouts
            let contentToSynthesize = ragContextString;
            if (ragContextString.length > 10000) {
              Logger.warn('AntagoInteract', `RAG content is very large (${ragContextString.length} chars), truncating to 10k chars to avoid timeout`);
              contentToSynthesize = ragContextString.substring(0, 10000) + '\n\n[Content truncated due to length...]';
            }
            
            synthesizedRagInsights = await OpenAIService.synthesizeRagInsights(
              contentToSynthesize,
              designChallenge,
              baseDesignContext
            );
            
            Logger.log('AntagoInteract', 'Successfully synthesized RAG insights', {
              originalLength: ragContextString.length,
              processedLength: contentToSynthesize.length,
              synthesizedLength: synthesizedRagInsights.length,
              wasTruncated: contentToSynthesize.length < ragContextString.length
            });
          } catch (synthesisError) {
            Logger.warn('AntagoInteract', 'Failed to synthesize RAG insights, proceeding without synthesis:', synthesisError);
            // Don't fall back to original content - just proceed without synthesis
            // The original content will still be available for logging/debugging
            synthesizedRagInsights = '';
          }
        }
        // === END RAG SYNTHESIS ===
        
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
      Logger.log('AntagoInteract', '=== MESSAGE CONSTRUCTION SECTION ===');
      Logger.log('AntagoInteract', 'Base sticky notes content:', {
        stickyNotesCount: notes.length,
        stickyNotesContent: notes.map((note, i) => `[${i+1}] ${note.substring(0, 100)}...`)
      });
      
      // Directly use the notes parameter passed from the parent component
      const baseMessage = imageContext 
        ? `${notes.map((noteContent, index) => 
            `Design Decision ${index + 1}: ${noteContent || ''}`
          ).join('\n')}\n\nRelevant visual context from design sketches:\n${imageContext}`
        : notes.map((noteContent, index) => 
            `Design Decision ${index + 1}: ${noteContent || ''}`
          ).join('\n');
        
      Logger.log('AntagoInteract', 'Base message constructed:', {
        baseMessageLength: baseMessage.length,
        hasImageContext: !!imageContext,
        baseMessage: baseMessage
      });
        
        // Construct the enhanced message with clear labels for the LLM
        let enhancedContextParts: string[] = [];
        if (synthesizedRagInsights) {
          enhancedContextParts.push(`Synthesized RAG Insights (Examples & Considerations):\n${synthesizedRagInsights}`);
        }
        // Note: Raw RAG content removed to avoid redundancy with synthesized insights
        if (thinkingContextString) {
          enhancedContextParts.push(`Thinking Process Context:\n${thinkingContextString}`);
        }
      
      // Use provided incorporate suggestions if available, otherwise check for them in the userPrompt
      let hasFeedback = false;
      const incorporateSuggestionsLabel = "Previous User Feedback & Suggestions:";
      
      if (incorporateSuggestions && incorporateSuggestions.length > 0) {
        enhancedContextParts.push(`${incorporateSuggestionsLabel}\n${incorporateSuggestions.join('\n')}`);
        hasFeedback = true;
        Logger.log('AntagoInteract', 'Added incorporate suggestions from props:', {
          suggestionsCount: incorporateSuggestions.length,
          suggestions: incorporateSuggestions
        });
      } else if (incorporateSuggestionsString) {
        enhancedContextParts.push(`${incorporateSuggestionsLabel}\n${incorporateSuggestionsString}`);
        hasFeedback = true;
        Logger.log('AntagoInteract', 'Added incorporate suggestions from frame:', {
          suggestionsContent: incorporateSuggestionsString
        });
      }
      
      const enhancedMessageWithContext = enhancedContextParts.length > 0
        ? `${baseMessage}\n\n${enhancedContextParts.join('\n\n')}`
        : baseMessage;

      // Log final message lengths for debugging
      Logger.log('AntagoInteract', 'Final message construction results:', {
        baseLength: baseMessage.length,
        enhancedLength: enhancedMessageWithContext.length,
        enhancedContextPartsCount: enhancedContextParts.length,
        enhancedContextParts: enhancedContextParts.map((part, i) => ({
          index: i,
          label: part.split('\n')[0],
          length: part.length
        })),
        fullEnhancedMessage: enhancedMessageWithContext,
        hasDialogue: !!dialogueContext,
        hasThinkingParsed: !!thinkingContextString,
        hasRAGParsed: !!ragContextString,
        hasSynthesizedRAG: !!synthesizedRagInsights,
        hasIncorporateSuggestions: hasFeedback,
        hasTagPreferences: pointTagMappings.length > 0,
        // NEW: Frame influence tracking
        consensusPointsFromFrame: consensusPointsString ? consensusPointsString.split('\n').filter(p => p.trim()).length : 0,
        discardedPointsFromFrame: discardedPointsString ? discardedPointsString.split('\n').filter(p => p.trim()).length : 0,
        totalConsensusInfluence: (initialConsensusPoints?.length || 0) + (consensusPointsString ? consensusPointsString.split('\n').filter(p => p.trim()).length : 0),
        strongInfluenceActive: !!(consensusPointsString || discardedPointsString)
      });
      
      Logger.log('AntagoInteract', '=== END MESSAGE CONSTRUCTION SECTION ===');
      
      // === SIMPLE LOG FOR WHAT'S BEING SENT TO OPENAI ===
      console.log('🔍 === MESSAGE COMPONENTS BEING SENT TO OPENAI ===');
      console.log('1. TAG PAIRS:', pointTagMappings.length > 0 ? pointTagMappings : 'No tags found');
      console.log('2. THINKING DIALOGUE:', thinkingContextString || 'None');
      console.log('3. RAG CONTENT (Raw):', ragContextString ? `${ragContextString.length} chars (not sent to AI)` : 'None');
      console.log('3a. SYNTHESIZED RAG INSIGHTS:', synthesizedRagInsights || 'None');
      console.log('4. INCORPORATE SUGGESTIONS:', incorporateSuggestionsString || 'None');
      console.log('5. CONSENSUS POINTS (Frame):', consensusPointsString ? `${consensusPointsString.length} chars - STRONG INFLUENCE` : 'None');
      console.log('6. DISCARDED POINTS:', discardedPointsString ? `${discardedPointsString.length} chars - AVOID THESE PATTERNS` : 'None');
      console.log('7. DESIGN CHALLENGE:', designChallenge || 'None');
      console.log('8. CONSENSUS POINTS (Props):', initialConsensusPoints && initialConsensusPoints.length > 0 ? initialConsensusPoints : 'None');
      console.log('9. SYNTHESIZED POINTS:', synthesizedPoints && synthesizedPoints.length > 0 ? synthesizedPoints : 'None');
      console.log('🔍 === FULL MESSAGE CONTENT ===');
      console.log('USER MESSAGE (complete):', enhancedMessageWithContext);
      console.log('🔍 === END MESSAGE COMPONENTS ===');

      // Parse frame content into arrays for strong influence
      const consensusPointsFromFrame = consensusPointsString ? consensusPointsString.split('\n').filter(p => p.trim()) : [];
      const discardedPointsFromFrame = discardedPointsString ? discardedPointsString.split('\n').filter(p => p.trim()) : [];
      
      // Combine frame consensus with props consensus for maximum coverage
      const allConsensusPoints = [
        ...(initialConsensusPoints || []),
        ...consensusPointsFromFrame
      ].filter((point, index, array) => array.indexOf(point) === index); // Remove duplicates

      // === OPTIMIZED: Single comprehensive generation call ===
      Logger.log('AntagoInteract', 'Starting comprehensive analysis generation');
      
      console.log('🎯 === SIMPLIFIED GENERATION FLOW ===');
      console.log('PROCESSING MODE: Standard (non-themed) analysis only');
      console.log('FRAME CONTENT INCLUDED:', {
        thinkingDialogue: !!thinkingContextString,
        ragContent: !!ragContextString,
        synthesizedRAG: !!synthesizedRagInsights,
        userSuggestions: !!incorporateSuggestionsString,
        consensusPoints: allConsensusPoints.length,
        discardedPoints: discardedPointsFromFrame.length,
        tagMappings: pointTagMappings.length
      });
      console.log('TOTAL ENHANCED MESSAGE LENGTH:', enhancedMessageWithContext.length);
      console.log('🎯 === END SIMPLIFIED GENERATION ===');
      
      try {
        const comprehensiveResults = await OpenAIService.generateComprehensiveAnalysis(
          enhancedMessageWithContext,
          {
            designChallenge,
            themes: undefined, // No themed analysis by default
            existingPoints: synthesizedPoints,
            consensusPoints: allConsensusPoints,
            designPrinciples: undefined, // Only for variations
            customSystemPrompt: undefined, // Only for variations
            pointTagMappings,
            discardedPoints: discardedPointsFromFrame,
            needsSimplified: false, // No simplified analysis by default
            needsStandard: true, // Always generate standard analysis
            variations: undefined // Variations handled separately in handleSendVariations
          }
        );

        // Process results - we should always have standardResponse now
        if (comprehensiveResults.standardResponse) {
          // Set standard response
          setResponses([comprehensiveResults.standardResponse]);
          setStoredFullResponses({ normal: comprehensiveResults.standardResponse });

          // Update parent immediately with standard response
          onResponsesUpdate?.(splitResponse(comprehensiveResults.standardResponse));
          
          Logger.log('AntagoInteract', 'Standard analysis generated successfully', {
            responseLength: comprehensiveResults.standardResponse.length,
            pointCount: splitResponse(comprehensiveResults.standardResponse).length
          });
        } else {
          Logger.error('AntagoInteract', 'No standard response generated');
          setError('Failed to generate analysis. Please try again.');
          setLoading(false);
          processingRef.current = false;
          onComplete?.();
          return;
        }

        // Save to Firebase in the background
        (async () => {
          try {
            if (!sessionId) {
              Logger.warn('AntagoInteract', 'Skipping Firebase save due to missing sessionId');
              return;
            }

            const critiquesToSave = splitResponse(comprehensiveResults.standardResponse!);
            let usedThinkingForThisOutput = useThinkingDialogue && (thinkingContextString !== '' || ragContextString !== '');
            
            // === ENHANCED: Comprehensive context information for Firebase ===
            const contextData = {
              // AI Input Context
              synthesizedRagInsights: synthesizedRagInsights || null,
              rawRagContent: ragContextString || null,
              thinkingDialogue: thinkingContextString || null,
              userFeedbackSuggestions: incorporateSuggestionsString || null,
              
              // User Commands & Preferences from Board
              userTagMappings: pointTagMappings.length > 0 ? pointTagMappings : null,
              consensusPointsFromFrame: consensusPointsString ? consensusPointsString.split('\n').filter(p => p.trim()) : null,
              discardedPointsFromFrame: discardedPointsString ? discardedPointsString.split('\n').filter(p => p.trim()) : null,
              
              // Design Context
              designChallenge: designChallenge || null,
              originalDesignDecisions: stickyNotes || null,
              consensusPointsFromProps: initialConsensusPoints || null,
              combinedConsensusPoints: allConsensusPoints.length > 0 ? allConsensusPoints : null,
              existingSynthesizedPoints: synthesizedPoints.length > 0 ? synthesizedPoints : null,
              
              // Processing Metadata
              enhancedMessageLength: enhancedMessageWithContext.length,
              baseMessageLength: baseMessage.length,
              hasImageContext: !!imageContext,
              imageContext: imageContext || null,
              
              // Generation Settings
              usedThinkingDialogueInput: usedThinkingForThisOutput,
              isSimplifiedMode: isSimplifiedMode,
              useThemedDisplay: useThemedDisplay,
              
              // Influence Tracking
              influenceFactors: {
                hasRAGSynthesis: !!synthesizedRagInsights,
                hasRawRAGContent: !!ragContextString,
                hasThinkingContext: !!thinkingContextString,
                hasUserFeedback: !!incorporateSuggestionsString,
                hasTagPreferences: pointTagMappings.length > 0,
                hasConsensusGuidance: allConsensusPoints.length > 0,
                hasDiscardedGuidance: discardedPointsFromFrame.length > 0,
                hasExistingPoints: synthesizedPoints.length > 0,
                strongInfluenceActive: !!(consensusPointsString || discardedPointsString)
              },
              
              // AI Message Components (for debugging)
              fullEnhancedMessage: enhancedMessageWithContext,
              enhancedContextParts: enhancedContextParts.length > 0 ? enhancedContextParts.map((part, i) => ({
                index: i,
                label: part.split('\n')[0],
                length: part.length,
                preview: part.length > 200 ? part.substring(0, 200) + '...' : part
              })) : null,
              
              // Timestamp for tracking
              timestamp: Date.now(),
              sessionId: sessionId
            };
            
            const antagonisticResponseData = {
              critiques: critiquesToSave,
              usedThinkingDialogueInput: usedThinkingForThisOutput,
              tagMappings: pointTagMappings,
              // NEW: Comprehensive context information
              context: contextData
            };
            
            // Direct Firebase save to ensure data is persisted
            try {
              const database = getFirebaseDB();
              const currentBoardId = await MiroFrameService.getCurrentBoardId();
              const currentTimestamp = Date.now();
              
              // Save ALL frame data to Firebase
              const allFrameData = {
                // Antagonistic Response data
                antagonisticResponse: {
                  critiques: critiquesToSave,
                  usedThinkingDialogueInput: usedThinkingForThisOutput,
                  tagMappings: pointTagMappings,
                  context: contextData
                },
                
                // All other frame data
                thinkingDialogue: thinkingContextString || null,
                ragContent: ragContextString || null,
                incorporateSuggestions: incorporateSuggestionsString || null,
                discardedPoints: discardedPointsString || null,
                consensusPoints: consensusPointsString || null,
                designProposal: stickyNotes || null,
                designChallenge: designChallenge || null,
                
                // Metadata
                timestamp: currentTimestamp,
                savedAt: new Date().toISOString(),
                boardId: currentBoardId,
                sessionId: sessionId
              };
              
              // Save to main session path
              const sessionPath = `sessions/${sessionId}/allFrameData`;
              const sessionDataRef = ref(database, sessionPath);
              
              // Check for duplicates by comparing last entry
              const lastSnapshot = await get(query(ref(database, sessionPath), orderByChild('timestamp'), limitToLast(1)));
              let shouldSave = true;
              
              if (lastSnapshot.exists()) {
                const lastEntryKey = Object.keys(lastSnapshot.val())[0];
                const lastDataEntry = lastSnapshot.val()[lastEntryKey];
                
                // Simple duplicate check - compare critiques and main frame content
                if (JSON.stringify(lastDataEntry.antagonisticResponse?.critiques) === JSON.stringify(critiquesToSave) &&
                    JSON.stringify(lastDataEntry.thinkingDialogue) === JSON.stringify(thinkingContextString) &&
                    JSON.stringify(lastDataEntry.ragContent) === JSON.stringify(ragContextString)) {
                  shouldSave = false;
                }
              }
              
              if (shouldSave) {
                await push(sessionDataRef, allFrameData);
              }
              
              // Also save individual frame data for easier access
              const framesToSave = [
                { key: 'antagonisticResponse', data: allFrameData.antagonisticResponse },
                { key: 'thinkingDialogue', data: allFrameData.thinkingDialogue },
                { key: 'ragContent', data: allFrameData.ragContent },
                { key: 'incorporateSuggestions', data: allFrameData.incorporateSuggestions },
                { key: 'discardedPoints', data: allFrameData.discardedPoints },
                { key: 'consensusPoints', data: allFrameData.consensusPoints },
                { key: 'designProposal', data: allFrameData.designProposal },
                { key: 'designChallenge', data: allFrameData.designChallenge }
              ];
              
              for (const frame of framesToSave) {
                if (frame.data) {
                  const framePath = `sessions/${sessionId}/${frame.key}`;
                  const frameDataRef = ref(database, framePath);
                  await push(frameDataRef, {
                    content: frame.data,
                    timestamp: currentTimestamp,
                    boardId: currentBoardId
                  });
                }
              }
              
            } catch (saveError) {
              console.error('Firebase save failed:', saveError);
            }

            logUserActivity({
              action: 'generate_analysis_completed',
              additionalData: {
                hasThemes: false, // No themes by default
                themedDisplay: false, // No themed display by default
                challengeLength: designChallenge?.length || 0,
                responseCount: critiquesToSave.length,
                simplifiedResponseCount: 0, // No simplified by default
                useThinkingDialogueInput: usedThinkingForThisOutput,
                hasTagPreferences: pointTagMappings.length > 0,
                hasRAGSynthesis: !!synthesizedRagInsights,
                hasFrameContent: !!(thinkingContextString || ragContextString || incorporateSuggestionsString || consensusPointsString || discardedPointsString),
                frameContentTypes: {
                  thinking: !!thinkingContextString,
                  rag: !!ragContextString,
                  suggestions: !!incorporateSuggestionsString,
                  consensus: !!consensusPointsString,
                  discarded: !!discardedPointsString
                },
                duration: Date.now() - startTime 
              }
            }, sessionId);
          } catch (error) {
            Logger.error('AntagoInteract', 'Error saving analysis data to Firebase:', error);
          }
        })();

      } catch (error) {
        Logger.error('AntagoInteract', 'Error in comprehensive analysis generation:', error);
        setError('Failed to generate analysis. Please try again.');
        setLoading(false);
        processingRef.current = false;
        onComplete?.();
        return;
      }
      
      // Mark as no longer loading once we have the initial results
      setLoading(false);
      
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
  }, [
    designChallenge, 
    imageContext, 
    isSimplifiedMode, 
    onComplete, 
    onResponsesUpdate, 
    selectedTone, 
    synthesizedPoints, 
    initialConsensusPoints,
    useThemedDisplay, 
    useThinkingDialogue, 
    sessionId,
    incorporateSuggestions
  ]);

  // Process notes when they change or when shouldRefresh is true
  useEffect(() => {
    // Only process if we have sticky notes AND design challenge has been loaded
    if (stickyNotes.length > 0 && designChallenge !== '') {
      processNotes(stickyNotes, shouldRefresh || false)
        .catch(console.error);
    }
  }, [stickyNotes, shouldRefresh, processNotes, sessionId, designChallenge]);

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
      }, sessionId);
      
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
    onResponsesUpdate,
    sessionId
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
        }, sessionId);
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
    useThinkingDialogue,
    sessionId
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
      }, sessionId);
      
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
    useThinkingDialogue,
    sessionId
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
        }, sessionId);
        
        // Log the tone change
        logUserActivity({
          action: 'change_tone',
          additionalData: {
            newTone: newTone,
            isSimplifiedMode,
            analysisLength: (isSimplifiedMode ? currentSimplifiedResponses[0] : currentResponses[0])?.length || 0,
            withThinkingDialogue: useThinkingDialogue
          }
        }, sessionId);
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
    useThinkingDialogue,
    sessionId
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
      // Also reset thinking dialogue stored responses if they exist
      setStoredThinkingFullResponses({ normal: '' });
      setStoredThinkingSimplifiedResponses({ normal: '' });
      setSelectedPointsForUnpack([]); // Clear selection on refresh
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
        frameConfig.names.thinkingDialogue
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
      
      // === OPTIMIZED: Use comprehensive generation for variations ===
      const variations: any = {};
      if (variationsToSend.principles && designPrinciplesText) {
        variations.principles = designPrinciplesText;
      }
      if (variationsToSend.prompt && customPromptText) {
        variations.prompt = customPromptText;
      }

      // Generate all requested variations in one call (if any non-RAG variations are needed)
      let variationResults: any = {};
      if (Object.keys(variations).length > 0) {
        try {
          variationResults = await OpenAIService.generateComprehensiveAnalysis(
            designDecisionsContext,
            {
              designChallenge,
              existingPoints: synthesizedPoints,
              consensusPoints: consensusPoints,
              pointTagMappings: currentPointTagMappings,
              needsSimplified: false,
              needsStandard: false,
              variations: variations
            }
          );
        } catch (error) {
          console.error('Error generating variations:', error);
        }
      }
      
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
            await StickyNoteService.createHorizontalStickyNotes(
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
      
      // For design principles, use generated variation
      if (variationsToSend.principles && variationResults.variations?.principles) {
        try {
          // Split the response into individual points
          const points = splitResponse(variationResults.variations.principles);
          
          // Create sticky notes with horizontal layout
          await StickyNoteService.createHorizontalStickyNotes(
            points,
            positions.principles.x,
            positions.principles.y,
            positions.principles.width,
            'light_yellow'
          );
        } catch (error) {
          console.error('Error creating principles-based sticky notes:', error);
        }
      }
      
      // For custom prompt, use generated variation
      if (variationsToSend.prompt && variationResults.variations?.prompt) {
        try {
          // Split the response into individual points
          const points = splitResponse(variationResults.variations.prompt);
          
          // Create sticky notes with horizontal layout
          await StickyNoteService.createHorizontalStickyNotes(
            points,
            positions.prompt.x,
            positions.prompt.y,
            positions.prompt.width,
            'light_green'
          );
        } catch (error) {
          console.error('Error creating custom-prompt-based sticky notes:', error);
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
      }, sessionId);
      
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
    stickyNotes,
    sessionId,
    currentPointTagMappings
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

  /**
   * Handles the unpacking of selected critique points.
   * For each selected point, it finds the original sticky note on the board,
   * generates a detailed explanation, creates a new sticky for the detail,
   * and connects it to the original sticky.
   */
  const handleUnpackPoints = useCallback(async () => {
    if (selectedPointsForUnpack.length === 0) {
      setError('No points selected to unpack.');
      return;
    }

    setIsLoadingUnpack(true);
    setError(null);

    // Determine the current set of all displayed points for context for OpenAI
    let allCurrentDisplayedPointsForContext: string[] = [];
    const currentNormalResponses = splitResponse((isSimplifiedMode ? simplifiedResponses : responses)[0] || '');
    const currentThinkingResponses = splitResponse((isSimplifiedMode ? thinkingSimplifiedResponses : thinkingResponses)[0] || '');
    
    if (useThemedDisplay) {
      const currentThemed = useThinkingDialogue ? thinkingThemedResponses : themedResponses;
      allCurrentDisplayedPointsForContext = currentThemed.flatMap(theme => theme.points);
    } else {
      allCurrentDisplayedPointsForContext = useThinkingDialogue ? currentThinkingResponses : currentNormalResponses;
    }

    try {
      // Fetch all sticky notes from the board to find the original point stickies
      const allStickyNotes = await miro.board.get({ type: 'sticky_note' });
      
      // Process each selected point
      for (const pointToUnpack of selectedPointsForUnpack) {
        // Find the original sticky note containing this point text
        // We look for sticky notes whose content includes the point text (exact or close match)
        const originalSticky = allStickyNotes.find(sticky => {
          // First try exact match
          if (sticky.content === pointToUnpack) {
            return true;
          }
          
          // Then try a more lenient match that ignores case, whitespace, and punctuation
          const normalizedContent = sticky.content?.toLowerCase().replace(/\s+/g, ' ').trim() || '';
          const normalizedPoint = pointToUnpack.toLowerCase().replace(/\s+/g, ' ').trim();
          const isMatch = normalizedContent.includes(normalizedPoint) || normalizedPoint.includes(normalizedContent);
          
          return isMatch;
        });

        if (!originalSticky) {
          console.warn(`Could not find original sticky for point: "${pointToUnpack.substring(0, 30)}..."`);
          continue; // Skip to next point
        }

        // === DEBUG LOGGING: Original sticky position ===
        console.log('🔍 UNPACK DEBUG - Original Sticky Position:', {
          pointText: pointToUnpack.substring(0, 50) + '...',
          originalSticky: {
            id: originalSticky.id,
            x: originalSticky.x,
            y: originalSticky.y,
            width: originalSticky.width,
            height: originalSticky.height,
            parentId: originalSticky.parentId || 'none'
          }
        });

        // === CONVERT TO ABSOLUTE COORDINATES ===
        // Get the frame if sticky is inside one
        let parentFrame = null;
        if (originalSticky.parentId) {
          try {
            const frames = await miro.board.get({ type: 'frame' });
            parentFrame = frames.find(frame => frame.id === originalSticky.parentId);
          } catch (error) {
            console.warn('Could not fetch parent frame:', error);
          }
        }

        // Calculate absolute position based on Miro's coordinate system:
        // - Frame coordinates (x,y) = frame CENTER relative to board center
        // - Sticky coordinates inside frame (x,y) = sticky CENTER relative to frame TOP-LEFT corner
        let absoluteX, absoluteY;
        
        if (parentFrame) {
          // Convert frame center to frame top-left corner (relative to board center)
          const frameTopLeftX = parentFrame.x - (parentFrame.width / 2);
          const frameTopLeftY = parentFrame.y - (parentFrame.height / 2);
          
          // Add sticky's position (relative to frame top-left) to get absolute position
          absoluteX = frameTopLeftX + originalSticky.x;
          absoluteY = frameTopLeftY + originalSticky.y;
        } else {
          // Sticky is directly on board - coordinates already relative to board center
          absoluteX = originalSticky.x;
          absoluteY = originalSticky.y;
        }

        // === DEBUG LOGGING: Coordinate conversion ===
        console.log('🔍 UNPACK DEBUG - Coordinate Conversion:', {
          hasParentFrame: !!parentFrame,
          parentFrame: parentFrame ? {
            id: parentFrame.id,
            title: parentFrame.title,
            center: { x: parentFrame.x, y: parentFrame.y },
            dimensions: { width: parentFrame.width, height: parentFrame.height },
            topLeftCorner: {
              x: parentFrame.x - (parentFrame.width / 2),
              y: parentFrame.y - (parentFrame.height / 2)
            }
          } : null,
          stickyRelativeToFrame: parentFrame ? {
            x: originalSticky.x,
            y: originalSticky.y
          } : null,
          stickyRelativeToBoard: !parentFrame ? {
            x: originalSticky.x,
            y: originalSticky.y
          } : null,
          calculatedAbsolutePosition: {
            x: absoluteX,
            y: absoluteY
          },
          conversionFormula: parentFrame 
            ? `absolute = frameTopLeft + stickyRelative = (${parentFrame.x - (parentFrame.width / 2)}, ${parentFrame.y - (parentFrame.height / 2)}) + (${originalSticky.x}, ${originalSticky.y})`
            : 'sticky coordinates already absolute (relative to board center)'
        });

        // Generate detailed illustration as separate points
        const explanationPoints = await OpenAIService.unpackPointDetailAsPoints(
          pointToUnpack,
          stickyNotes.join('\n\n'), // Design proposal
          designChallenge,
          allCurrentDisplayedPointsForContext // All current points for context
        );

        // Calculate position for detail stickies using ABSOLUTE coordinates
        const detailX = absoluteX + 600; // Apply offset to absolute X
        const detailY = absoluteY + 0;  // Apply offset to absolute Y

        // === DEBUG LOGGING: Calculated unpack position ===
        console.log('🔍 UNPACK DEBUG - Calculated Unpack Position:', {
          calculatedPosition: {
            detailX: detailX,
            detailY: detailY,
            offsetFromOriginal: {
              xOffset: 600,
              yOffset: 0
            }
          },
          explanationPointsCount: explanationPoints.length
        });

        // Create horizontal sticky notes instead of rectangle
        const unpackedStickies = await StickyNoteService.createHorizontalStickyNotes(
          explanationPoints,
          detailX, // EXACT same position as original sticky
          detailY,
          2200, // maxWidth - enough space for 4 normal-sized sticky notes (500*4 + 30*3 = 2090px)
          'light_pink' // pink color
        );

        // === DEBUG LOGGING: Actual created sticky positions ===
        if (unpackedStickies.length > 0) {
          console.log('🔍 UNPACK DEBUG - First Unpacked Sticky Actual Position:', {
            firstUnpackedSticky: {
              id: unpackedStickies[0].id,
              x: unpackedStickies[0].x,
              y: unpackedStickies[0].y,
              width: unpackedStickies[0].width,
              height: unpackedStickies[0].height
            },
            allUnpackedStickies: unpackedStickies.map((sticky, index) => ({
              index: index,
              id: sticky.id,
              x: sticky.x,
              y: sticky.y,
              content: sticky.content?.substring(0, 30) + '...'
            })),
            positionDifference: {
              actualVsCalculated: {
                xDiff: unpackedStickies[0].x - detailX,
                yDiff: unpackedStickies[0].y - detailY
              }
            }
          });
        }

        // Create connector to first sticky note instead of rectangle
        if (unpackedStickies.length > 0) {
          await miro.board.createConnector({
            start: {
              item: originalSticky.id,
              snapTo: 'right'
            },
            end: {
              item: unpackedStickies[0].id, // Connect to first unpacked sticky
              snapTo: 'left'
            },
            style: {
              strokeColor: '#4262ff',
              strokeWidth: 2,
              strokeStyle: 'normal'
            },
            shape: 'curved' // Use curved connector shape
          });
        }
        
        // Small delay between operations
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      
      // Log the activity
      logUserActivity({
        action: 'unpack_points_completed',
        additionalData: {
          unpackedCount: selectedPointsForUnpack.length
        }
      }, sessionId);

      // Clear selection after successful operation
      setSelectedPointsForUnpack([]);
    } catch (err) {
      console.error('Error unpacking points:', err);
      const errorMessage = (err instanceof Error) ? err.message : String(err);
      setError(`Failed to unpack points: ${errorMessage}`);
    } finally {
      setIsLoadingUnpack(false);
    }
  }, [
    selectedPointsForUnpack, 
    stickyNotes, 
    designChallenge, 
    sessionId, 
    isSimplifiedMode, 
    responses, 
    simplifiedResponses, 
    themedResponses, 
    thinkingResponses, 
    thinkingSimplifiedResponses, 
    useThemedDisplay, 
    useThinkingDialogue,
    setError
  ]);

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
            {/* "Unpack Points" Button */}
            <div style={{ marginTop: '15px', marginBottom: '15px' }}>
              <button
                onClick={handleUnpackPoints}
                disabled={isLoadingUnpack || selectedPointsForUnpack.length === 0}
                className="w-full py-2 px-4 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:text-gray-600 font-medium transition-colors"
              >
                {isLoadingUnpack 
                  ? 'Unpacking Points...' 
                  : `Unpack Selected (${selectedPointsForUnpack.length}) Points`}
              </button>
            </div>

            {/* Analysis Results and Board Controls */}
            <AnalysisResults
              responses={
                // Select appropriate responses based on current state
                useThemedDisplay ? [] : // Don't show standard responses in themed mode
                isSimplifiedMode ? 
                  (useThinkingDialogue ? 
                    (thinkingSimplifiedResponses.length > 0 ? splitResponse(thinkingSimplifiedResponses[0]) : []) :
                    (simplifiedResponses.length > 0 ? splitResponse(simplifiedResponses[0]) : [])
                  ) :
                  (useThinkingDialogue ? 
                    (thinkingResponses.length > 0 ? splitResponse(thinkingResponses[0]) : []) :
                    (responses.length > 0 ? splitResponse(responses[0]) : [])
                  )
              }
              isSimplifiedMode={isSimplifiedMode}
              selectedTone={selectedTone}
              onCleanAnalysis={() => MiroService.cleanAnalysisBoard()}
              isChangingTone={isChangingTone}
              themedResponses={
                useThinkingDialogue ? thinkingThemedResponses : themedResponses
              }
              useThemedDisplay={useThemedDisplay}
              onThemeSelectToggle={() => {}}
              onSelectedPointsChange={setSelectedPointsForUnpack}
              currentSelectedPoints={selectedPointsForUnpack}
              tagInfluenceInfo={currentPointTagMappings.length > 0 ? {
                hasTagPreferences: true,
                usefulKeywords: currentPointTagMappings.filter(m => m.tags.some(tag => tag.toLowerCase().includes('useful'))).map(m => m.point).slice(0, 3),
                avoidKeywords: currentPointTagMappings.filter(m => m.tags.some(tag => tag.toLowerCase().includes('not-useful'))).map(m => m.point).slice(0, 3),
                customTags: [...new Set(currentPointTagMappings.flatMap(m => m.tags.filter(tag => !tag.toLowerCase().includes('useful'))))]
              } : undefined}
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
