'use client';
import React, { useState, useEffect } from 'react';
import { VoiceRecordingService } from '../services/voiceRecordingService';

interface VoiceRecorderProps {
  mode: 'decision' | 'response';  // Mode of recording: design decision or response
  onNewPoints: (points: string[]) => void;  // Callback when new points are processed
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ mode, onNewPoints }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [processingRecording, setProcessingRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [timer, setTimer] = useState<NodeJS.Timeout | null>(null);

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

  const handleStartRecording = async () => {
    try {
      setIsRecording(true);
      setRecordingDuration(0);
      await VoiceRecordingService.startRecording(onNewPoints);
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
      
      // Process the recording
      const result = await VoiceRecordingService.processRecording(audioBlob);
      console.log('Recording processed:', result);
      
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