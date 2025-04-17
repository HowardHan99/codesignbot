/**
 * VoiceRecorder Component
 * Uses the simplified voice recording and transcription services.
 */
'use client';
import React, { useState, useEffect } from 'react';
// Import the NEW simplified service
import { SimplifiedVoiceService, RecordingStatus } from '../services/simplifiedVoiceService'; 
import { TranscriptProcessingService } from '../services/transcriptProcessingService';
import { StickyNoteService } from '../services/miro/stickyNoteService';
import { InclusiveDesignCritiqueService } from '../services/inclusiveDesignCritiqueService';
import { Logger } from '../utils/logger';

// Log context for this module
const LOG_CONTEXT = 'VOICE-UI';

interface VoiceRecorderProps {
  mode: 'decision' | 'response';
  onNewPoints: (points: string[]) => void;
  enableRealTimeCritique?: boolean;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
  mode,
  onNewPoints,
  enableRealTimeCritique = true
}) => {
  // UI state based on SimplifiedVoiceService status
  const [currentStatus, setCurrentStatus] = useState<RecordingStatus>(SimplifiedVoiceService.getStatus());
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [critiqueModeEnabled, setCritiqueModeEnabled] = useState(enableRealTimeCritique);
  
  // Timer for duration display
  const [durationTimer, setDurationTimer] = useState<NodeJS.Timeout | null>(null);
  
  // Check for browser compatibility
  useEffect(() => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCurrentStatus(prev => ({ ...prev, error: 'Browser does not support voice recording.' }));
    }
  }, []);
  
  // Cleanup timer and cancel recording on unmount
  useEffect(() => {
    // This cleanup function should ONLY run when the component unmounts
    return () => {
      if (durationTimer) clearInterval(durationTimer);
      Logger.log(LOG_CONTEXT, 'Component unmounting, cancelling recording if active.');
      SimplifiedVoiceService.cancelRecording(); // Ensure recording stops if component unmounts
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // <-- EMPTY dependency array means this runs cleanup only on unmount
  
  // Update duration timer based on recording status
  useEffect(() => {
    if (currentStatus.isRecording) {
      const timer = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
      setDurationTimer(timer);
    } else {
      if (durationTimer) {
        clearInterval(durationTimer);
        setDurationTimer(null);
      }
      if (!currentStatus.isProcessing) {
        setRecordingDuration(0); // Reset duration when not recording or processing
      }
    }
  }, [currentStatus.isRecording, currentStatus.isProcessing]);
  
  /**
   * Handler for chunks of transcribed speech received from the service.
   */
  const handleTranscriptionChunk = async (transcription: string) => {
    if (!transcription || transcription.trim().length === 0) {
      Logger.warn(LOG_CONTEXT, 'Empty transcription chunk received');
      return;
    }

    Logger.log(LOG_CONTEXT, `Transcription chunk received (${transcription.length} chars)`);
    setCurrentStatus(prev => ({ ...prev, error: undefined })); // Clear previous errors
    
    try {
      // Forward the raw transcription text (or process further if needed)
      onNewPoints([transcription]); 
      
      // Process chunk into structured points for sticky notes
      Logger.log(LOG_CONTEXT, 'Processing chunk transcript...');
      const processedPoints = await TranscriptProcessingService.processTranscript(transcription);
      Logger.log(LOG_CONTEXT, `Processed chunk into ${processedPoints.length} points`);
      
      if (processedPoints.length > 0) {
        const designDecisions = await InclusiveDesignCritiqueService.getDesignDecisions();
        Logger.log(LOG_CONTEXT, `Creating ${processedPoints.length} sticky notes (chunk)...`);
        await StickyNoteService.createStickyNotesFromPoints(
          "Thinking-Dialogue",
          processedPoints,
          mode, // Use the mode prop passed to the component
          designDecisions
        );
        
        // Run critique if enabled
        if (critiqueModeEnabled && mode === 'decision') {
          Logger.log(LOG_CONTEXT, 'Running critique on chunk...');
          InclusiveDesignCritiqueService.analyzeAndCritique(transcription)
            .catch(err => Logger.error(LOG_CONTEXT, 'Chunk critique error:', err));
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error processing chunk';
      Logger.error(LOG_CONTEXT, 'Error processing transcription chunk:', error);
      setCurrentStatus(prev => ({ ...prev, error: message }));
    }
  };
  
  /**
   * Error handling callback from the service.
   */
  const handleRecordingError = (error: string) => {
    Logger.error(LOG_CONTEXT, `Recording service error: ${error}`);
    // Update status directly to show the error
    setCurrentStatus(prev => ({ 
        ...prev, 
        isRecording: false, // Assume recording stopped on error
        isProcessing: false,
        error: error 
    }));
  };
  
  /**
   * Start recording using SimplifiedVoiceService.
   */
  const handleStartRecording = async () => {
    Logger.log(LOG_CONTEXT, 'Start button clicked');
    // Reset status before starting
    setCurrentStatus({ isRecording: false, isProcessing: true, progress: 0, error: undefined }); 
    setRecordingDuration(0);
    
    try {
      const success = await SimplifiedVoiceService.startRecording({
        onTranscription: handleTranscriptionChunk,
        onError: handleRecordingError,
        chunkInterval: 20000 // e.g., 20 second chunks
      });
      
      if (success) {
        setCurrentStatus(prev => ({ ...prev, isRecording: true, isProcessing: false }));
        Logger.log(LOG_CONTEXT, 'Recording started via service');
      } else {
        // Error should have been set by handleRecordingError callback
        setCurrentStatus(prev => ({ ...prev, isRecording: false, isProcessing: false, error: prev.error || 'Failed to start' }));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error starting recording';
      handleRecordingError(message); // Use the error handler
      Logger.error(LOG_CONTEXT, 'Catch block error starting recording:', error);
    }
  };
  
  /**
   * Stop recording using SimplifiedVoiceService and process the final result.
   */
  const handleStopRecording = async () => {
    Logger.log(LOG_CONTEXT, 'Stop button clicked');
    setCurrentStatus(prev => ({ ...prev, isRecording: false, isProcessing: true })); // Show processing state
    
    try {
      // Stop recording & get final transcription result (text or error)
      const result = await SimplifiedVoiceService.stopRecording();
      
      if (result.error) {
        handleRecordingError(result.error);
        Logger.error(LOG_CONTEXT, `Error in final transcription from service: ${result.error}`);
      } else if (!result.text || result.text.trim().length === 0) {
        handleRecordingError('No speech detected in the final recording');
        Logger.warn(LOG_CONTEXT, 'Empty final transcription received');
      } else {
        // Process the FULL final transcription
        Logger.log(LOG_CONTEXT, `Processing final transcription (${result.text.length} chars)...`);
        const processedPoints = await TranscriptProcessingService.processTranscript(result.text);
        
        if (processedPoints.length === 0) {
          handleRecordingError('No meaningful content detected in your speech');
          Logger.warn(LOG_CONTEXT, 'Final transcript processing yielded no points');
        } else {
          // SUCCESS - Forward points and create stickies
          onNewPoints(processedPoints.map(p => p.proposal));
          const designDecisions = await InclusiveDesignCritiqueService.getDesignDecisions();
          Logger.log(LOG_CONTEXT, `Creating ${processedPoints.length} sticky notes (final)...`);
          await StickyNoteService.createStickyNotesFromPoints(
            "Thinking-Dialogue",
            processedPoints,
            mode, // Use the mode prop
            designDecisions
          );
          
          // Run final critique if needed
          if (critiqueModeEnabled && mode === 'decision') {
            Logger.log(LOG_CONTEXT, 'Running final critique...');
            InclusiveDesignCritiqueService.analyzeAndCritique(result.text)
              .catch(err => Logger.error(LOG_CONTEXT, 'Final critique error:', err));
          }
          
          // Clear error on final success
          setCurrentStatus(prev => ({ ...prev, error: undefined, progress: 100 })); 
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error processing final recording';
      handleRecordingError(message);
      Logger.error(LOG_CONTEXT, 'Catch block error stopping/processing final recording:', error);
    } finally {
      // Ensure processing state is turned off
      setCurrentStatus(prev => ({ ...prev, isProcessing: false, isRecording: false })); 
    }
  };
  
  /** Toggle critique mode */
  const handleToggleCritiqueMode = () => {
    setCritiqueModeEnabled(prev => !prev);
  };
  
  // Format seconds to MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Determine button states from service status
  const isRecording = currentStatus.isRecording;
  const isProcessing = currentStatus.isProcessing;
  const errorMessage = currentStatus.error;

  return (
    <div className="voice-recorder" style={{ width: '100%' }}>
      {/* Main recording button */}
      <button
        onClick={isRecording ? handleStopRecording : handleStartRecording}
        disabled={isProcessing} // Disable only when actively processing the final blob
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
          backgroundColor: isRecording ? '#e74c3c' : (isProcessing ? '#cccccc' : '#4299e1'), // Grey out when processing
          color: 'white',
          fontWeight: 600,
          fontSize: '14px',
          cursor: isProcessing ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s ease',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          marginBottom: (mode === 'decision' || errorMessage) ? '10px' : '0'
        }}
      >
        {isProcessing ? (
          // Processing state UI
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
          // Recording state UI
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
          // Idle state UI
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
      
      {/* Error message display */}
      {errorMessage && (
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
            <span>{errorMessage}</span>
          </div>
        </div>
      )}
      
      {/* Critique mode toggle (UI remains the same) */}
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
              borderRadius: '34px',
              transition: '0.3s',
            }}>
              <div style={{
                position: 'absolute',
                content: '',
                height: '18px',
                width: '18px',
                left: critiqueModeEnabled ? '24px' : '2px',
                bottom: '2px',
                backgroundColor: 'white',
                borderRadius: '50%',
                transition: '0.3s',
              }} />
            </span>
          </label>
        </div>
      )}
    </div>
  );
}; 