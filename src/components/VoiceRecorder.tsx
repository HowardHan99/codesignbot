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
  const [critiqueModeEnabled, setCritiqueModeEnabled] = useState<boolean>(enableRealTimeCritique);
  
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
    // Convert single transcription string to array with one item 
    // for compatibility with onNewPoints
    if (transcription && transcription.trim()) {
      // Forward the transcription to the parent component
      onNewPoints([transcription]);
      
      // Only check for critiques in decision mode and if enabled
      if (critiqueModeEnabled && mode === 'decision') {
        await checkForInclusiveDesignCritiques(transcription);
      }
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
          if (critiqueModeEnabled && mode === 'decision') {
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
    <div className="voice-recorder">
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '12px',
        marginBottom: '16px',
        backgroundColor: '#f8f9fa',
        borderRadius: '8px',
        padding: '12px'
      }}>
        <button
          onClick={isRecording ? handleStopRecording : handleStartRecording}
          disabled={processingRecording}
          className={`button ${isRecording ? 'button-danger' : 'button-primary'}`}
          style={{ 
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            width: '100%',
            padding: '12px',
            borderRadius: '6px',
            border: 'none',
            background: isRecording ? '#e74c3c' : '#3498db',
            color: 'white',
            fontWeight: 600,
            cursor: processingRecording ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}
        >
          {processingRecording ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                display: 'inline-block',
                width: '14px',
                height: '14px',
                borderRadius: '50%',
                border: '2px solid #f3f3f3',
                borderTop: '2px solid #3498db',
                animation: 'spin 1s linear infinite'
              }}></span>
              Processing recording...
            </div>
          ) : isRecording ? (
            <>
              <span style={{ 
                display: 'inline-block',
                width: '14px',
                height: '14px',
                backgroundColor: '#fff',
                borderRadius: '50%',
                animation: 'pulse 1.5s infinite'
              }}></span>
              Stop Recording ({formatTime(recordingDuration)})
            </>
          ) : (
            <>
              <span style={{ 
                display: 'inline-block',
                width: '14px',
                height: '14px',
                backgroundColor: '#fff',
                borderRadius: '50%'
              }}></span>
              {mode === 'decision' ? 'Record Design Thoughts' : 'Record Response'}
            </>
          )}
        </button>
        
        {mode === 'decision' && (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            padding: '8px 12px',
            backgroundColor: 'white',
            borderRadius: '6px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ 
                fontSize: '14px',
                color: '#555',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <span style={{ 
                  color: critiqueModeEnabled ? '#9b59b6' : '#7f8c8d',
                  fontSize: '16px'
                }}>🔍</span>
                Real-time design critique
              </span>
            </div>
            <label className="toggle-switch" style={{ position: 'relative', display: 'inline-block', width: '46px', height: '24px' }}>
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
                backgroundColor: critiqueModeEnabled ? '#9b59b6' : '#ccc',
                transition: '0.4s',
                borderRadius: '24px',
              }}>
                <span style={{
                  position: 'absolute',
                  content: '""',
                  height: '18px',
                  width: '18px',
                  left: critiqueModeEnabled ? '24px' : '3px',
                  bottom: '3px',
                  backgroundColor: 'white',
                  transition: '0.4s',
                  borderRadius: '50%',
                }}></span>
              </span>
            </label>
          </div>
        )}
      </div>

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