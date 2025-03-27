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
  private static recordingInterval: number = 20000; // 20 seconds
  
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
    this.recordingInterval = customInterval || 20000;
    
    console.log(`Recording started with ${this.recordingInterval/1000}s chunks`);
    
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
          // Instead of using handleAudioChunk, just let AudioRecordingClient handle the chunks
          // They will be processed in the interval anyway
          onDataAvailable: (chunk) => {
            console.log(`Audio chunk received: ${chunk.size} bytes`);
            // No action needed here - chunks are stored internally in AudioRecordingClient
          }
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
   * Update processing status
   * @param update Partial update to the status
   */
  private static updateStatus(update: Partial<ProcessingStatus>): void {
    this.processingStatus = {
      ...this.processingStatus,
      ...update
    };
  }
  
  /**
   * Update the progress value
   * @param progress New progress value
   */
  private static updateProgress(progress: number): void {
    this.updateStatus({
      progress: Math.min(Math.max(0, progress), 100)
    });
  }
  
  /**
   * Process audio chunks for transcription
   */
  private static async processAudioChunks(chunks: Blob[]): Promise<void> {
    console.log(`Processing ${chunks.length} audio chunks`);
    
    if (chunks.length === 0 || this.processingStatus.shouldStop) {
      return;
    }
    
    try {
      // Create a single blob from all chunks
      const audioBlob = new Blob(chunks, { type: 'audio/webm' });
      
      // Transcribe the audio
      const result = await AudioRecordingClient.transcribeAudio(audioBlob);
      
      // Process the transcription if we have a callback
      if (this.chunkProcessingCallback && result.transcription) {
        console.log(`🎤 Transcription chunk received (${result.transcription.length} chars)`);
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
    console.log(`Stopping recording`);
    
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
   * Get current processing status
   */
  public static getStatus(): ProcessingStatus {
    return { ...this.processingStatus };
  }
} 