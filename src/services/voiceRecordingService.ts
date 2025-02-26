import { ProcessingStatus } from '../types/common';
import { AudioRecordingClient } from './audio/audioRecordingClient';
import { safeApiCall } from '../utils/errorHandlingUtils';
import { TranscriptProcessingService } from './transcriptProcessingService';

/**
 * Service that handles voice recording state management and UI interactions
 */
export class VoiceRecordingService {
  private static processingStatus: ProcessingStatus = {
    isProcessing: false,
    progress: 0,
    fileName: null,
    shouldStop: false
  };
  
  private static chunkProcessingCallback: ((transcription: string) => void) | null = null;
  private static recordingInterval: number = 30000; // 30 seconds
  
  /**
   * Start recording with progressive processing
   * @param onTranscriptionChunk Optional callback for transcription chunks
   * @param customInterval Optional custom interval for chunking in ms
   * @returns Promise that resolves when recording starts
   */
  public static async startRecording(
    onTranscriptionChunk?: (transcription: string) => void,
    customInterval?: number
  ): Promise<boolean> {
    this.chunkProcessingCallback = onTranscriptionChunk || null;
    this.recordingInterval = customInterval || 30000;
    
    // Update status
    this.updateStatus({
      isProcessing: true,
      progress: 0,
      fileName: 'voice-recording.webm',
      shouldStop: false
    });
    
    // Use safe API call pattern for error handling
    const result = await safeApiCall<boolean>(
      async () => {
        // Start recording using our client
        await AudioRecordingClient.startRecording({
          chunkInterval: this.recordingInterval,
          onDataAvailable: this.handleAudioChunk.bind(this)
        });
        
        // Setup progressive processing if callback provided
        if (this.chunkProcessingCallback) {
          AudioRecordingClient.startProcessingInterval(
            this.processAudioChunks.bind(this),
            this.recordingInterval
          );
        }
        
        return true;
      },
      false,
      'Start Recording',
      { interval: this.recordingInterval }
    );
    
    // Update status if failed
    if (!result) {
      this.updateStatus({
        isProcessing: false,
        progress: 0,
        shouldStop: false
      });
    }
    
    return !!result;
  }
  
  /**
   * Handle new audio chunks as they become available
   */
  private static async handleAudioChunk(chunk: Blob): Promise<void> {
    if (this.processingStatus.shouldStop) {
      await this.stopRecording();
      return;
    }
    
    console.log(`Audio chunk received: ${chunk.size} bytes`);
  }
  
  /**
   * Process audio chunks for transcription
   */
  private static async processAudioChunks(chunks: Blob[]): Promise<void> {
    if (chunks.length === 0 || this.processingStatus.shouldStop) return;
    
    try {
      // Create a single blob from all chunks
      const audioBlob = new Blob(chunks, { type: 'audio/webm' });
      
      // Transcribe the audio
      const result = await AudioRecordingClient.transcribeAudio(audioBlob);
      
      // Process the transcription if we have a callback
      if (this.chunkProcessingCallback && result.transcription) {
        this.chunkProcessingCallback(result.transcription);
      }
      
      // Update progress
      this.updateProgress(this.processingStatus.progress + 10);
    } catch (error) {
      console.error('Error processing audio chunks:', error);
    }
  }
  
  /**
   * Stop recording and finalize
   * @returns Promise resolving to the final audio blob or null
   */
  public static async stopRecording(): Promise<Blob | null> {
    // Mark as stopping
    this.updateStatus({
      ...this.processingStatus,
      shouldStop: true
    });
    
    // Use safe API call pattern
    const finalAudio = await safeApiCall<Blob | null>(
      async () => {
        // Stop processing interval
        AudioRecordingClient.stopProcessingInterval();
        
        // Stop recording and get final audio
        const audioBlob = await AudioRecordingClient.stopRecording();
        
        return audioBlob;
      },
      null,
      'Stop Recording'
    );
    
    // Update status
    this.updateStatus({
      isProcessing: false,
      progress: 0,
      shouldStop: false
    });
    
    // Clear callback
    this.chunkProcessingCallback = null;
    
    return finalAudio;
  }
  
  /**
   * Check if recording is active
   */
  public static isRecording(): boolean {
    return AudioRecordingClient.isRecording();
  }
  
  /**
   * Update the processing status
   */
  private static updateStatus(newStatus: Partial<ProcessingStatus>): void {
    this.processingStatus = {
      ...this.processingStatus,
      ...newStatus
    };
  }
  
  /**
   * Update just the progress value
   */
  private static updateProgress(progress: number): void {
    this.processingStatus.progress = Math.min(100, Math.max(0, progress));
  }
  
  /**
   * Get the current processing status
   */
  public static getStatus(): ProcessingStatus {
    return {...this.processingStatus};
  }
  
  /**
   * Request to stop recording
   */
  public static requestStop(): void {
    this.processingStatus.shouldStop = true;
  }
} 