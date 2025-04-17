/**
 * Centralized client for audio recording operations.
 * Focuses on recording standard WebM (Opus) format for Whisper compatibility.
 */
import { Logger } from '../../utils/logger';

export class AudioRecordingClient {
  private static mediaRecorder: MediaRecorder | null = null;
  private static audioChunks: Blob[] = [];
  private static audioStream: MediaStream | null = null;
  private static processingInterval: NodeJS.Timeout | null = null;
  private static readonly DEFAULT_CHUNK_INTERVAL = 30000; // 30 seconds

  // Holds the actual MIME type being used by the MediaRecorder
  public static actualMimeType: string = '';

  /**
   * Check if standard WebM (Opus) is supported.
   * @returns The preferred MIME type ('audio/webm') if supported, otherwise empty string.
   */
  private static getPreferredMimeType(): string {
    const preferredType = 'audio/webm'; // Standardize on webm (usually opus)
    const alternativeType = 'audio/webm;codecs=opus';

    if (MediaRecorder.isTypeSupported(preferredType)) {
      Logger.log('VR-CONFIG', `Preferred MIME type supported: ${preferredType}`);
      return preferredType;
    } else if (MediaRecorder.isTypeSupported(alternativeType)) {
      Logger.log('VR-CONFIG', `Alternative MIME type supported: ${alternativeType}`);
      return alternativeType;
    }
    Logger.warn('VR-CONFIG', 'Standard audio/webm MIME type not supported by this browser.');
    return ''; // Let the browser use its default if webm is not supported
  }

  /**
   * Initialize and start recording.
   * @param options Recording options
   * @returns Promise resolving to the started stream
   */
  public static async startRecording(options: {
    chunkInterval?: number;
    onDataAvailable?: (chunk: Blob) => void;
  } = {}): Promise<MediaStream> {
    try {
      await this.stopRecording(false); // Ensure clean state
      this.audioChunks = [];

      Logger.log('VR-SETUP', 'Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      this.audioStream = stream;

      const preferredMimeType = this.getPreferredMimeType();
      Logger.log('VR-SETUP', `Attempting to record using preferred MIME type: '${preferredMimeType || "browser default"}'`);

      const recorderOptions: MediaRecorderOptions = {};
      if (preferredMimeType) {
        recorderOptions.mimeType = preferredMimeType;
      }

      this.mediaRecorder = new MediaRecorder(stream, recorderOptions);
      // Store the *actual* MIME type the recorder is using
      this.actualMimeType = this.mediaRecorder.mimeType;
      Logger.log('VR-SETUP', `MediaRecorder initialized with actual MIME type: ${this.actualMimeType}`);

      const chunkInterval = options.chunkInterval || this.DEFAULT_CHUNK_INTERVAL;
      Logger.log('VR-SETUP', `Starting recording with ${chunkInterval / 1000}s chunks.`);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
          Logger.log('VR-CHUNK', `Chunk captured: ${(event.data.size / 1024).toFixed(1)}KB, Type: ${event.data.type}`);
          if (options.onDataAvailable) {
            options.onDataAvailable(event.data);
          }
        }
      };

      this.mediaRecorder.start(chunkInterval);
      return stream;
    } catch (error) {
      Logger.error('VR-SETUP', 'Error starting audio recording:', error);
      this.cleanupResources();
      throw error; // Re-throw error for caller to handle
    }
  }

  /**
   * Stop recording and return the recorded audio.
   * @param closeStream Whether to close the stream (true by default)
   * @returns Promise resolving to the recorded audio blob
   */
  public static async stopRecording(closeStream: boolean = true): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        if (closeStream) this.cleanupResources(); // Still cleanup if inactive and closing
        resolve(null);
        return;
      }

      this.mediaRecorder.onstop = () => {
        // Use the actual MIME type recorded
        const finalMimeType = this.actualMimeType;
        Logger.log('VR-STOP', `Constructing final Blob with actual recorder type: ${finalMimeType}`);
        const audioBlob = new Blob(this.audioChunks, { type: finalMimeType });

        if (closeStream) {
          this.cleanupResources();
        }
        Logger.log('VR-STOP', `Recording stopped. Final Blob: Size=${(audioBlob.size / 1024).toFixed(1)}KB, Type=${audioBlob.type}`);
        resolve(audioBlob);
      };

      // Ensure the last chunk is captured before stopping
      if (this.mediaRecorder.state === 'recording') {
        Logger.log('VR-STOP', 'Requesting final data chunk before stopping recorder.');
        this.mediaRecorder.requestData();
      }
      Logger.log('VR-STOP', 'Stopping media recorder...');
      this.mediaRecorder.stop();

      // Ensure stream tracks are stopped if closing
      if (closeStream && this.audioStream) {
        this.audioStream.getTracks().forEach(track => track.stop());
        this.audioStream = null;
        Logger.log('VR-STOP', 'Audio stream tracks stopped.');
      }
    });
  }

  /** Check if recording is currently active */
  public static isRecording(): boolean {
    return !!this.mediaRecorder && this.mediaRecorder.state === 'recording';
  }

  /**
   * Start an interval that periodically processes accumulated audio chunks.
   * @param processingFunction Function to call with chunks
   * @param intervalMs Interval in milliseconds
   */
  public static startProcessingInterval(
    processingFunction: (chunks: Blob[]) => Promise<void>,
    intervalMs: number = this.DEFAULT_CHUNK_INTERVAL
  ): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      Logger.log('VR-INTERVAL', 'Cleared previous processing interval.');
    }

    Logger.log('VR-INTERVAL', `Starting chunk processing interval: ${intervalMs / 1000}s`);
    this.processingInterval = setInterval(async () => {
      if (this.audioChunks.length > 0) {
        const chunksToProcess = [...this.audioChunks]; // Copy chunks for processing
        this.audioChunks = []; // Clear accumulator for next interval
        Logger.log('VR-INTERVAL', `Processing ${chunksToProcess.length} audio chunks from interval.`);
        try {
          await processingFunction(chunksToProcess);
        } catch (error) {
          Logger.error('VR-INTERVAL', 'Error calling processing function from interval:', error);
        }
      }
    }, intervalMs);
  }

  /** Stop the processing interval */
  public static stopProcessingInterval(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      Logger.log('VR-INTERVAL', 'Stopped chunk processing interval.');
    }
  }

  /** Clean up all resources (recorder, stream, chunks, interval) */
  private static cleanupResources(): void {
    this.stopProcessingInterval();

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch (e) { Logger.warn('VR-CLEANUP', 'Error stopping media recorder during cleanup:', e); }
    }
    this.mediaRecorder = null;

    if (this.audioStream) {
      this.audioStream.getTracks().forEach(track => track.stop());
      this.audioStream = null;
    }

    this.audioChunks = [];
    this.actualMimeType = ''; // Reset actual type
    Logger.log('VR-CLEANUP', 'Cleaned up audio resources.');
  }

  /**
   * Get the appropriate file extension for a given MIME type.
   * Primarily expects webm or wav based on recording preferences.
   * @param mimeType The MIME type string (e.g., 'audio/webm;codecs=opus')
   * @returns The corresponding file extension (e.g., 'webm')
   */
  public static getFileExtensionFromMimeType(mimeType: string | null | undefined): string {
    if (!mimeType) return 'webm';
    const baseMimeType = mimeType.split(';')[0].toLowerCase();

    switch (baseMimeType) {
      case 'audio/webm':
        return 'webm';
      case 'audio/wav':
      case 'audio/x-wav': // Handle variations
        return 'wav';
      // Add other supported types if needed in the future, but focus is webm/wav
      case 'audio/ogg': return 'ogg';
      case 'audio/mp4': return 'm4a';
      case 'audio/mpeg': return 'mp3';
      default:
        Logger.warn('VR-EXT', `Unknown base MIME type: ${baseMimeType} for extension mapping, defaulting to .webm`);
        return 'webm';
    }
  }

  /**
   * Transcribe audio blob using the local API endpoint.
   * Sends the blob data packaged as a standard 'audio.webm' file.
   * @param blob Audio blob to transcribe (expected to be webm or wav)
   * @param apiKey Not used
   * @returns Transcribed text
   */
  public static async transcribeAudio(blob: Blob, apiKey: string): Promise<string> {
    const sizeKB = (blob.size / 1024).toFixed(1);
    const originalType = blob.type;
    Logger.log('VR-TRANSCRIBE', `Preparing blob for transcription: Size=${sizeKB}KB, OriginalType=${originalType}`);

    if (blob.size < 1000) {
      Logger.warn('VR-TRANSCRIBE', `Audio blob too small (${sizeKB}KB), skipping transcription.`);
      return '';
    }

    try {
      const formData = new FormData();
      // STANDARDISATION: Always name the file audio.webm for the API
      const filename = 'audio.webm';
      // STANDARDISATION: Always use the standard webm MIME type for the File object
      const fileType = 'audio/webm';

      // Create the File object using the blob's data but with standardized name and type
      const file = new File([blob], filename, { type: fileType });

      Logger.log('VR-TRANSCRIBE', `Sending file to /api/transcribe: Name=${file.name}, Size=${file.size} bytes, Type=${file.type}`);
      formData.append('audio', file);

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData
      });

      const responseBody = await response.text();

      if (!response.ok) {
        let errorMessage = `Transcription API Error (${response.status}): ${responseBody}`;
        try {
          const errorJson = JSON.parse(responseBody);
          errorMessage = errorJson.error || errorMessage;
        } catch (e) { /* Not JSON */ }
        Logger.error('VR-TRANSCRIBE', `API call failed: ${response.status}`, { detail: errorMessage });
        throw new Error(`Transcription failed: ${errorMessage}`);
      }

      const data = JSON.parse(responseBody);
      Logger.log('VR-TRANSCRIBE', 'Transcription successful via API.');
      return data.transcription || '';

    } catch (error) {
      Logger.error('VR-TRANSCRIBE', 'Error during transcribeAudio execution:', error);
      throw error; // Re-throw for VoiceRecordingService to potentially handle
    }
  }
} 