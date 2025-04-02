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
import { DesignThemeService } from '../services/designThemeService';

/**
 * Interface for themed response
 */
interface ThemedResponse {
  name: string;
  color: string;
  points: string[];
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
    // Don't process if already processed and not forcing
    if (processedRef.current && !forceProcess) {
      return;
    }

    // Don't process if no notes or already processing
    if (notes.length === 0 || processingRef.current) {
      return;
    }

    processedRef.current = true;
    processingRef.current = true;
    setLoading(true);
    setSelectedTone('');
    
    try {
      const startTime = performance.now();
      const miroStartTime = performance.now();
      
      const frames = await miro.board.get({ type: 'frame' });
      const designFrame = frames.find(f => f.title === 'Design-Proposal');
      
      if (!designFrame) {
        throw new Error('Design-Proposal frame not found');
      }

      // Get sticky notes
      const stickyNotes = await miro.board.get({ type: 'sticky_note' });
      
      // Filter sticky notes that belong to the Design-Proposal frame
      const designStickyNotes = stickyNotes.filter(
        note => note.parentId === designFrame.id
      );
      
      const miroEndTime = performance.now();
      
      // Format data for OpenAI
      const formatStartTime = performance.now();
      
      const combinedMessage = designStickyNotes.map((note, index) => 
        `Design Decision ${index + 1}: ${note.content || ''}`
      ).join('\n');

      // Add image context if available
      const messageWithContext = imageContext 
        ? `${combinedMessage}\n\nRelevant visual context from design sketches:\n${imageContext}`
        : combinedMessage;
      
      const formatEndTime = performance.now();
      
      // Get the design themes for generating theme-specific analyses
      const themes = await DesignThemeService.generateDesignThemes();
      
      // Use only the first 2 themes for antagonistic points
      const themesToUse = themes.slice(0, 2);
      
      // Ensure themes are calculated in Miro to store positions
      // This is important for placing sticky notes correctly
      // No existing content will be removed
      console.log('Calculating theme positions for sticky note placement...');
      await DesignThemeService.visualizeThemes(themesToUse, false);
      
      // Generate theme-specific antagonistic points in parallel
      const openaiStartTime = performance.now();
      
      // Run both the theme-specific analyses and the original response generation in parallel
      const [themedResponsesData, response] = await Promise.all([
        // Generate all theme analyses in parallel
        OpenAIService.generateAllThemeAnalyses(
          messageWithContext,
          themesToUse,
          designChallenge,
          consensusPoints
        ),
        
        // Also generate original response for compatibility and fallback
        OpenAIService.generateAnalysis(
          messageWithContext, 
          designChallenge,
          synthesizedPoints,
          consensusPoints
        )
      ]);
      
      const openaiEndTime = performance.now();
      
      // Update UI with the response
      const uiStartTime = performance.now();
      
      setResponses([response]);
      setThemedResponses(themedResponsesData);
      setStoredFullResponses({ normal: response }); // Store normal tone
      
      // Create a combined list of all points for backward compatibility
      const allPoints = themedResponsesData.flatMap(theme => theme.points);
      
      // Update parent with appropriate responses
      if (useThemedDisplay) {
        // If using themed display, we still need to pass array of strings for compatibility
        onResponsesUpdate?.(allPoints);
      } else {
        // Otherwise, use the standard response format
        const splitResponses = splitResponse(response);
        onResponsesUpdate?.(splitResponses);
      }
      
      const uiEndTime = performance.now();
      
      // Handle background operations
      const bgStartTime = performance.now();
      
      // Create a tracking variable for background operations
      const backgroundPromises = [];
      
      // Always save to Firebase in the background
      const saveStartTime = performance.now();
      
      const savePromise = (async () => {
        try {
          const analysisData = {
            timestamp: null,
            designChallenge: designChallenge,
            decisions: designStickyNotes.map(note => note.content || ''),
            analysis: {
              full: useThemedDisplay ? allPoints : splitResponse(response),
              simplified: []
            },
            tone: selectedTone || 'normal',
            consensusPoints: consensusPoints
          };
          await saveAnalysis(analysisData);
        } catch (error) {
          // Error handled silently
        }
      })();
      backgroundPromises.push(savePromise);
      
      // Generate simplified version immediately if in simplified mode
      if (isSimplifiedMode) {
        const simplifyStartTime = performance.now();
        
        const simplifyPromise = (async () => {
          try {
            setIsChangingTone(true);
            const simplified = await OpenAIService.simplifyAnalysis(response);
            
            setSimplifiedResponses([simplified]);
            setStoredSimplifiedResponses({ normal: simplified });
            
            if (isSimplifiedMode && !useThemedDisplay) {
              onResponsesUpdate?.(splitResponse(simplified));
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
      
    } catch (error) {
      setError('Failed to process notes: ' + (error as Error).message);
      setLoading(false);
      processingRef.current = false;
    }
  }, [designChallenge, imageContext, isSimplifiedMode, onComplete, onResponsesUpdate, selectedTone, synthesizedPoints, consensusPoints, useThemedDisplay]);

  // Process notes when they change or when shouldRefresh is true
  useEffect(() => {
    if (stickyNotes.length > 0) {
      processNotes(stickyNotes, shouldRefresh || false)
        .catch(console.error);
    }
  }, [stickyNotes, shouldRefresh, processNotes]);

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
      } else if (responses.length > 0 && !useThemedDisplay) {
        // If we already have the right responses, just update
        const currentResponses = newMode ? simplifiedResponses : responses;
        onResponsesUpdate?.(splitResponse(currentResponses[0]));
      }
      
      return newMode;
    });
  }, [responses, simplifiedResponses, onResponsesUpdate, useThemedDisplay]);

  /**
   * Add design themes to the Miro board
   * This adds themes without removing any existing content
   */
  const addDesignThemes = useCallback(async () => {
    try {
      setLoading(true);
      
      // Get the design themes
      const themes = await DesignThemeService.generateDesignThemes();
      
      // Use only the first 2 themes for antagonistic points
      const themesToUse = themes.slice(0, 2);
      
      // Visualize themes (false = don't create test stickies)
      // This adds theme elements without removing anything
      console.log('Adding design themes without removing any existing content...');
      await DesignThemeService.visualizeThemes(themesToUse, false);
      
      // Update our themed responses
      if (themedResponses.length > 0) {
        // Reprocess themed responses with the new themes
        console.log('Updating themed responses after adding themes');
        
        const updatedThemedResponses = themedResponses.map(themed => {
          // Find matching new theme by name
          const matchingTheme = themesToUse.find(t => 
            t.name.toLowerCase() === themed.name.toLowerCase() ||
            t.name.toLowerCase().includes(themed.name.toLowerCase()) ||
            themed.name.toLowerCase().includes(t.name.toLowerCase())
          );
          
          if (matchingTheme) {
            return {
              ...themed,
              name: matchingTheme.name, // Use the new theme name
              color: matchingTheme.color // Use the new theme color
            };
          }
          return themed;
        });
        
        setThemedResponses(updatedThemedResponses);
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error adding design themes:', error);
      setError('Failed to add design themes: ' + (error as Error).message);
      setLoading(false);
    }
  }, [themedResponses]);

  // Toggle between themed and standard display
  const handleDisplayToggle = useCallback(() => {
    setUseThemedDisplay(prev => {
      const newDisplayMode = !prev;
      
      // Update parent with appropriate responses based on new display mode
      if (newDisplayMode && themedResponses.length > 0) {
        // If switching to themed display, pass all themed points
        const allPoints = themedResponses.flatMap(theme => theme.points);
        onResponsesUpdate?.(allPoints);
      } else if (!newDisplayMode && responses.length > 0) {
        // If switching to standard display, use the normal or simplified responses
        const currentResponses = isSimplifiedMode ? simplifiedResponses : responses;
        if (currentResponses.length > 0) {
          onResponsesUpdate?.(splitResponse(currentResponses[0]));
        }
      }
      
      return newDisplayMode;
    });
  }, [themedResponses, responses, simplifiedResponses, isSimplifiedMode, onResponsesUpdate]);

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
        
        if (!useThemedDisplay) {
          onResponsesUpdate?.(splitResponse(isSimplifiedMode ? normalSimplified : normalFull));
        }
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
        
        if (!useThemedDisplay) {
          onResponsesUpdate?.(splitResponse(storedResponse));
        }
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

      if (!useThemedDisplay) {
        onResponsesUpdate?.(splitResponse(adjustedResponse));
      }
    } catch (error) {
      console.error('Error updating tone:', error);
    } finally {
      setIsChangingTone(false);
    }
  }, [responses, simplifiedResponses, isSimplifiedMode, onResponsesUpdate, storedFullResponses, storedSimplifiedResponses, useThemedDisplay]);

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
            
            {/* Theme Management */}
            {useThemedDisplay && (
              <div style={{ 
                marginBottom: '16px', 
                backgroundColor: '#f0f7ff', 
                padding: '12px', 
                borderRadius: '8px',
                border: '1px solid #d0e0ff'
              }}>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  marginBottom: '8px'
                }}>
                  <span style={{ fontWeight: '500' }}>Design Themes</span>
                  <button
                    onClick={addDesignThemes}
                    className="button button-secondary"
                    style={{ padding: '4px 8px', fontSize: '13px' }}
                    disabled={loading}
                    title="Calculates theme positions without affecting any existing content"
                  >
                    Calculate Positions
                  </button>
                </div>
                <div style={{ fontSize: '13px', color: '#666' }}>
                  {themedResponses.length > 0 ? (
                    <ul style={{ margin: '0', paddingLeft: '20px' }}>
                      {themedResponses.map(theme => (
                        <li key={theme.name}>{theme.name} ({theme.points.length} points)</li>
                      ))}
                    </ul>
                  ) : (
                    <p style={{ margin: '0' }}>No themed responses available</p>
                  )}
                </div>
              </div>
            )}
            
            <AnalysisControls
              selectedTone={selectedTone}
              isSimplifiedMode={isSimplifiedMode}
              synthesizedPointsCount={synthesizedPoints.length}
              onToneChange={handleToneChange}
              onModeToggle={handleModeToggle}
              onShowSynthesizedPoints={() => MiroService.sendSynthesizedPointsToBoard(synthesizedPoints)}
              useThemedDisplay={useThemedDisplay}
              onDisplayToggle={handleDisplayToggle}
            />

            <AnalysisResults
              responses={splitResponse((isSimplifiedMode ? simplifiedResponses : responses)[0] || '')}
              isSimplifiedMode={isSimplifiedMode}
              selectedTone={selectedTone}
              onCleanAnalysis={() => MiroService.cleanAnalysisBoard()}
              isChangingTone={isChangingTone}
              themedResponses={themedResponses}
              useThemedDisplay={useThemedDisplay}
            />
          </div>
        </>
      )}
    </div>
  );
};

export default AntagoInteract;
