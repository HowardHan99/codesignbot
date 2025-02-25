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
import { saveAnalysis, getSynthesizedPoints } from '../utils/firebase';
import { splitResponse } from '../utils/textProcessing';
import { EmbeddingService } from '../services/embeddingService';
import { VoiceRecorder } from './VoiceRecorder';
import { FileUploadTest } from './FileUploadTest';
import { TranscriptProcessingService } from '../services/transcriptProcessingService';

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
  const [simplifiedResponses, setSimplifiedResponses] = useState<string[]>([]);
  const [selectedTone, setSelectedTone] = useState<string>('');
  const [synthesizedPoints, setSynthesizedPoints] = useState<string[]>([]);
  const [designChallenge, setDesignChallenge] = useState<string>('');
  const [consensusPoints, setConsensusPoints] = useState<string[]>([]);
  const [isChangingTone, setIsChangingTone] = useState(false);
  const [storedFullResponses, setStoredFullResponses] = useState<StoredResponses>({ normal: '' });
  const [storedSimplifiedResponses, setStoredSimplifiedResponses] = useState<StoredResponses>({ normal: '' });
  
  // Singleton instance for managing response storage
  const responseStore = ResponseStore.getInstance();
  
  // Ref to prevent duplicate processing
  const processedRef = useRef(false);
  const processingRef = useRef(false);  // New ref to prevent concurrent processing

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
      console.log('Fetched initial consensus points:', consensus);
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
        console.error('Error fetching synthesized points:', error);
      }
    };
    fetchSynthesizedPoints();
  }, []);

  /**
   * Process sticky notes to generate analysis
   */
  const processNotes = useCallback(async (forceProcess: boolean = false) => {
    // Prevent processing if no notes
    if (!stickyNotes.length) {
      return;
    }

    // Prevent concurrent processing
    if (processingRef.current) {
      return;
    }

    processingRef.current = true;
    setLoading(true);
    setSelectedTone('');
    
    try {
      console.log('Processing combined notes for analysis');
      console.log('Current consensus points:', consensusPoints);
      responseStore.clear();

      // Get fresh sticky notes from the Design-Decision frame
      const frames = await miro.board.get({ type: 'frame' });
      const designFrame = frames.find(f => f.title === 'Design-Decision');
      
      if (!designFrame) {
        throw new Error('Design-Decision frame not found');
      }

      // Get all sticky notes on the board
      const allStickies = await miro.board.get({ type: 'sticky_note' });
      
      // Filter sticky notes that belong to the Design-Decision frame
      const frameStickies = allStickies
        .filter(sticky => sticky.parentId === designFrame.id)
        .map(sticky => sticky.content || '');
      
      // Combine sticky notes into a single message
      const combinedMessage = frameStickies.map((note, index) => 
        `Design Decision ${index + 1}: ${note}`
      ).join('\n');

      // Add image context if available
      const messageWithContext = imageContext 
        ? `${combinedMessage}\n\nRelevant visual context from design sketches:\n${imageContext}`
        : combinedMessage;
      
      // Generate initial response
      const response = await OpenAIService.generateAnalysis(
        messageWithContext, 
        designChallenge,
        synthesizedPoints,
        consensusPoints
      );
      
      // OPTIMIZATION 1: Immediately display the response
      setResponses([response]);
      setStoredFullResponses({ normal: response }); // Store normal tone
      
      // Update parent with appropriate responses immediately
      const splitResponses = splitResponse(response);
      onResponsesUpdate?.(splitResponses);
      
      // OPTIMIZATION 2 & 3: Handle other operations in parallel, only generate simplified if needed
      // Create a tracking variable for simplified generation
      const backgroundPromises = [];
      
      // Always save to Firebase in the background
      const savePromise = (async () => {
        try {
          const analysisData = {
            timestamp: null,
            designChallenge: designChallenge,
            decisions: frameStickies,
            analysis: {
              full: splitResponse(response),
              // We'll add simplified later if/when it's generated
              simplified: []
            },
            tone: selectedTone || 'normal',
            consensusPoints: consensusPoints
          };
          console.log('Saving analysis with data:', analysisData);
          await saveAnalysis(analysisData);
        } catch (error) {
          console.error('Error saving to Firebase:', error);
        }
      })();
      backgroundPromises.push(savePromise);
      
      // Only generate simplified version if we're in simplified mode
      if (isSimplifiedMode) {
        const simplifyPromise = (async () => {
          try {
            const simplified = await OpenAIService.simplifyAnalysis(response);
            setSimplifiedResponses([simplified]);
            setStoredSimplifiedResponses({ normal: simplified });
            
            // Update the displayed responses if we're still in simplified mode
            if (isSimplifiedMode) {
              onResponsesUpdate?.(splitResponse(simplified));
            }
            
            // Update Firebase with simplified version
            try {
              const analysisData = {
                timestamp: null,
                designChallenge: designChallenge,
                decisions: frameStickies,
                analysis: {
                  full: splitResponse(response),
                  simplified: splitResponse(simplified)
                },
                tone: selectedTone || 'normal',
                consensusPoints: consensusPoints
              };
              await saveAnalysis(analysisData);
            } catch (error) {
              console.error('Error updating Firebase with simplified analysis:', error);
            }
          } catch (error) {
            console.error('Error generating simplified response:', error);
          }
        })();
        backgroundPromises.push(simplifyPromise);
      }
      
      // Wait for all background promises to resolve
      await Promise.all(backgroundPromises);
      
      processedRef.current = true;
      onComplete?.();
      
    } catch (error) {
      console.error('Error processing sticky notes:', error);
      setError('Failed to process sticky notes. Please try again.');
      onComplete?.();
    } finally {
      processingRef.current = false;
      setLoading(false);
    }
  }, [designChallenge, imageContext, isSimplifiedMode, onComplete, onResponsesUpdate, selectedTone, synthesizedPoints, consensusPoints]);

  // Handle mode toggle
  const handleModeToggle = useCallback(() => {
    setIsSimplifiedMode((prev: boolean) => {
      const newMode = !prev;
      
      // If switching to simplified mode but we don't have simplified responses yet
      if (newMode && responses.length > 0 && !simplifiedResponses.length) {
        // Generate simplified version on demand
        (async () => {
          try {
            setIsChangingTone(true);
            const simplified = await OpenAIService.simplifyAnalysis(responses[0]);
            setSimplifiedResponses([simplified]);
            setStoredSimplifiedResponses({ normal: simplified });
            onResponsesUpdate?.(splitResponse(simplified));
            setIsChangingTone(false);
          } catch (error) {
            console.error('Error generating simplified response:', error);
            // If we failed to generate simplified version, fall back to full version
            setIsSimplifiedMode(false);
            setIsChangingTone(false);
          }
        })();
      } else if (responses.length > 0) {
        // If we already have the right responses, just update
        const currentResponses = newMode ? simplifiedResponses : responses;
        onResponsesUpdate?.(splitResponse(currentResponses[0]));
      }
      
      return newMode;
    });
  }, [responses, simplifiedResponses, onResponsesUpdate]);

  /**
   * Handle tone changes and update responses accordingly
   */
  const handleToneChange = useCallback(async (newTone: string) => {
    setSelectedTone(newTone);
    if (!responses.length) return;

    try {
      setIsChangingTone(true);
      
      // If no tone selected, use normal version
      if (!newTone) {
        const normalFull = storedFullResponses.normal;
        const normalSimplified = storedSimplifiedResponses.normal;
        setResponses([normalFull]);
        setSimplifiedResponses([normalSimplified]);
        onResponsesUpdate?.(splitResponse(isSimplifiedMode ? normalSimplified : normalFull));
        return;
      }

      // Check if we already have this tone version stored
      const storedResponses = isSimplifiedMode ? storedSimplifiedResponses : storedFullResponses;
      if (storedResponses[newTone as keyof StoredResponses]) {
        const storedResponse = storedResponses[newTone as keyof StoredResponses]!;
        if (isSimplifiedMode) {
          setSimplifiedResponses([storedResponse]);
        } else {
          setResponses([storedResponse]);
        }
        onResponsesUpdate?.(splitResponse(storedResponse));
        return;
      }

      // If we don't have this tone stored, generate it
      const currentResponse = isSimplifiedMode ? simplifiedResponses[0] : responses[0];
      const adjustedResponse = await OpenAIService.adjustTone(currentResponse, newTone);
      
      // Store the new tone version
      if (isSimplifiedMode) {
        setStoredSimplifiedResponses(prev => ({ ...prev, [newTone]: adjustedResponse }));
        setSimplifiedResponses([adjustedResponse]);
      } else {
        setStoredFullResponses(prev => ({ ...prev, [newTone]: adjustedResponse }));
        setResponses([adjustedResponse]);
      }

      onResponsesUpdate?.(splitResponse(adjustedResponse));
    } catch (error) {
      console.error('Error updating tone:', error);
    } finally {
      setIsChangingTone(false);
    }
  }, [responses, simplifiedResponses, isSimplifiedMode, onResponsesUpdate, storedFullResponses, storedSimplifiedResponses]);

  // Process notes on refresh or initial mount
  useEffect(() => {
    const shouldProcess = stickyNotes.length > 0 && (!processedRef.current || shouldRefresh);
    if (shouldProcess) {
      processedRef.current = false;
      processNotes();
    }
  }, [shouldRefresh, stickyNotes, processNotes]);

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

  // Restore responses from storage on mount
  useEffect(() => {
    const storedFull = responseStore.getStoredResponse('full-response');
    const storedSimplified = responseStore.getStoredResponse('simplified-response');
    
    if (storedFull?.response) {
      setResponses([storedFull.response]);
      setStoredFullResponses({ normal: storedFull.response });
    }
    if (storedSimplified?.response) {
      setSimplifiedResponses([storedSimplified.response]);
      setStoredSimplifiedResponses({ normal: storedSimplified.response });
    }

    // Update parent with the correct response type based on saved mode
    if (isSimplifiedMode && storedSimplified?.response) {
      onResponsesUpdate?.(splitResponse(storedSimplified.response));
    } else if (!isSimplifiedMode && storedFull?.response) {
      onResponsesUpdate?.(splitResponse(storedFull.response));
    }
  }, []); // Keep empty dependency array for mount-only execution

  // Add effect to update responses when mode changes
  useEffect(() => {
    const currentResponses = isSimplifiedMode ? simplifiedResponses : responses;
    if (currentResponses.length > 0) {
      onResponsesUpdate?.(splitResponse(currentResponses[0]));
    }
  }, [isSimplifiedMode, responses, simplifiedResponses, onResponsesUpdate]);

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
            
            <AnalysisControls
              selectedTone={selectedTone}
              isSimplifiedMode={isSimplifiedMode}
              synthesizedPointsCount={synthesizedPoints.length}
              onToneChange={handleToneChange}
              onModeToggle={handleModeToggle}
              onShowSynthesizedPoints={() => MiroService.sendSynthesizedPointsToBoard(synthesizedPoints)}
            />

            <AnalysisResults
              responses={splitResponse((isSimplifiedMode ? simplifiedResponses : responses)[0] || '')}
              isSimplifiedMode={isSimplifiedMode}
              selectedTone={selectedTone}
              onCleanAnalysis={() => MiroService.cleanAnalysisBoard()}
              isChangingTone={isChangingTone}
            />
          </div>
        </>
      )}
    </div>
  );
};

export default AntagoInteract;
