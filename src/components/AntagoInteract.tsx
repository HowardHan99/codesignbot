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

interface AntagoInteractProps {
  stickyNotes: string[];          // Array of sticky note contents from the design decisions
  onComplete?: () => void;        // Callback when analysis is complete
  onResponsesUpdate?: (responses: string[]) => void;  // Callback to update parent with new responses
  shouldRefresh?: boolean;        // Flag to trigger a refresh of the analysis
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
  shouldRefresh = false
}) => {
  // State management for responses and UI
  const [responses, setResponses] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSimplifiedMode, setIsSimplifiedMode] = useState(true);
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

  // Fetch design challenge and consensus points on mount
  useEffect(() => {
    Promise.all([
      MiroService.getDesignChallenge(),
      MiroService.getConsensusPoints()
    ]).then(([challenge, consensus]) => {
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
    // Prevent processing if no notes or already processed
    if (!stickyNotes.length || (processedRef.current && !forceProcess)) {
      return;
    }

    // Prevent concurrent processing
    if (processingRef.current) {
      return;
    }

    processingRef.current = true;
    setLoading(true);
    setSelectedTone(''); // Reset tone to normal
    
    try {
      console.log('Processing combined notes for analysis');
      responseStore.clear();
      
      // Combine sticky notes into a single message
      const combinedMessage = stickyNotes.map((note, index) => 
        `Design Decision ${index + 1}: ${note}`
      ).join('\n');
      
      // Generate initial response
      const response = await OpenAIService.generateAnalysis(
        combinedMessage, 
        designChallenge,
        synthesizedPoints,
        consensusPoints
      );
      setResponses([response]);
      setStoredFullResponses({ normal: response }); // Store normal tone

      // Generate simplified version
      const simplified = await OpenAIService.simplifyAnalysis(response);
      setSimplifiedResponses([simplified]);
      setStoredSimplifiedResponses({ normal: simplified }); // Store normal tone
      
      // Save to Firebase
      try {
        await saveAnalysis({
          timestamp: null,
          designChallenge: designChallenge,
          decisions: stickyNotes,
          analysis: {
            full: splitResponse(response),
            simplified: splitResponse(simplified)
          },
          tone: selectedTone || 'normal'
        });
      } catch (error) {
        console.error('Error saving to Firebase:', error);
      }
      
      // Update parent with appropriate responses
      const splitResponses = splitResponse(isSimplifiedMode ? simplified : response);
      onResponsesUpdate?.(splitResponses);
      
      processedRef.current = true;
      onComplete?.();
      
    } catch (error) {
      console.error('Error processing sticky notes:', error);
      setError('Failed to process sticky notes. Please try again.');
      onComplete?.();
    } finally {
      setLoading(false);
      processingRef.current = false;
    }
  }, [stickyNotes, designChallenge, isSimplifiedMode, selectedTone, onComplete, onResponsesUpdate, synthesizedPoints, consensusPoints]);

  /**
   * Handle toggling between simplified and full response modes
   */
  const handleModeToggle = useCallback(() => {
    const newMode = !isSimplifiedMode;
    setIsSimplifiedMode(newMode);
    
    if (responses.length > 0) {
      const currentResponses = newMode ? simplifiedResponses : responses;
      onResponsesUpdate?.(splitResponse(currentResponses[0]));
    }
  }, [responses, simplifiedResponses, isSimplifiedMode, onResponsesUpdate]);

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
    }
    if (storedSimplified?.response) {
      setSimplifiedResponses([storedSimplified.response]);
    }
  }, []);

  // Reset stored responses when analysis is refreshed
  useEffect(() => {
    if (shouldRefresh) {
      setStoredFullResponses({ normal: '' });
      setStoredSimplifiedResponses({ normal: '' });
    }
  }, [shouldRefresh]);

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
