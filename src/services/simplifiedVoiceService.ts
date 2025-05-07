/**
 * SimplifiedVoiceService
 * A streamlined service for voice recording and transcription.
 * Connects the recorder with the transcription service.
 */
import { SimpleAudioRecorder, AudioRecorderChunk } from './audio/simpleAudioRecorder';
import { VoiceRecordingTranscriptionService, TranscriptionResult } from './voiceRecordingTranscription';
import { Logger } from '../utils/logger';

// Log context for this module
const LOG_CONTEXT = 'VOICE-SERVICE';

// Status/progress type
export interface RecordingStatus {
  isRecording: boolean;
  isProcessing: boolean;
  progress: number;
  error?: string;
}

export class SimplifiedVoiceService {
  private static status: RecordingStatus = {
    isRecording: false,
    isProcessing: false,
    progress: 0,
  };
  
  private static transcriptionCallback: ((text: string) => void) | null = null;
  private static errorCallback: ((error: string) => void) | null = null;
  
  /**
   * Start recording with progressive transcription.
   * @param options Configuration options
   * @returns Promise that resolves when recording starts
   */
  public static async startRecording(options: {
    onTranscription?: (text: string) => void;
    onError?: (error: string) => void;
    chunkInterval?: number; // In milliseconds
  } = {}): Promise<boolean> {
    if (this.status.isRecording) {
      Logger.warn(LOG_CONTEXT, 'Recording already in progress');
      return false;
    }
    
    try {
      // Store callbacks
      this.transcriptionCallback = options.onTranscription || null;
      this.errorCallback = options.onError || null;
      
      // Reset status
      this.status = {
        isRecording: true,
        isProcessing: false,
        progress: 0,
      };
      
      // Configure chunk interval (default 20 seconds)
      const chunkInterval = options.chunkInterval || 10000;
      Logger.log(LOG_CONTEXT, `Starting recording with ${chunkInterval/1000}s chunks`);
      
      // Start recording with our Audio Recorder
      await SimpleAudioRecorder.startRecording({
        chunkInterval,
        onChunk: this.handleAudioChunk.bind(this)
      });
      
      Logger.log(LOG_CONTEXT, 'Voice recording started successfully');
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error starting recording';
      Logger.error(LOG_CONTEXT, 'Failed to start recording:', error);
      
      // Update status and notify of error
      this.status = { isRecording: false, isProcessing: false, progress: 0, error: errorMessage };
      if (this.errorCallback) {
        this.errorCallback(errorMessage);
      }
      
      return false;
    }
  }
  
  /**
   * Handle each audio chunk as it becomes available
   * @param chunk The audio chunk to process
   */
  private static async handleAudioChunk(chunk: AudioRecorderChunk): Promise<void> {
    if (!this.status.isRecording || !chunk.blob || chunk.blob.size < 1000) {
      return; // Skip if we're not recording or chunk is too small
    }
    
    Logger.log(LOG_CONTEXT, `Processing audio chunk of ${(chunk.blob.size/1024).toFixed(1)}KB`);
    
    try {
      // Mark as processing
      this.status.isProcessing = true;
      
      // Transcribe this chunk
      const result = await VoiceRecordingTranscriptionService.transcribeAudio(chunk.blob);
      
      // Update status
      this.status.isProcessing = false;
      this.status.progress = Math.min(this.status.progress + 10, 90); // Cap at 90%, reserve 100% for completion
      
      // Handle result
      if (result.error) {
        Logger.warn(LOG_CONTEXT, `Chunk transcription error: ${result.error}`);
        if (this.errorCallback) {
          this.errorCallback(`Error processing speech: ${result.error}`);
        }
      } else if (result.text && this.transcriptionCallback) {
        // Only call back if we have text and a callback
        Logger.log(LOG_CONTEXT, `Transcription successful: ${result.text.length} chars`);
        this.transcriptionCallback(result.text);
      }
    } catch (error) {
      // Handle errors during chunk processing
      const errorMessage = error instanceof Error ? error.message : 'Unknown error processing audio';
      Logger.error(LOG_CONTEXT, 'Error processing audio chunk:', error);
      
      this.status.isProcessing = false;
      if (this.errorCallback) {
        this.errorCallback(errorMessage);
      }
    }
  }
  
  /**
   * Stop recording and get the final transcription.
   * @returns Promise resolving to the final transcription result
   */
  public static async stopRecording(): Promise<TranscriptionResult> {
    if (!this.status.isRecording) {
      Logger.warn(LOG_CONTEXT, 'No recording in progress to stop');
      return { text: '', error: 'No recording in progress' };
    }
    
    Logger.log(LOG_CONTEXT, 'Stopping recording...');
    
    try {
      // Update status
      this.status.isProcessing = true;
      
      // Stop the recorder and get the final audio
      const finalAudio = await SimpleAudioRecorder.stopRecording();
      
      // Check if we got audio
      if (!finalAudio || finalAudio.size < 1000) {
        Logger.warn(LOG_CONTEXT, 'No valid audio captured during recording');
        
        // Reset status
        this.resetStatus('No audio captured');
        return { text: '', error: 'No audio captured during recording' };
      }
      
      Logger.log(LOG_CONTEXT, `Transcribing final audio: ${(finalAudio.size/1024).toFixed(1)}KB`);
      
      // Transcribe the final audio
      const result = await VoiceRecordingTranscriptionService.transcribeAudio(finalAudio);
      
      // Reset status
      this.resetStatus();
      
      // Update progress to 100% on success
      if (!result.error) {
        this.status.progress = 100;
      }
      
      Logger.log(LOG_CONTEXT, 'Recording and transcription complete');
      return result;
    } catch (error) {
      // Handle errors during stop/transcription
      const errorMessage = error instanceof Error ? error.message : 'Unknown error stopping recording';
      Logger.error(LOG_CONTEXT, 'Error stopping recording:', error);
      
      // Reset status with error
      this.resetStatus(errorMessage);
      
      return { text: '', error: errorMessage };
    }
  }
  
  /**
   * Get current recording status
   */
  public static getStatus(): RecordingStatus {
    return { ...this.status };
  }
  
  /**
   * Reset the status to idle
   */
  private static resetStatus(error?: string): void {
    this.status = {
      isRecording: false,
      isProcessing: false,
      progress: error ? 0 : 100, // 0% on error, 100% on success
      error: error,
    };
    
    // Clear callbacks
    this.transcriptionCallback = null;
    this.errorCallback = null;
  }
  
  /**
   * Cancel ongoing recording
   */
  public static async cancelRecording(): Promise<void> {
    if (!this.status.isRecording) {
      return;
    }
    
    try {
      await SimpleAudioRecorder.stopRecording();
      this.resetStatus('Recording cancelled');
      Logger.log(LOG_CONTEXT, 'Recording cancelled');
    } catch (error) {
      Logger.error(LOG_CONTEXT, 'Error cancelling recording:', error);
    }
  }
} 