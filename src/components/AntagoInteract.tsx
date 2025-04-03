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
      console.log("===== STARTING ANALYSIS GENERATION PIPELINE =====");
      const startTime = performance.now();
      const miroStartTime = performance.now();
      
      console.log("1. Getting design frame and sticky notes...");
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
      console.log(`Found ${designStickyNotes.length} design sticky notes in ${Math.round(miroEndTime - miroStartTime)}ms`);
      
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
      console.log(`2. Formatted design decisions in ${Math.round(formatEndTime - formatStartTime)}ms`);
      
      // THEME PIPELINE - First check if there are themes on the board
      console.log("3. THEME PIPELINE: Checking for existing themes on the board...");
      const themeStartTime = performance.now();
      
      // Just check for existing themes without creating new ones if none exist
      let themesToUse = await DesignThemeService.getCurrentThemesFromBoard();
      let useThemes = themesToUse && themesToUse.length > 0;
      
      if (useThemes) {
        console.log(`Found ${themesToUse.length} existing themes on board:`);
        themesToUse.forEach((theme, i) => console.log(`  - [${i+1}] "${theme.name}" (${theme.color})`));
        
        // Just ensure theme positions are calculated
        console.log('Calculating theme positions for sticky note placement...');
        await DesignThemeService.clearThemePositions();
      } else {
        console.log('No themes found on board. Skipping theme-based categorization.');
      }
      
      const themeEndTime = performance.now();
      console.log(`Theme check completed in ${Math.round(themeEndTime - themeStartTime)}ms`);
      
      // Generate antagonistic points
      const openaiStartTime = performance.now();
      
      // Step 1: Generate a single set of antagonistic points
      console.log("4. ANALYSIS PIPELINE: Generating antagonistic points...");
      const response = await OpenAIService.generateAnalysis(
        messageWithContext, 
        designChallenge,
        synthesizedPoints,
        consensusPoints
      );
      
      // Split into individual points for processing
      console.log("5. Splitting response into individual points...");
      const allPoints = splitResponse(response);
      console.log(`Generated ${allPoints.length} antagonistic points`);
      
      // Initialize themed responses data
      let themedResponsesData: ThemedResponse[] = [];
      
      // Step 2: Categorize these points into themes only if themes exist
      if (useThemes) {
        console.log(`6. CATEGORIZATION PIPELINE: Categorizing ${allPoints.length} points into ${themesToUse.length} themes...`);
        console.log("Themes being used for categorization:");
        themesToUse.forEach((theme, i) => {
          console.log(`  [${i+1}] ${theme.name}`);
        });
        
        const categorizationStartTime = performance.now();
        // Create a custom method that uses existing themes instead of regenerating
        const categorized = await DesignThemeService.categorizeAntagonisticPointsByTheme(
          allPoints,
          themesToUse // Pass existing themes to avoid regeneration
        );
        themedResponsesData = categorized.themes;
        const categorizationEndTime = performance.now();
        
        console.log(`Categorization completed in ${Math.round(categorizationEndTime - categorizationStartTime)}ms`);
        console.log("Final themed responses:");
        themedResponsesData.forEach((theme, i) => {
          console.log(`  [${i+1}] ${theme.name} (${theme.points.length} points)`);
        });
      } else {
        console.log("Skipping theme categorization as no themes were found");
        // If no themes exist, we'll just use standard display mode
        setUseThemedDisplay(false);
      }
      
      const openaiEndTime = performance.now();
      
      // Update UI with the response
      const uiStartTime = performance.now();
      
      console.log("7. Updating UI with responses...");
      setResponses([response]);
      
      if (useThemes) {
        setThemedResponses(themedResponsesData);
      }
      
      setStoredFullResponses({ normal: response }); // Store normal tone
      
      // Update parent with appropriate responses
      if (useThemes && useThemedDisplay) {
        // If using themed display, we still need to pass array of strings for compatibility
        onResponsesUpdate?.(allPoints);
      } else {
        // Otherwise, use the standard response format
        onResponsesUpdate?.(allPoints);
      }
      
      const uiEndTime = performance.now();
      
      // Handle background operations
      const bgStartTime = performance.now();
      
      // Create a tracking variable for background operations
      const backgroundPromises = [];
      
      // Always save to Firebase in the background
      const saveStartTime = performance.now();
      
      console.log("8. Background tasks: Saving analysis to Firebase...");
      const savePromise = (async () => {
        try {
          const analysisData = {
            timestamp: null,
            designChallenge: designChallenge,
            decisions: designStickyNotes.map(note => note.content || ''),
            analysis: {
              full: allPoints,
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
        console.log("9. Generating simplified version of responses...");
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
      
      const totalTime = performance.now() - startTime;
      console.log(`===== ANALYSIS GENERATION COMPLETED in ${Math.round(totalTime)}ms =====`);
      
    } catch (error) {
      console.error("ERROR IN ANALYSIS PIPELINE:", error);
      setError('Failed to process notes: ' + (error as Error).message);
      setLoading(false);
      processingRef.current = false;
    }
  }, [designChallenge, imageContext, isSimplifiedMode, onComplete, onResponsesUpdate, selectedTone, synthesizedPoints, consensusPoints, useThemedDisplay]);

  /**
   * Generate and visualize design themes on the Miro board
   * This is a consolidated method for generating themes to prevent duplication
   */
  const generateAndVisualizeThemes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log("Generating fresh design themes...");
      
      // Clear existing theme positions to start fresh
      await DesignThemeService.clearThemePositions();
      
      // Generate new themes
      const newThemes = await DesignThemeService.generateDesignThemes();
      console.log(`Generated ${newThemes.length} new themes`);
      
      // Visualize themes on the board (false = don't create test stickies)
      console.log('Visualizing themes on board...');
      await DesignThemeService.visualizeThemes(newThemes, false);
      
      // If we have existing responses, re-categorize them with the new themes
      if (responses.length > 0) {
        const currentPoints = splitResponse(
          (isSimplifiedMode && simplifiedResponses.length > 0) ? simplifiedResponses[0] : responses[0]
        );
        
        console.log(`Re-categorizing ${currentPoints.length} points with new themes...`);
        const categorized = await DesignThemeService.categorizeAntagonisticPointsByTheme(
          currentPoints,
          newThemes // Pass the new themes for categorization
        );
        setThemedResponses(categorized.themes);
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error generating themes:', error);
      setError('Failed to generate themes: ' + (error as Error).message);
      setLoading(false);
    }
  }, [responses, simplifiedResponses, isSimplifiedMode]);

  /**
   * Add design themes to the Miro board
   * This adds themes without removing any existing content
   */
  const addDesignThemes = useCallback(async () => {
    try {
      setLoading(true);
      
      // Check if there are already themes on the board
      let themesToUse = await DesignThemeService.getCurrentThemesFromBoard();
      
      // If no themes were found, generate new ones
      if (!themesToUse || themesToUse.length === 0) {
        // Re-use our consolidated method
        await generateAndVisualizeThemes();
        setLoading(false);
        return;
      }
      
      console.log(`Found ${themesToUse.length} existing themes on board`);
      
      // Just ensure theme positions are calculated without creating duplicates
      console.log('Calculating theme positions for sticky note placement...');
      await DesignThemeService.clearThemePositions();
      
      // Update our themed responses
      if (themedResponses.length > 0) {
        // Reprocess themed responses with the existing themes
        console.log('Updating themed responses with existing themes');
        
        const updatedThemedResponses = themedResponses.map(themed => {
          // Find matching theme by name
          const matchingTheme = themesToUse.find(t => 
            t.name.toLowerCase() === themed.name.toLowerCase() ||
            t.name.toLowerCase().includes(themed.name.toLowerCase()) ||
            themed.name.toLowerCase().includes(t.name.toLowerCase())
          );
          
          if (matchingTheme) {
            return {
              ...themed,
              name: matchingTheme.name, // Use the existing theme name
              color: matchingTheme.color // Use the existing theme color
            };
          }
          return themed;
        });
        
        setThemedResponses(updatedThemedResponses);
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Error calculating theme positions:', error);
      setError('Failed to calculate theme positions: ' + (error as Error).message);
      setLoading(false);
    }
  }, [themedResponses, generateAndVisualizeThemes]);

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
      
      // For themed display, we need to simplify or expand each theme's points
      if (useThemedDisplay && themedResponses.length > 0) {
        (async () => {
          try {
            setIsChangingTone(true);
            
            // Process each theme's points
            const updatedThemedResponses = await Promise.all(
              themedResponses.map(async (theme) => {
                // If switching to simplified mode, simplify each point
                if (newMode) {
                  const simplifiedPoints = await Promise.all(
                    theme.points.map(point => 
                      OpenAIService.simplifyPoint(point)
                    )
                  );
                  return { ...theme, points: simplifiedPoints };
                } else {
                  // If the theme has stored original points, restore them
                  // This is a simplification - in a real implementation you would 
                  // need to store original points for each theme
                  // For now we'll just use the current points as-is when switching back
                  return theme;
                }
              })
            );
            
            setThemedResponses(updatedThemedResponses);
            
            // Update parent with all themed points (simplified or full)
            const allPoints = updatedThemedResponses.flatMap(theme => theme.points);
            onResponsesUpdate?.(allPoints);
            
            setIsChangingTone(false);
          } catch (error) {
            console.error('Error updating themed responses for simplified mode:', error);
            setIsChangingTone(false);
          }
        })();
      } else if (responses.length > 0) {
        // Original logic for standard display
        if (newMode && !simplifiedResponses.length) {
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
        } else if (!useThemedDisplay) {
          // If we already have the right responses, just update
          const currentResponses = newMode ? simplifiedResponses : responses;
          onResponsesUpdate?.(splitResponse(currentResponses[0]));
        }
      }
      
      return newMode;
    });
  }, [responses, simplifiedResponses, onResponsesUpdate, useThemedDisplay, themedResponses]);

  // Toggle between themed and standard display
  const handleDisplayToggle = useCallback(() => {
    setUseThemedDisplay(prev => {
      const newDisplayMode = !prev;
      
      // No need to reorganize points since both modes use the same underlying points
      // Just toggle the display mode
      console.log(`Switching display mode to: ${newDisplayMode ? 'themed' : 'standard'}`);
      
      // When switching back to standard display and using simplified mode
      // make sure we have simplified responses available
      if (!newDisplayMode && isSimplifiedMode && !simplifiedResponses.length && responses.length > 0) {
        // If we need to generate simplified responses
        (async () => {
          try {
            setIsChangingTone(true);
            const simplified = await OpenAIService.simplifyAnalysis(responses[0]);
            setSimplifiedResponses([simplified]);
            setStoredSimplifiedResponses({ normal: simplified });
            
            if (isSimplifiedMode) {
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
      
      return newDisplayMode;
    });
  }, [responses, simplifiedResponses, isSimplifiedMode, onResponsesUpdate]);

  /**
   * Handle tone changes and update responses accordingly
   */
  const handleToneChange = useCallback(async (newTone: string) => {
    setSelectedTone(newTone);
    
    // For themed display, adjust tone of each themed point
    if (useThemedDisplay && themedResponses.length > 0) {
      try {
        setIsChangingTone(true);
        
        // Process each theme's points
        const updatedThemedResponses = await Promise.all(
          themedResponses.map(async (theme) => {
            // If no tone selected, use original versions (this needs original storage)
            if (!newTone) {
              return theme; // Simplified - in real implementation, restore originals
            }
            
            // Adjust tone of each point in the theme
            const adjustedPoints = await Promise.all(
              theme.points.map(point => 
                OpenAIService.adjustPointTone(point, newTone)
              )
            );
            
            return { ...theme, points: adjustedPoints };
          })
        );
        
        setThemedResponses(updatedThemedResponses);
        
        // Update parent with all themed points (with adjusted tone)
        const allPoints = updatedThemedResponses.flatMap(theme => theme.points);
        onResponsesUpdate?.(allPoints);
        
        setIsChangingTone(false);
      } catch (error) {
        console.error('Error adjusting tone for themed responses:', error);
        setIsChangingTone(false);
      }
      return;
    }
    
    // Original logic for standard display
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
  }, [responses, simplifiedResponses, isSimplifiedMode, onResponsesUpdate, storedFullResponses, storedSimplifiedResponses, useThemedDisplay, themedResponses]);

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
    // If we have responses available
    if (responses.length > 0) {
      const currentPoints = splitResponse(
        (isSimplifiedMode && simplifiedResponses.length > 0) ? simplifiedResponses[0] : responses[0]
      );
      
      // Update parent with current points - these are the same underlying points
      // regardless of display mode
      onResponsesUpdate?.(currentPoints);
    }
  }, [isSimplifiedMode, useThemedDisplay, responses, simplifiedResponses, onResponsesUpdate]);

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
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={async () => {
                        try {
                          setLoading(true);
                          setError(null);
                          console.log("Refreshing themes directly from the board...");
                          
                          // Clear theme positions cache to force a complete refresh
                          await DesignThemeService.clearThemePositions();
                          
                          // Get fresh themes from the board
                          const freshThemes = await DesignThemeService.getCurrentThemesFromBoard();
                          console.log(`Refreshed ${freshThemes.length} themes from board`);
                          
                          // Update UI with fresh themes
                          // Re-use existing themed responses but update with fresh theme data
                          const updatedThemedResponses = themedResponses.map(themed => {
                            // Find matching fresh theme by name
                            const matchingTheme = freshThemes.find(t => 
                              t.name.toLowerCase() === themed.name.toLowerCase() ||
                              t.name.toLowerCase().includes(themed.name.toLowerCase()) ||
                              themed.name.toLowerCase().includes(t.name.toLowerCase())
                            );
                            
                            if (matchingTheme) {
                              return {
                                ...themed,
                                name: matchingTheme.name,
                                color: matchingTheme.color
                              };
                            }
                            return themed;
                          });
                          
                          setThemedResponses(updatedThemedResponses);
                          setLoading(false);
                        } catch (error) {
                          console.error('Error refreshing themes:', error);
                          setError('Failed to refresh themes: ' + (error as Error).message);
                          setLoading(false);
                        }
                      }}
                      className="button button-secondary"
                      style={{ padding: '4px 8px', fontSize: '13px' }}
                      disabled={loading}
                      title="Refresh themes directly from the board"
                    >
                      Refresh Themes
                    </button>
                    <button
                      onClick={generateAndVisualizeThemes}
                      className="button button-secondary"
                      style={{ padding: '4px 8px', fontSize: '13px' }}
                      disabled={loading}
                      title="Generate new themes and visualize them on the board"
                    >
                      Generate Themes
                    </button>
                    <button
                      onClick={addDesignThemes}
                      className="button button-secondary"
                      style={{ padding: '4px 8px', fontSize: '13px' }}
                      disabled={loading}
                      title="Calculate positions for existing themes without creating new ones"
                    >
                      Calculate Positions
                    </button>
                  </div>
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
