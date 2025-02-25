import React, { useState, useRef } from 'react';
import { TranscriptProcessingService } from '../services/transcriptProcessingService';

// Define the new RelevanceCategory type
type RelevanceCategory = 'relevant' | 'not-relevant';

interface ProcessedPointWithRelevance extends ProcessedDesignPoint {
  relevance: RelevanceCategory;
  relevanceScore: number; // Add score to track the actual numerical value
}

interface FileUploadTestProps {
  mode: 'decision' | 'response';  // Same mode as VoiceRecorder for consistency
  onNewPoints: (points: string[]) => void;  // Callback when new points are processed
  skipParentCallback?: boolean;  // Flag to skip parent callback to prevent double creation
  relevanceThreshold?: number;  // Threshold for determining relevance (1-3)
}

// Add this interface for the ProcessedDesignPoint
interface ProcessedDesignPoint {
  proposal: string;
  category?: string;
  explanation?: string;
}

export const FileUploadTest: React.FC<FileUploadTestProps> = ({ 
  mode, 
  onNewPoints, 
  skipParentCallback = false,
  relevanceThreshold = 2 // Default threshold of 2 on a 3-point scale
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [shouldStop, setShouldStop] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef<boolean>(false);
  const stopRequestedRef = useRef<boolean>(false); // Use a ref instead of state for immediate access

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setFileName(file.name);
    await processAudioFile(file);
  };
  
  // Split this into two separate handlers for better control
  const handleClick = () => {
    if (!isProcessing) {
      // Trigger file input click
      fileInputRef.current?.click();
    } else {
      // Handle stop through normal click when processing
      console.log("Stop requested via click - halting processing");
      stopRequestedRef.current = true;
      setShouldStop(true);
    }
  };
  
  // Create a frameName constant for consistency
  const getFrameName = () => mode === 'decision' ? 'Thinking-Dialogue' : 'Analysis-Response';

  // Create frame and get its ID
  const ensureFrameExists = async (frameName: string) => {
    try {
      // Find existing frames
      const frames = await miro.board.get({ type: 'frame' });
      let frame = frames.find(f => f.title === frameName);
      
      if (!frame) {
        console.log(`Creating new "${frameName}" frame...`);
        // Create a new frame in a visible area
        frame = await miro.board.createFrame({
          title: frameName,
          x: 1000, // Position it away from other frames
          y: 0,
          width: 1200,  // Wider frame
          height: 1600   // Taller frame to accommodate multiple sticky notes
        });
        console.log(`New frame created: ${frameName}`);
      } else {
        console.log(`Found existing "${frameName}" frame at (${frame.x}, ${frame.y})`);
      }
      
      return frame;
    } catch (error) {
      console.error(`Error ensuring frame ${frameName} exists:`, error);
      throw error;
    }
  };

  // Fetch current Design-Decision content
  const getCurrentDesignDecisions = async (): Promise<string[]> => {
    try {
      console.log("Fetching current Design-Decision content...");
      const frames = await miro.board.get({ type: 'frame' });
      const designFrame = frames.find(f => f.title === 'Design-Decision');
      
      if (!designFrame) {
        console.log("Design-Decision frame not found, returning empty array");
        return [];
      }
      
      // Get all sticky notes on the board
      const allStickies = await miro.board.get({ type: 'sticky_note' });
      
      // Filter sticky notes that are in the Design-Decision frame
      const designStickies = allStickies
        .filter(sticky => sticky.parentId === designFrame.id)
        .map(sticky => sticky.content || '');
      
      console.log(`Found ${designStickies.length} design decisions`);
      return designStickies;
    } catch (error) {
      console.error("Error fetching design decisions:", error);
      return [];
    }
  };

  // Evaluate relevance of a point to current design decisions
  const evaluateRelevance = async (
    point: string, 
    designDecisions: string[]
  ): Promise<{ category: RelevanceCategory; score: number }> => {
    if (designDecisions.length === 0) {
      return { category: 'relevant', score: 3 }; // If no design decisions, consider everything relevant with max score
    }
    
    try {
      // Create a prompt that asks for a numerical score on a 3-point scale
      const designContext = designDecisions.join("\n");
      const systemPrompt = `You are an AI assistant that evaluates how relevant a design point is to current design decisions.
      
      Your task is to critically evaluate whether a given point directly addresses or builds upon the existing design decisions.
      
      Scoring criteria (3-point scale):
      - 3: HIGHLY RELEVANT - Directly addresses or builds upon specific design decisions. Clear and direct connection to existing work.
      - 2: SOMEWHAT RELEVANT - Related to the general theme but connection to specific design decisions is weaker.
      - 1: NOT RELEVANT - Off-topic or introduces entirely new concepts unrelated to current design decisions.
      
      Respond with ONLY a single numerical score (1-3) and nothing else.`;

      const userPrompt = `Design Decisions:
${designContext}

Point to evaluate:
${point}

Rate this point's relevance to the design decisions above on a scale of 1-3 (higher = more relevant).
Remember to be critical and rigorous in your assessment. Only assign the highest score (3) if there's a very clear, direct connection.`;
      
      console.log(`Evaluating relevance for point: ${point.substring(0, 50)}...`);
      
      // Call the OpenAI API
      const response = await fetch('/api/openaiwrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemPrompt,
          userPrompt,
          useGpt4: false // Use a lighter model for faster response
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to evaluate relevance');
      }
      
      const result = await response.json();
      
      // Extract the numerical score from the response
      const scoreMatch = result.response.match(/\d+/);
      let score = scoreMatch ? parseInt(scoreMatch[0], 10) : 2; // Default to 2 if no number found
      
      // Constrain score to 1-3 range in case of parsing issues
      score = Math.max(1, Math.min(3, score));
      
      // Use the provided threshold for relevance
      const category = score >= relevanceThreshold ? 'relevant' : 'not-relevant';
      console.log(`Relevance evaluation: Score ${score}/3 - ${category} (threshold: ${relevanceThreshold})`);
      
      return { category, score };
    } catch (error) {
      console.error("Error evaluating relevance:", error);
      return { category: 'relevant', score: 3 }; // Default to relevant on error with max score
    }
  };

  // Calculate positions based on score (1-3)
  const calculateStickyPosition = (
    index: number, 
    frame: any, 
    totalSoFar: number, 
    score: number // Changed from relevance to actual score
  ) => {
    const STICKY_WIDTH = 300;
    const STICKY_HEIGHT = 200;
    const SPACING = 20;
    const ITEMS_PER_COL = 7; // Maximum items per column
    
    // Frame dimensions
    const frameLeft = frame.x - frame.width/2;
    const frameTop = frame.y - frame.height/2;
    const frameWidth = frame.width;
    
    // Calculate section width (frame divided into 3 equal sections)
    const sectionWidth = frameWidth / 3;
    
    // Determine which section this sticky belongs to (1-3)
    // Section 0 = score 1 (left), Section 1 = score 2 (middle), Section 2 = score 3 (right)
    const sectionIndex = score - 1; // Convert score (1-3) to section index (0-2)
    
    // Track stickies by their score (we need separate counters for each score)
    const countersByScore = [0, 0, 0]; // Create an array to hold counters for each score
    countersByScore[sectionIndex] = totalSoFar;
    
    // Calculate row and column within this score's section
    const col = Math.floor(countersByScore[sectionIndex] / ITEMS_PER_COL);
    const row = countersByScore[sectionIndex] % ITEMS_PER_COL;
    
    // Calculate the base x position for this score's section
    const sectionBaseX = frameLeft + (sectionIndex * sectionWidth) + (sectionWidth / 2);
    
    // Calculate final position
    const x = sectionBaseX - (STICKY_WIDTH / 2) + (col * (STICKY_WIDTH + SPACING));
    const y = frameTop + 150 + (row * (STICKY_HEIGHT + SPACING));
    
    return { x, y };
  };

  // Additional helper to get total count by score
  const getTotalsByScore = (pointsWithRelevance: ProcessedPointWithRelevance[]) => {
    const totals = [0, 0, 0]; // For scores 1, 2, 3
    
    pointsWithRelevance.forEach(point => {
      const scoreIndex = point.relevanceScore - 1;
      if (scoreIndex >= 0 && scoreIndex < 3) {
        totals[scoreIndex]++;
      }
    });
    
    return totals;
  };

  const processAudioFile = async (file: File) => {
    try {
      setIsProcessing(true);
      processingRef.current = true;
      stopRequestedRef.current = false;
      setShouldStop(false);
      setProgress(0);
      
      console.log(`Starting processing of audio file: ${file.name}`);
      
      // Create a FormData object to send the file
      const formData = new FormData();
      formData.append('audio', file);
      
      // Send to the same API endpoint used by VoiceRecordingService
      console.log("Sending audio file to transcription API...");
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error(`Processing failed: ${response.statusText}`);
      }
      
      const result = await response.json();
      console.log(`Transcription complete. Length: ${result.transcription.length} characters, Duration: ${result.duration}s`);
      
      // Check if stop was requested during transcription
      if (stopRequestedRef.current) {
        console.log("Stop requested during transcription, aborting");
        return;
      }
      
      // Process the transcript in progressive chunks to simulate real-time recording
      const transcript = result.transcription;
      
      // Calculate the character count that roughly corresponds to 30 seconds of speech
      // This is an approximation - average English speaker says ~150 words per minute
      // With average word length of ~5 chars, that's ~750 chars per 30 seconds
      const CHARS_PER_30_SECONDS = 750;
      
      // Create/find the frame once before starting
      const frameName = getFrameName();
      console.log(`Using frame: "${frameName}" for ${mode} mode`);
      const frame = await ensureFrameExists(frameName);

      // Fetch current design decisions for relevance evaluation
      const designDecisions = await getCurrentDesignDecisions();
      console.log(`Fetched ${designDecisions.length} design decisions for relevance comparison`);
      
      // Track total sticky counts by score (1-3)
      const countsByScore = [0, 0, 0]; 
      
      // Process transcript chunk by chunk to simulate real-time streaming
      for (let i = 0; i < transcript.length; i += CHARS_PER_30_SECONDS) {
        // Check if stop requested before processing chunk
        if (stopRequestedRef.current) {
          console.log(`Stop requested before processing chunk ${Math.floor(i / CHARS_PER_30_SECONDS) + 1}, aborting`);
          break;
        }
        
        const chunkNumber = Math.floor(i / CHARS_PER_30_SECONDS) + 1;
        const chunk = transcript.substring(i, i + CHARS_PER_30_SECONDS);
        
        // Update progress to show which chunk we're processing
        const chunkProgress = Math.min(10 + Math.round((i / transcript.length) * 80), 90);
        setProgress(chunkProgress);
        
        console.log(`Processing chunk ${chunkNumber} (${chunk.length} chars): ${chunk.substring(0, 50)}...`);
        
        // Process this chunk with TranscriptProcessingService (similar to voice recording)
        const processedPoints = await TranscriptProcessingService.processTranscript(chunk);
        
        console.log(`Chunk ${chunkNumber} generated ${processedPoints.length} points`);
        
        // Check if stop requested after processing but before sending to callback
        if (stopRequestedRef.current) {
          console.log(`Stop requested after processing chunk ${chunkNumber}, aborting`);
          break;
        }
        
        // Evaluate relevance for each point
        const pointsWithRelevance: ProcessedPointWithRelevance[] = [];
        for (const point of processedPoints) {
          const { category, score } = await evaluateRelevance(point.proposal, designDecisions);
          pointsWithRelevance.push({
            ...point,
            relevance: category,
            relevanceScore: score
          });
        }
        
        // Organize points by score for logging
        const score1Points = pointsWithRelevance.filter(p => p.relevanceScore === 1);
        const score2Points = pointsWithRelevance.filter(p => p.relevanceScore === 2);
        const score3Points = pointsWithRelevance.filter(p => p.relevanceScore === 3);
        console.log(`Relevance scores: Score 1: ${score1Points.length}, Score 2: ${score2Points.length}, Score 3: ${score3Points.length}`);
        
        // Call the callback with the processed points from this chunk
        // Only if not skipping the parent callback
        if (pointsWithRelevance.length > 0 && !skipParentCallback) {
          console.log(`Sending ${pointsWithRelevance.length} points from chunk ${chunkNumber} to callback`);
          onNewPoints(pointsWithRelevance.map(p => p.proposal));
        } else if (skipParentCallback) {
          console.log(`Skipping parent callback as requested, creating sticky notes directly`);
        }
        
        // Create sticky notes for this chunk immediately
        for (let j = 0; j < pointsWithRelevance.length; j++) {
          // Check if stop requested during sticky creation
          if (stopRequestedRef.current) {
            console.log(`Stop requested during sticky creation for chunk ${chunkNumber}, aborting`);
            break;
          }
          
          const pointWithRelevance = pointsWithRelevance[j];
          const { proposal, relevance, relevanceScore } = pointWithRelevance;
          
          // Use the score to determine the section and get the counter for that score
          const scoreIndex = relevanceScore - 1; // 0-based index for our counters
          
          // Calculate position based on score
          const position = calculateStickyPosition(j, frame, countsByScore[scoreIndex], relevanceScore);
          
          // Determine color based on mode and relevance
          let color: string;
          if (mode === 'decision') {
            // For decision mode: use colors based on score
            if (relevanceScore === 3) {
              color = 'light_yellow'; // High relevance - yellow
            } else if (relevanceScore === 2) {
              color = 'light_green'; // Medium relevance - green
            } else {
              color = 'light_pink'; // Low relevance - pink
            }
          } else {
            // For response mode: use colors based on score
            if (relevanceScore === 3) {
              color = 'light_blue'; // High relevance - blue
            } else if (relevanceScore === 2) {
              color = 'light_green'; // Medium relevance - green
            } else {
              color = 'light_pink'; // Low relevance - pink
            }
          }
          
          try {
            // Add relevance score to content
            const stickyContent = `${proposal}\n\n[Relevance: ${relevanceScore}/3]`;
            
            // Create sticky note directly at the calculated position within frame bounds
            const stickyNote = await miro.board.createStickyNote({
              content: stickyContent,
              x: position.x,
              y: position.y,
              width: 300, // STICKY_WIDTH
              style: {
                fillColor: color as any
              }
            });
            
            console.log(`Created score ${relevanceScore} sticky note for chunk ${chunkNumber}, point ${j+1}/${pointsWithRelevance.length} at (${position.x}, ${position.y}) in ${frameName} frame area`);
            
            // Increment the counter for this score
            countsByScore[scoreIndex]++;
            
            // Add a short delay between creations to prevent API rate limiting
            await new Promise(resolve => setTimeout(resolve, 200));
          } catch (error) {
            console.error(`Error creating sticky note for chunk ${chunkNumber}:`, error);
          }
        }
        
        // Add a simulated delay (500ms) between chunks to mimic real-time processing
        // In a real recording, this would be the time it takes to record the next chunk
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Final check if we should stop before the next chunk
        if (stopRequestedRef.current) {
          console.log(`Stop requested after creating stickies for chunk ${chunkNumber}, aborting`);
          break;
        }
      }
      
      console.log(`Completed processing: created Score 1: ${countsByScore[0]}, Score 2: ${countsByScore[1]}, Score 3: ${countsByScore[2]} sticky notes`);
      setProgress(100);
      
    } catch (error) {
      console.error('Error processing audio file:', error);
    } finally {
      // Only reset processing states, not the stop flag
      setIsProcessing(false);
      processingRef.current = false;
      setProgress(0);
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };
  
  return (
    <div className="file-upload-test" style={{ marginBottom: '16px' }}>
      <input 
        type="file"
        accept="audio/*"
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      
      <button
        onClick={handleClick}
        disabled={isProcessing && shouldStop} // Disable when stopping
        className={`button ${isProcessing ? 'button-danger' : 'button-secondary'}`}
        style={{ 
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          width: '100%'
        }}
      >
        {shouldStop ? (
          'Stopping...'
        ) : isProcessing ? (
          <>
            <span style={{ 
              display: 'inline-block',
              width: '10px',
              height: '10px',
              backgroundColor: '#ff4d4f',
              borderRadius: '50%',
              animation: 'pulse 1.5s infinite'
            }}></span>
            {`Processing ${fileName} (${progress}%) - Click to stop`}
          </>
        ) : (
          <>
            <span style={{ 
              display: 'inline-block',
              width: '10px',
              height: '10px',
              backgroundColor: '#1890ff',
              borderRadius: '50%'
            }}></span>
            Test with audio file ({mode === 'decision' ? 'Design Thoughts' : 'Response'})
          </>
        )}
      </button>
      
      <style jsx>{`
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.4; }
          100% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}; 