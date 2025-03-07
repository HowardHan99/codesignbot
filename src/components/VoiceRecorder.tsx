'use client';
import React, { useState, useEffect } from 'react';
import { VoiceRecordingService } from '../services/voiceRecordingService';
import { TranscriptProcessingService } from '../services/transcriptProcessingService';
import { ApiService } from '../services/apiService';
import { InclusiveDesignCritiqueService } from '../services/inclusiveDesignCritiqueService';

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
  
  // Track critiques to avoid duplicates
  const [recentCritiques, setRecentCritiques] = useState<Set<string>>(new Set());
  
  // Minimum time between critique checks to avoid overwhelming the API
  const CRITIQUE_INTERVAL_MS = 30000; // 30 seconds

  // Handle browser compatibility for getUserMedia
  useEffect(() => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.error('Browser does not support voice recording');
    }
  }, []);

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
    // Convert single transcription string to array with one item 
    // for compatibility with onNewPoints
    if (transcription && transcription.trim()) {
      // Forward the transcription to the parent component
      onNewPoints([transcription]);
      
      // Only check for critiques in decision mode and if enabled
      if (enableRealTimeCritique && mode === 'decision') {
        await checkForInclusiveDesignCritiques(transcription);
      }
    }
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
    try {
      setIsRecording(true);
      setRecordingDuration(0);
      await VoiceRecordingService.startRecording(handleTranscriptionChunk);
    } catch (error) {
      console.error('Failed to start recording:', error);
      setIsRecording(false);
    }
  };

  const handleStopRecording = async () => {
    try {
      setIsRecording(false);
      setProcessingRecording(true);
      
      const audioBlob = await VoiceRecordingService.stopRecording();
      
      // Process the recording if we have an audio blob
      if (audioBlob) {
        // First transcribe the audio blob to text
        const file = new File([audioBlob], 'recording.webm', { type: 'audio/webm' });
        const transcriptionResult = await ApiService.transcribeAudio(file);
        
        if (transcriptionResult && transcriptionResult.transcription) {
          // Process the transcription to extract points
          const processedPoints = await TranscriptProcessingService.processTranscript(
            transcriptionResult.transcription
          );
          
          // Pass the processed points to the callback
          if (processedPoints && processedPoints.length > 0) {
            onNewPoints(processedPoints.map(item => item.proposal));
          }
          
          // Run inclusive design critique on the full transcript
          if (enableRealTimeCritique && mode === 'decision') {
            await InclusiveDesignCritiqueService.analyzeAndCritique(transcriptionResult.transcription);
          }
          
          console.log('Recording processed:', processedPoints);
        }
      }
      
      setProcessingRecording(false);
    } catch (error) {
      console.error('Failed to stop recording:', error);
      setProcessingRecording(false);
    }
  };

  // Format seconds to MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="voice-recorder" style={{ marginBottom: '16px' }}>
      <button
        onClick={isRecording ? handleStopRecording : handleStartRecording}
        disabled={processingRecording}
        className={`button ${isRecording ? 'button-danger' : 'button-primary'}`}
        style={{ 
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          width: '100%'
        }}
      >
        {processingRecording ? (
          'Processing recording...'
        ) : isRecording ? (
          <>
            <span style={{ 
              display: 'inline-block',
              width: '10px',
              height: '10px',
              backgroundColor: '#ff4d4f',
              borderRadius: '50%',
              animation: 'pulse 1.5s infinite'
            }}></span>
            Stop Recording ({formatTime(recordingDuration)})
            {enableRealTimeCritique && mode === 'decision' && (
              <span style={{ 
                fontSize: '10px', 
                marginLeft: '8px',
                padding: '2px 6px',
                borderRadius: '10px',
                backgroundColor: 'rgba(0,0,0,0.1)'
              }}>
                Critique Active
              </span>
            )}
          </>
        ) : (
          <>
            <span style={{ 
              display: 'inline-block',
              width: '10px',
              height: '10px',
              backgroundColor: '#52c41a',
              borderRadius: '50%'
            }}></span>
            {mode === 'decision' ? 'Record Design Thoughts' : 'Record Response'}
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