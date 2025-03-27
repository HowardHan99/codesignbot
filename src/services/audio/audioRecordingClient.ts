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
  private static mimeType: string = 'audio/webm'; // Default MIME type
  
  /**
   * Get supported MIME type for audio recording
   * @returns The best supported MIME type
   */
  private static getSupportedMimeType(): string {
    // List of MIME types to try, in order of preference
    const mimeTypes = [
      'audio/webm;codecs=opus',
      'audio/mp4',
      'audio/ogg;codecs=opus',
      'audio/webm',
      'audio/ogg'
    ];
    
    // Check which MIME types are supported
    for (const type of mimeTypes) {
      if (MediaRecorder.isTypeSupported(type)) {
        console.log(`Using supported MIME type: ${type}`);
        return type;
      }
    }
    
    // Fallback to default
    console.warn('No preferred MIME types supported, using default');
    return 'audio/webm';
  }
  
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
      console.log(`Requesting microphone access...`);
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      this.audioStream = stream;
      
      // Get supported MIME type
      this.mimeType = this.getSupportedMimeType();
      
      // Create media recorder with supported MIME type
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: this.mimeType
      });
      
      // Start recording with chunks
      const chunkInterval = options.chunkInterval || this.DEFAULT_CHUNK_INTERVAL;
      console.log(`Started recording with ${chunkInterval/1000}s chunks`);
      
      // Set up data handler
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
          console.log(`📊 Recording chunk captured: ${(event.data.size/1024).toFixed(1)}KB`);
          if (options.onDataAvailable) {
            options.onDataAvailable(event.data);
          }
        }
      };
      
      // Start recording with chunks
      this.mediaRecorder.start(chunkInterval);
      
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
        // Use the actual MIME type that was used for recording
        const audioBlob = new Blob(this.audioChunks, { type: this.mimeType });
        if (closeStream) {
          this.cleanupResources();
        }
        console.log(`Recording stopped, final size: ${(audioBlob.size/1024).toFixed(1)}KB`);
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
    
    console.log(`Starting chunk processing every ${intervalMs/1000}s`);
    this.processingInterval = setInterval(async () => {
      if (this.audioChunks.length > 0) {
        console.log(`Processing ${this.audioChunks.length} audio chunks...`);
        const currentChunks = [...this.audioChunks];
        this.audioChunks = []; // Clear for new chunks
        try {
          await processingFunction(currentChunks);
        } catch (error) {
          console.error('Error processing audio chunks:', error);
        }
      }
    }, intervalMs);
  }
  
  /**
   * Stop the processing interval
   */
  public static stopProcessingInterval(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      console.log('Audio processing stopped');
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
        
        // Get the extension based on MIME type
        const fileExtension = this.getFileExtensionFromMimeType(audioBlob.type);
        const fileName = `audio.${fileExtension}`;
        
        const file = new File([audioBlob], fileName, { 
          type: audioBlob.type || this.mimeType 
        });
        formData.append('audio', file);
        
        console.log(`Sending ${(audioBlob.size/1024).toFixed(1)}KB audio for transcription...`);
        
        const response = await fetch('/api/transcribe', {
          method: 'POST',
          body: formData
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Transcription failed: ${response.status} ${response.statusText} - ${errorText}`);
        }
        
        const result = await response.json();
        console.log(`✅ Transcription received: ${result.transcription.length} characters`);
        
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
  
  /**
   * Get file extension from MIME type
   */
  private static getFileExtensionFromMimeType(mimeType: string): string {
    switch (mimeType) {
      case 'audio/mp4':
        return 'mp4';
      case 'audio/mp3':
        return 'mp3';
      case 'audio/mpeg':
        return 'mp3';
      case 'audio/ogg':
      case 'audio/ogg;codecs=opus':
        return 'ogg';
      case 'audio/wav':
        return 'wav';
      case 'audio/webm':
      case 'audio/webm;codecs=opus':
      default:
        return 'webm';
    }
  }
} 