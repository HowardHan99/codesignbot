'use client';
import React, { useState, useEffect } from 'react';
import { VoiceRecordingService } from '../services/voiceRecordingService';
import { TranscriptProcessingService } from '../services/transcriptProcessingService';
import { ApiService } from '../services/apiService';
import { InclusiveDesignCritiqueService } from '../services/inclusiveDesignCritiqueService';
import { StickyNoteService } from '../services/miro/stickyNoteService';
import { RelevanceService } from '../services/relevanceService';
import { ConfigurationService } from '../services/configurationService';
import { ProcessedDesignPoint, ProcessedPointWithRelevance } from '../types/common';
import { delay } from '../utils/fileProcessingUtils';

interface VoiceRecorderProps {
  mode: 'decision' | 'response';  // Mode of recording: design decision or response
  onNewPoints: (points: string[]) => void;  // Callback when new points are processed
  enableRealTimeCritique?: boolean; // Whether to enable real-time inclusive design critique
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ 
  mode, 
  onNewPoints,
  enableRealTimeCritique = true // Default to enabled
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [processingRecording, setProcessingRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [timer, setTimer] = useState<NodeJS.Timeout | null>(null);
  const [lastCritiqueTime, setLastCritiqueTime] = useState<number>(0);
  const [critiqueModeEnabled, setCritiqueModeEnabled] = useState<boolean>(enableRealTimeCritique);
  
  // Add error state
  const [recordingError, setRecordingError] = useState<string | null>(null);
  
  // Track critiques to avoid duplicates
  const [recentCritiques, setRecentCritiques] = useState<Set<string>>(new Set());
  
  // Minimum time between critique checks to avoid overwhelming the API
  const CRITIQUE_INTERVAL_MS = 30000; // 30 seconds

  // Handle browser compatibility for getUserMedia
  useEffect(() => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.error('Browser does not support voice recording');
      setRecordingError('Your browser does not support voice recording. Please try a modern browser like Chrome or Firefox.');
    }
  }, []);
  
  // Initialize critique mode from props
  useEffect(() => {
    setCritiqueModeEnabled(enableRealTimeCritique);
  }, [enableRealTimeCritique]);

  // Update timer every second while recording
  useEffect(() => {
    if (isRecording) {
      const interval = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
      setTimer(interval);
    } else if (timer) {
      clearInterval(timer);
      setTimer(null);
    }

    return () => {
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [isRecording]);

  // Process transcription chunks and optionally run inclusive design critique
  const handleTranscriptionChunk = async (transcription: string) => {
    // Clear any previous errors
    setRecordingError(null);
    
    console.log(`[DEBUG] handleTranscriptionChunk received: ${transcription.substring(0, 50)}...`);
    
    // Convert single transcription string to array with one item 
    // for compatibility with onNewPoints
    if (transcription && transcription.trim()) {
      try {
        // Forward the transcription to the parent component
        onNewPoints([transcription]);
        
        console.log(`[DEBUG] Processing chunk through TranscriptProcessingService`);
        // Process the chunk into design points, but don't send them to Design-Proposal
        const processedPoints = await TranscriptProcessingService.processTranscript(transcription);
        console.log(`[DEBUG] TranscriptProcessingService returned ${processedPoints.length} points`);
        
        if (processedPoints && processedPoints.length > 0) {
          console.log(`[DEBUG] Creating sticky notes for ${processedPoints.length} processed points from chunk`);
          // Create sticky notes in the Thinking-Dialogue frame
          
          // Get cached design decisions for relevance calculation
          const designDecisions = await InclusiveDesignCritiqueService.getDesignDecisions();
          
          // Use the unified method to create sticky notes
          await StickyNoteService.createStickyNotesFromPoints(
            "Thinking-Dialogue",
            processedPoints,
            'decision',
            designDecisions
          );
        } else {
          console.log(`[DEBUG] No processedPoints to create sticky notes from`);
        }
        
        // Only check for critiques in decision mode and if enabled
        if (critiqueModeEnabled && mode === 'decision') {
          await checkForInclusiveDesignCritiques(transcription);
        }
      } catch (error) {
        console.error('Error processing transcription chunk:', error);
        setRecordingError('Failed to process speech. Please try again.');
      }
    } else {
      console.log(`[DEBUG] Empty transcription chunk received, skipping processing`);
    }
  };
  
  // Helper function to create sticky notes for a chunk
  // This function is no longer needed as we're using the unified method
  // However, we'll keep the signature in case it's called elsewhere
  const createStickyNotesForChunk = async (processedPoints: ProcessedDesignPoint[]) => {
    try {
      // Get cached design decisions for relevance calculation
      const designDecisions = await InclusiveDesignCritiqueService.getDesignDecisions();
      
      // Use the unified method to create sticky notes
      await StickyNoteService.createStickyNotesFromPoints(
        "Thinking-Dialogue",
        processedPoints,
        'decision',
        designDecisions
      );
    } catch (error) {
      console.error('Error creating sticky notes for chunk:', error);
    }
  };
  
  // Toggle critique mode
  const handleToggleCritiqueMode = () => {
    setCritiqueModeEnabled(prev => !prev);
  };
  
  // Check for inclusive design critiques if enough time has passed
  const checkForInclusiveDesignCritiques = async (transcription: string) => {
    const now = Date.now();
    
    // Only analyze if enough time has passed since last critique
    if (now - lastCritiqueTime >= CRITIQUE_INTERVAL_MS) {
      try {
        // Set the timestamp first to prevent multiple parallel calls
        setLastCritiqueTime(now);
        
        console.log('Checking for inclusive design critiques...');
        const critiques = await InclusiveDesignCritiqueService.analyzeAndCritique(transcription);
        
        // Update recent critiques to avoid duplicates
        if (critiques.length > 0) {
          const newCritiques = new Set(recentCritiques);
          critiques.forEach(critique => newCritiques.add(critique));
          setRecentCritiques(newCritiques);
          
          console.log(`Generated ${critiques.length} inclusive design critiques`);
        } else {
          console.log('No inclusive design critiques generated for this chunk');
        }
      } catch (error) {
        console.error('Error generating inclusive design critiques:', error);
      }
    }
  };

  const handleStartRecording = async () => {
    // Clear any previous errors
    setRecordingError(null);
    
    try {
      setIsRecording(true);
      setRecordingDuration(0);
      await VoiceRecordingService.startRecording(handleTranscriptionChunk);
    } catch (error) {
      console.error('Failed to start recording:', error);
      setIsRecording(false);
      
      // Set appropriate error message based on the error
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        setRecordingError('Microphone access denied. Please allow microphone access and try again.');
      } else if (error instanceof DOMException && error.name === 'NotFoundError') {
        setRecordingError('No microphone found. Please connect a microphone and try again.');
      } else {
        setRecordingError('Failed to start recording. Please check your microphone and try again.');
      }
    }
  };

  const handleStopRecording = async () => {
    try {
      setIsRecording(false);
      setProcessingRecording(true);
      
      const audioBlob = await VoiceRecordingService.stopRecording();
      
      // Process the recording if we have an audio blob
      if (audioBlob && audioBlob.size > 0) {
        console.log(`Processing audio recording: ${audioBlob.size} bytes, type: ${audioBlob.type}`);
        
        try {
          // First transcribe the audio blob to text
          const file = new File(
            [audioBlob], 
            `recording.${audioBlob.type.split('/')[1] || 'webm'}`, 
            { type: audioBlob.type }
          );
          
          const transcriptionResult = await ApiService.transcribeAudio(file);
          
          if (transcriptionResult && transcriptionResult.transcription) {
            // Process the transcription to extract points
            const processedPoints = await TranscriptProcessingService.processTranscript(
              transcriptionResult.transcription
            );
            
            // Pass the processed points to the callback
            if (processedPoints && processedPoints.length > 0) {
              onNewPoints(processedPoints.map(item => item.proposal));
              
              // Clear any previous errors on success
              setRecordingError(null);
              
              // Get cached design decisions for relevance calculation
              const designDecisions = await InclusiveDesignCritiqueService.getDesignDecisions();
              
              // Use the unified method to create sticky notes
              await StickyNoteService.createStickyNotesFromPoints(
                "Thinking-Dialogue",
                processedPoints,
                'decision',
                designDecisions
              );
            } else {
              setRecordingError('No meaningful content detected in the recording. Please try again with more detailed speech.');
            }
            
            // Run inclusive design critique on the full transcript
            if (critiqueModeEnabled && mode === 'decision') {
              await InclusiveDesignCritiqueService.analyzeAndCritique(transcriptionResult.transcription);
            }
            
            console.log('Recording processed:', processedPoints);
          } else {
            setRecordingError('Could not transcribe audio. Please try speaking more clearly or check your microphone.');
          }
        } catch (error) {
          console.error('Failed to process recording:', error);
          setRecordingError('Failed to process recording. Please try again.');
        }
      } else {
        console.error('No audio data received or empty audio blob');
        setRecordingError('No audio was recorded. Please try again and make sure your microphone is working.');
      }
      
      setProcessingRecording(false);
    } catch (error) {
      console.error('Failed to stop recording:', error);
      setProcessingRecording(false);
      setRecordingError('Failed to complete the recording process. Please try again.');
    }
  };

  // Format seconds to MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="voice-recorder" style={{ width: '100%' }}>
      <button
        onClick={isRecording ? handleStopRecording : handleStartRecording}
        disabled={processingRecording}
        className={`button ${isRecording ? 'button-danger' : 'button-primary'}`}
        style={{ 
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: '8px',
          width: '100%',
          padding: '8px 10px',
          borderRadius: '6px',
          border: 'none',
          backgroundColor: isRecording ? '#e74c3c' : '#4299e1',
          color: 'white',
          fontWeight: 600,
          fontSize: '14px',
          cursor: processingRecording ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s ease',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          marginBottom: (mode === 'decision' || recordingError) ? '10px' : '0'
        }}
      >
        {processingRecording ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              display: 'inline-block',
              width: '14px',
              height: '14px',
              minWidth: '14px',
              borderRadius: '50%',
              border: '2px solid rgba(255,255,255,0.3)',
              borderTop: '2px solid #fff',
              animation: 'spin 1s linear infinite'
            }}></span>
            Processing...
          </div>
        ) : isRecording ? (
          <>
            <span style={{ 
              display: 'inline-block',
              width: '14px',
              height: '14px',
              minWidth: '14px',
              backgroundColor: '#fff',
              borderRadius: '50%',
              animation: 'pulse 1.5s infinite'
            }}></span>
            Stop ({formatTime(recordingDuration)})
          </>
        ) : (
          <>
            <span style={{ 
              display: 'inline-block',
              width: '14px',
              height: '14px',
              minWidth: '14px',
              backgroundColor: '#fff',
              borderRadius: '50%'
            }}></span>
            {mode === 'decision' ? 'Record Design Thoughts' : 'Record Response'}
          </>
        )}
      </button>
      
      {/* Error message */}
      {recordingError && (
        <div style={{
          padding: '8px 12px',
          backgroundColor: '#FEECF0',
          color: '#CC0F35',
          borderRadius: '4px',
          fontSize: '14px',
          marginBottom: '10px',
          borderLeft: '3px solid #CC0F35'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>⚠️</span>
            <span>{recordingError}</span>
          </div>
        </div>
      )}
        
      {mode === 'decision' && (
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          padding: '8px 10px',
          backgroundColor: 'white',
          borderRadius: '8px',
          border: '1px solid #e6e6e6'
        }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ 
              fontSize: '13px',
              color: '#555',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <span style={{ 
                color: critiqueModeEnabled ? '#9b59b6' : '#7f8c8d',
                fontSize: '15px'
              }}>🔍</span>
              Real-time design critique
            </span>
          </div>
          <label className="toggle-switch" style={{ 
            position: 'relative', 
            display: 'inline-block', 
            width: '45px', 
            height: '22px',
            flexShrink: 0
          }}>
            <input 
              type="checkbox" 
              checked={critiqueModeEnabled}
              onChange={handleToggleCritiqueMode}
              style={{ opacity: 0, width: 0, height: 0 }}
            />
            <span style={{
              position: 'absolute',
              cursor: 'pointer',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: critiqueModeEnabled ? '#9b59b6' : '#e0e0e0',
              transition: '0.3s',
              borderRadius: '22px',
              boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)'
            }}>
              <span style={{
                position: 'absolute',
                content: '""',
                height: '18px',
                width: '18px',
                left: critiqueModeEnabled ? '23px' : '2px',
                bottom: '2px',
                backgroundColor: 'white',
                transition: '0.3s',
                borderRadius: '50%',
                boxShadow: '0 1px 2px rgba(0,0,0,0.15)'
              }}></span>
            </span>
          </label>
        </div>
      )}

      <style jsx>{`
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.4; }
          100% { opacity: 1; }
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}; 