import React, { useState, useRef, useCallback } from 'react';
import { TranscriptProcessingService } from '../services/transcriptProcessingService';
import { StickyNoteService } from '../services/miro/stickyNoteService';
import { RelevanceService } from '../services/relevanceService';
import { ConfigurationService } from '../services/configurationService';
import { 
  FileProcessingProps, 
  ProcessedPointWithRelevance 
} from '../types/common';
import {
  transcribeAudioFile,
  chunkTranscript,
  calculateProgressPercentage,
  delay
} from '../utils/fileProcessingUtils';
import { safeApiCall } from '../utils/errorHandlingUtils';

/**
 * Component for testing file upload and processing into sticky notes
 */
export const FileUploadTest: React.FC<FileProcessingProps> = ({ 
  mode, 
  onNewPoints, 
  skipParentCallback = false,
  relevanceThreshold
}) => {
  // Get configuration
  const relevanceConfig = ConfigurationService.getRelevanceConfig();
  const threshold = relevanceThreshold ?? relevanceConfig.scale.defaultThreshold;
  
  // Component state
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [shouldStop, setShouldStop] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Refs for tracking processing state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef<boolean>(false);
  const stopRequestedRef = useRef<boolean>(false);

  /**
   * Handle file input change
   */
  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setFileName(file.name);
    setErrorMessage(null);
    await processAudioFile(file);
  }, []);
  
  /**
   * Handle button click - either open file picker or stop processing
   */
  const handleClick = useCallback(() => {
    if (isProcessing) {
      // Request stop when processing
      console.log("Stop requested via click - halting processing");
      stopRequestedRef.current = true;
      setShouldStop(true);
    } else {
      // Open file picker when not processing
      fileInputRef.current?.click();
    }
  }, [isProcessing]);

  /**
   * Process an audio file
   */
  const processAudioFile = async (file: File) => {
    try {
      // Reset state
      setIsProcessing(true);
      processingRef.current = true;
      stopRequestedRef.current = false;
      setShouldStop(false);
      setProgress(0);
      setErrorMessage(null);
      
      console.log(`Starting processing of audio file: ${file.name}`);
      
      // Transcribe the file
      const result = await safeApiCall(
        () => transcribeAudioFile(file),
        null,
        'Transcribe Audio',
        { fileName: file.name }
      );
      
      if (!result) {
        throw new Error('Transcription failed');
      }
      
      // Check if stop was requested during transcription
      if (stopRequestedRef.current) {
        console.log("Stop requested during transcription, aborting");
        return;
      }
      
      // Process the transcript in chunks
      await processTranscriptChunks(result.transcription);
      
    } catch (error) {
      console.error('Error processing audio file:', error);
      setErrorMessage((error as Error).message || 'An error occurred processing the file');
    } finally {
      // Reset processing state
      setIsProcessing(false);
      processingRef.current = false;
      setProgress(0);
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };
  
  /**
   * Process transcript chunks and create sticky notes
   */
  const processTranscriptChunks = async (transcript: string) => {
    const chunks = chunkTranscript(transcript);
    
    // Create/find the frame for this mode
    const frameName = StickyNoteService.getFrameNameForMode(mode);
    console.log(`Using frame: "${frameName}" for ${mode} mode`);
    const frame = await StickyNoteService.ensureFrameExists(frameName);

    // Fetch current design decisions for relevance evaluation
    const designDecisions = await StickyNoteService.getStickiesFromNamedFrame(
      ConfigurationService.getFrameConfig().names.designDecision
    );
    console.log(`Fetched ${designDecisions.length} design decisions for relevance comparison`);
    
    // Initialize counter array for tracking stickies by score
    const countsByScore = StickyNoteService.getInitialCounters();
    
    // Track counts by score for logging
    let processedCounts = Array(relevanceConfig.scale.max).fill(0);
    
    // Process each chunk
    for (let i = 0; i < chunks.length; i++) {
      // Check if stop requested before processing chunk
      if (stopRequestedRef.current) {
        console.log(`Stop requested before processing chunk ${i+1}, aborting`);
        break;
      }
      
      const chunk = chunks[i];
      
      // Update progress
      setProgress(calculateProgressPercentage(i, chunks.length));
      
      console.log(`Processing chunk ${i+1}/${chunks.length} (${chunk.length} chars): ${chunk.substring(0, 50)}...`);
      
      // Process this chunk
      const processedPoints = await TranscriptProcessingService.processTranscript(chunk);
      console.log(`Chunk ${i+1} generated ${processedPoints.length} points`);
      
      // Check if stop requested after processing but before sending to callback
      if (stopRequestedRef.current) {
        console.log(`Stop requested after processing chunk ${i+1}, aborting`);
        break;
      }
      
      // Evaluate relevance for each point
      const pointsWithRelevance = await evaluatePointsRelevance(processedPoints, designDecisions, threshold);
      
      // Log relevance distribution
      logRelevanceDistribution(pointsWithRelevance, i);
      
      // Update processed counts
      for (const point of pointsWithRelevance) {
        processedCounts[point.relevanceScore - 1]++;
      }
      
      // Call the callback with the processed points from this chunk if needed
      if (pointsWithRelevance.length > 0 && !skipParentCallback) {
        console.log(`Sending ${pointsWithRelevance.length} points from chunk ${i+1} to callback`);
        onNewPoints(pointsWithRelevance.map(p => p.proposal));
      } else if (skipParentCallback) {
        console.log(`Skipping parent callback as requested, creating sticky notes directly`);
      }
      
      // Create sticky notes for this chunk immediately
      await createStickyNotesForPoints(pointsWithRelevance, frame, countsByScore);
      
      // Add a delay between chunks
      await delay(500);
      
      // Final check if we should stop before the next chunk
      if (stopRequestedRef.current) {
        console.log(`Stop requested after creating stickies for chunk ${i+1}, aborting`);
        break;
      }
    }
    
    // Log completion
    console.log(`Completed processing: created ${
      processedCounts.map((count, index) => `Score ${index + 1}: ${count}`).join(', ')
    } sticky notes`);
    setProgress(100);
  };
  
  /**
   * Evaluate the relevance of points to design decisions
   */
  const evaluatePointsRelevance = async (
    points: Array<{ proposal: string, category?: string, explanation?: string }>,
    designDecisions: string[],
    threshold: number
  ): Promise<ProcessedPointWithRelevance[]> => {
    const pointsWithRelevance: ProcessedPointWithRelevance[] = [];
    
    for (const point of points) {
      // Check if stop requested during evaluation
      if (stopRequestedRef.current) {
        break;
      }
      
      const { category, score } = await RelevanceService.evaluateRelevance(
        point.proposal, 
        designDecisions,
        threshold
      );
      
      pointsWithRelevance.push({
        ...point,
        relevance: category,
        relevanceScore: score
      });
    }
    
    return pointsWithRelevance;
  };
  
  /**
   * Log the distribution of relevance scores
   */
  const logRelevanceDistribution = (
    points: ProcessedPointWithRelevance[],
    chunkIndex: number
  ) => {
    const scoreGroups = Array(relevanceConfig.scale.max)
      .fill(0)
      .map((_, i) => points.filter(p => p.relevanceScore === i + 1).length);
    
    const scoreInfo = scoreGroups
      .map((count, index) => `Score ${index + 1}: ${count}`)
      .join(', ');
      
    console.log(`Chunk ${chunkIndex + 1} relevance distribution: ${scoreInfo}`);
  };
  
  /**
   * Create sticky notes for a set of points
   */
  const createStickyNotesForPoints = async (
    points: ProcessedPointWithRelevance[],
    frame: any,
    countsByScore: number[]
  ) => {
    for (let j = 0; j < points.length; j++) {
      // Check if stop requested during sticky creation
      if (stopRequestedRef.current) {
        console.log(`Stop requested during sticky creation, aborting`);
        break;
      }
      
      const point = points[j];
      const { proposal, relevanceScore } = point;
      
      try {
        // Create sticky note
        await StickyNoteService.createStickyWithRelevance(
          frame,
          proposal,
          relevanceScore,
          mode,
          countsByScore
        );
        
        // Increment the counter for this score
        const scoreIndex = relevanceScore - 1;
        countsByScore[scoreIndex]++;
        
        console.log(`Created score ${relevanceScore} sticky note in ${frame.title} frame area`);
        
        // Add a delay between creations
        await delay(ConfigurationService.getRelevanceConfig().delayBetweenCreations);
      } catch (error) {
        console.error(`Error creating sticky note:`, error);
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
      
      {errorMessage && (
        <div style={{ 
          color: '#ff4d4f', 
          marginTop: '8px',
          fontSize: '14px' 
        }}>
          Error: {errorMessage}
        </div>
      )}
      
      <style jsx>{`
        @keyframes pulse {
          0% {
            opacity: 0.5;
          }
          50% {
            opacity: 1;
          }
          100% {
            opacity: 0.5;
          }
        }
      `}</style>
    </div>
  );
}; 