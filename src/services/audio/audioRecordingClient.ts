/**
 * Centralized client for audio recording operations with error handling and stream management
 */
export class AudioRecordingClient {
  private static mediaRecorder: MediaRecorder | null = null;
  private static audioChunks: Blob[] = [];
  private static audioStream: MediaStream | null = null;
  private static processingInterval: NodeJS.Timeout | null = null;
  private static readonly DEFAULT_CHUNK_INTERVAL = 30000; // 30 seconds
  private static readonly MAX_RETRIES = 3;
  
  /**
   * Initialize and start recording
   * @param options Recording options
   * @returns Promise resolving to the started stream
   */
  public static async startRecording(options: {
    chunkInterval?: number;
    onDataAvailable?: (chunk: Blob) => void;
  } = {}): Promise<MediaStream> {
    try {
      // Clean up existing recording if there is one
      await this.stopRecording(false);
      
      // Reset internal state
      this.audioChunks = [];
      
      // Request user media
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioStream = stream;
      
      // Create media recorder
      this.mediaRecorder = new MediaRecorder(stream);
      
      // Set up data handler
      this.mediaRecorder.ondataavailable = (event) => {
        this.audioChunks.push(event.data);
        if (options.onDataAvailable) {
          options.onDataAvailable(event.data);
        }
      };
      
      // Start recording with chunks
      const chunkInterval = options.chunkInterval || this.DEFAULT_CHUNK_INTERVAL;
      this.mediaRecorder.start(chunkInterval);
      
      console.log('Audio recording started');
      return stream;
    } catch (error) {
      console.error('Error starting audio recording:', error);
      this.cleanupResources();
      throw error;
    }
  }
  
  /**
   * Stop recording and return the recorded audio
   * @param closeStream Whether to close the stream (true by default)
   * @returns Promise resolving to the recorded audio blob
   */
  public static async stopRecording(closeStream: boolean = true): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        this.cleanupResources();
        resolve(null);
        return;
      }
      
      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        if (closeStream) {
          this.cleanupResources();
        }
        console.log('Audio recording stopped, size:', audioBlob.size);
        resolve(audioBlob);
      };
      
      this.mediaRecorder.stop();
      
      if (closeStream && this.audioStream) {
        this.audioStream.getTracks().forEach(track => track.stop());
      }
    });
  }
  
  /**
   * Check if recording is currently active
   */
  public static isRecording(): boolean {
    return !!this.mediaRecorder && this.mediaRecorder.state === 'recording';
  }
  
  /**
   * Start an interval that processes audio chunks
   * @param processingFunction Function to call with chunks
   * @param intervalMs Interval between processing in milliseconds
   */
  public static startProcessingInterval(
    processingFunction: (chunks: Blob[]) => Promise<void>,
    intervalMs: number = this.DEFAULT_CHUNK_INTERVAL
  ): void {
    // Clear any existing interval
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }
    
    this.processingInterval = setInterval(async () => {
      if (this.audioChunks.length > 0) {
        const currentChunks = [...this.audioChunks];
        this.audioChunks = []; // Clear for new chunks
        try {
          await processingFunction(currentChunks);
        } catch (error) {
          console.error('Error processing audio chunks:', error);
        }
      }
    }, intervalMs);
    
    console.log(`Audio processing interval started: ${intervalMs}ms`);
  }
  
  /**
   * Stop the processing interval
   */
  public static stopProcessingInterval(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      console.log('Audio processing interval stopped');
    }
  }
  
  /**
   * Clean up all resources
   */
  private static cleanupResources(): void {
    this.stopProcessingInterval();
    
    if (this.audioStream) {
      this.audioStream.getTracks().forEach(track => track.stop());
      this.audioStream = null;
    }
    
    this.mediaRecorder = null;
    this.audioChunks = [];
  }
  
  /**
   * Send audio data to the transcription API
   * @param audioBlob The audio blob to transcribe
   * @returns The transcription result
   */
  public static async transcribeAudio(audioBlob: Blob): Promise<{
    transcription: string;
    duration: number;
  }> {
    let attempts = 0;
    
    while (attempts < this.MAX_RETRIES) {
      try {
        const formData = new FormData();
        const file = new File([audioBlob], 'audio.webm', { 
          type: audioBlob.type || 'audio/webm' 
        });
        formData.append('audio', file);
        
        console.log(`Sending audio to transcription API (${audioBlob.size} bytes)`);
        
        const response = await fetch('/api/transcribe', {
          method: 'POST',
          body: formData
        });
        
        if (!response.ok) {
          throw new Error(`Transcription failed: ${response.statusText}`);
        }
        
        const result = await response.json();
        console.log(`Transcription successful: ${result.transcription.length} chars`);
        
        return result;
      } catch (error) {
        attempts++;
        console.error(`Transcription attempt ${attempts} failed:`, error);
        
        if (attempts >= this.MAX_RETRIES) {
          throw error;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
      }
    }
    
    throw new Error('Transcription failed after multiple attempts');
  }
} 