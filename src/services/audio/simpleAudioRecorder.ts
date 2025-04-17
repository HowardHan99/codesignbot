/**
 * SimpleAudioRecorder
 * A streamlined recorder using Web Audio API with focus on generating reliable audio format.
 * Creates WAV format audio, which is well-supported by OpenAI's Whisper API.
 */
import { Logger } from '../../utils/logger';
import { WhisperTranscriptionService } from '../TranscriptionService';

// Log context for this module
const LOG_CONTEXT = 'AUDIO-RECORDER';

export interface AudioRecorderChunk {
  blob: Blob;
  timestamp: number;
}

export class SimpleAudioRecorder {
  private static mediaRecorder: MediaRecorder | null = null;
  private static audioStream: MediaStream | null = null;
  private static chunks: Blob[] = []; // Keep for final recording blob
  private static isRecording = false;
  private static onChunkCallback: ((chunk: AudioRecorderChunk) => void) | null = null;
  private static chunkInterval: number = 20000; // Default to 20 seconds
  private static actualMimeType: string | null = null;
  // New audio context for processing
  private static audioContext: AudioContext | null = null;
  private static recorder: any = null; // ScriptProcessor recorder
  private static source: MediaStreamAudioSourceNode | null = null;
  private static chunkBuffer: Float32Array[] = [];
  private static chunkStartTime: number = 0;

  /**
   * Start recording audio.
   * @param options Configuration options
   * @returns Promise that resolves when recording starts
   */
  public static async startRecording(options: {
    onChunk?: (chunk: AudioRecorderChunk) => void;
    chunkInterval?: number;
    onDataAvailable?: (data: Blob) => void;
  } = {}): Promise<MediaStream> {
    try {
      // First clean up any existing recording session
      await this.stopRecording();

      this.chunks = [];
      this.isRecording = true;
      this.onChunkCallback = options.onChunk || null;
      this.chunkInterval = options.chunkInterval || this.chunkInterval;

      // Reset WhisperTranscriptionService chunk cache when starting new recording
      WhisperTranscriptionService.resetChunkCache();
      
      Logger.log(LOG_CONTEXT, `Starting recording with ${this.chunkInterval/1000}s chunks`);

      // Request microphone access
      this.audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });

      try {
        // Initialize a standard media recorder but use it primarily for the final recording
        const fallbackMimeType = MediaRecorder.isTypeSupported('audio/wav') ? 'audio/wav' : 'audio/webm';
        this.mediaRecorder = new MediaRecorder(this.audioStream, { 
          mimeType: fallbackMimeType,
          audioBitsPerSecond: 128000 
        });
        
        this.actualMimeType = this.mediaRecorder.mimeType;
        Logger.log('VR-SETUP', `MediaRecorder initialized as fallback with type: ${this.actualMimeType}`);
        
        // Start the recorder just to collect chunks for final output
        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            this.chunks.push(event.data);
            if (options.onDataAvailable) {
              options.onDataAvailable(event.data);
            }
          }
        };

        // Setup our custom audio processor for chunks
        this.setupCustomAudioProcessor(options);
        
        // Start the standard MediaRecorder for backup
        this.mediaRecorder.start(this.chunkInterval);
        
        Logger.log(LOG_CONTEXT, 'Recording started successfully with hybrid recording strategy');
        return this.audioStream;
      } catch (error) {
        Logger.error(LOG_CONTEXT, 'Failed to initialize MediaRecorder, trying fallback:', error);
        
        // If MediaRecorder fails, we'll just use the custom audio processor
        this.setupCustomAudioProcessor(options);
        
        Logger.log(LOG_CONTEXT, 'Recording started with fallback mode');
        return this.audioStream;
      }
    } catch (error) {
      Logger.error(LOG_CONTEXT, 'Error starting recording:', error);
      this.cleanup();
      throw error;
    }
  }
  
  /**
   * Set up a custom audio processor that can create WAV files directly
   */
  private static setupCustomAudioProcessor(options: any): void {
    try {
      // Initialize audio context
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Create an audio source from the stream
      this.source = this.audioContext.createMediaStreamSource(this.audioStream!);
      
      // Reset chunk buffer
      this.chunkBuffer = [];
      this.chunkStartTime = Date.now();
      
      // Create a script processor to handle the raw audio data
      // NOTE: ScriptProcessorNode is deprecated but still widely supported
      // The new AudioWorkletNode is the replacement but requires more setup
      const bufferSize = 4096;
      this.recorder = this.audioContext.createScriptProcessor(
        bufferSize, 
        1, // mono input
        1  // mono output
      );
      
      // Process audio data
      this.recorder.onaudioprocess = (e: AudioProcessingEvent) => {
        if (!this.isRecording) return;
        
        // Get the raw audio data
        const channelData = e.inputBuffer.getChannelData(0);
        
        // Clone the data (since it's a reference that will be reused)
        const clonedData = new Float32Array(channelData.length);
        clonedData.set(channelData);
        
        // Add to our buffer
        this.chunkBuffer.push(clonedData);
        
        // Check if we've reached the chunk interval
        const elapsed = Date.now() - this.chunkStartTime;
        if (elapsed >= this.chunkInterval) {
          this.processAudioChunk();
        }
      };
      
      // Connect the nodes: source -> recorder -> destination
      this.source.connect(this.recorder);
      this.recorder.connect(this.audioContext.destination);
      
      Logger.log(LOG_CONTEXT, 'Custom audio processor initialized successfully');
    } catch (error) {
      Logger.error(LOG_CONTEXT, 'Failed to initialize custom audio processor:', error);
    }
  }
  
  /**
   * Process the current audio buffer and create a WAV chunk
   */
  private static processAudioChunk(): void {
    if (!this.audioContext || this.chunkBuffer.length === 0) return;
    
    try {
      // Calculate total samples
      let totalSamples = 0;
      for (const buffer of this.chunkBuffer) {
        totalSamples += buffer.length;
      }
      
      // Create a combined buffer
      const combinedBuffer = new Float32Array(totalSamples);
      let offset = 0;
      for (const buffer of this.chunkBuffer) {
        combinedBuffer.set(buffer, offset);
        offset += buffer.length;
      }
      
      // Create WAV file
      const wavBlob = this.createWAVBlob(combinedBuffer, this.audioContext.sampleRate);
      
      // Reset for next chunk
      this.chunkBuffer = [];
      this.chunkStartTime = Date.now();
      
      // If we have a callback, send this chunk
      if (this.onChunkCallback) {
        const chunk: AudioRecorderChunk = {
          blob: wavBlob,
          timestamp: Date.now()
        };
        Logger.log('VR-CHUNK', `Custom chunk captured: ${(wavBlob.size/1024).toFixed(1)}KB, Type: audio/wav (custom)`);
        this.onChunkCallback(chunk);
      }
    } catch (error) {
      Logger.error(LOG_CONTEXT, 'Error processing audio chunk:', error);
    }
  }
  
  /**
   * Create a WAV blob from Float32Array audio data
   */
  private static createWAVBlob(audioData: Float32Array, sampleRate: number): Blob {
    // We'll create a 16-bit WAV file
    const numChannels = 1; // Mono
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = audioData.length * bytesPerSample;
    const bufferSize = 44 + dataSize; // 44 bytes is WAV header size
    
    // Create the buffer
    const buffer = new ArrayBuffer(bufferSize);
    const view = new DataView(buffer);
    
    // Write WAV header
    // "RIFF" chunk
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    this.writeString(view, 8, 'WAVE');
    
    // "fmt " chunk
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    
    // "data" chunk
    this.writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);
    
    // Write audio data
    let offset = 44;
    for (let i = 0; i < audioData.length; i++) {
      // Convert float to 16-bit PCM
      const sample = Math.max(-1, Math.min(1, audioData[i]));
      const value = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, value, true);
      offset += 2;
    }
    
    // Create and return WAV blob
    return new Blob([buffer], { type: 'audio/wav' });
  }
  
  /**
   * Helper to write a string to a DataView
   */
  private static writeString(view: DataView, offset: number, string: string): void {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  /**
   * Stop recording and get the final audio Blob.
   * @returns Promise that resolves to the recorded audio
   */
  public static async stopRecording(): Promise<Blob | null> {
    return new Promise<Blob | null>((resolve) => {
      if (!this.isRecording) {
        this.cleanup();
        resolve(null);
        return;
      }

      Logger.log(LOG_CONTEXT, 'Stopping recording...');
      
      // Process any remaining audio in our buffer
      if (this.chunkBuffer.length > 0) {
        this.processAudioChunk();
      }
      
      // Disconnect and clean up the custom audio processor
      if (this.source && this.recorder) {
        try {
          this.source.disconnect(this.recorder);
          this.recorder.disconnect();
        } catch (e) {
          // Ignore disconnect errors
        }
      }
      
      // If we have a MediaRecorder, get its data too
      if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
        this.mediaRecorder.onstop = () => {
          if (this.chunks.length > 0) {
            const finalBlob = new Blob(this.chunks, { type: this.actualMimeType || 'audio/wav' });
            Logger.log(LOG_CONTEXT, `Recording stopped, final size: ${(finalBlob.size/1024).toFixed(1)}KB, Type: ${finalBlob.type}`);
            this.cleanup();
            resolve(finalBlob);
          } else {
            Logger.log(LOG_CONTEXT, 'Recording stopped, but no audio data was captured');
            this.cleanup();
            resolve(null);
          }
        };

        try {
          this.mediaRecorder.requestData();
          this.mediaRecorder.stop();
        } catch (e) {
          Logger.error(LOG_CONTEXT, 'Error stopping recorder:', e);
          this.cleanup();
          resolve(null);
        }
      } else {
        // If we don't have a MediaRecorder or it's not recording,
        // just clean up and resolve with null
        this.cleanup();
        resolve(null);
      }
    });
  }

  /**
   * Check if currently recording
   */
  public static isCurrentlyRecording(): boolean {
    return this.isRecording;
  }

  /**
   * Clean up all resources
   */
  private static cleanup(): void {
    this.isRecording = false;

    // Clean up MediaRecorder
    if (this.mediaRecorder) {
      try {
        if (this.mediaRecorder.state === 'recording') {
          this.mediaRecorder.stop();
        }
      } catch (e) {
        // Ignore errors when stopping
      }
      this.mediaRecorder = null;
    }

    // Clean up audio stream
    if (this.audioStream) {
      this.audioStream.getTracks().forEach((track) => track.stop());
      this.audioStream = null;
    }

    // Clean up audio context resources
    if (this.source) {
      try {
        this.source.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
      this.source = null;
    }
    
    if (this.recorder) {
      try {
        this.recorder.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
      this.recorder = null;
    }
    
    if (this.audioContext) {
      try {
        if (this.audioContext.state !== 'closed') {
          this.audioContext.close();
        }
      } catch (e) {
        // Ignore close errors
      }
      this.audioContext = null;
    }

    this.chunks = [];
    this.chunkBuffer = [];
    this.onChunkCallback = null;
    
    Logger.log(LOG_CONTEXT, 'Recorder resources cleaned up');
  }
} 