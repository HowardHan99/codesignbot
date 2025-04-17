/**
 * SimpleAudioRecorder
 * A streamlined audio recorder implementation using Web Audio API.
 * Generates WAV format audio in real-time from raw audio samples.
 */
import { Logger } from '../../utils/logger';
import { VoiceRecordingTranscriptionService } from '../voiceRecordingTranscription';

// Log context for this module
const LOG_CONTEXT = 'AUDIO-RECORDER';

export interface AudioRecorderChunk {
  blob: Blob;
  timestamp: number;
}

export class SimpleAudioRecorder {
  private static mediaRecorder: MediaRecorder | null = null;
  private static audioStream: MediaStream | null = null;
  private static chunks: Blob[] = []; // For final recording
  private static isRecording = false;
  private static onChunkCallback: ((chunk: AudioRecorderChunk) => void) | null = null;
  private static chunkInterval: number = 20000; // Default to 20 seconds
  private static actualMimeType: string | null = null;
  // Audio processing components
  private static audioContext: AudioContext | null = null;
  private static scriptProcessor: ScriptProcessorNode | null = null;
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

      // Reset chunk tracking in VoiceRecordingTranscriptionService
      VoiceRecordingTranscriptionService.resetChunkCache();
      
      Logger.log(LOG_CONTEXT, `Starting recording with ${this.chunkInterval/1000}s chunks`);

      // Request microphone access
      this.audioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });

      // Initialize audio context and custom WAV generator
      this.setupWavGenerator();
      
      // Also initialize a MediaRecorder as a backup for final recording
      try {
        const fallbackMimeType = MediaRecorder.isTypeSupported('audio/wav') ? 'audio/wav' : 'audio/webm';
        this.mediaRecorder = new MediaRecorder(this.audioStream, { 
          mimeType: fallbackMimeType,
          audioBitsPerSecond: 128000 
        });
        
        this.actualMimeType = this.mediaRecorder.mimeType;
        Logger.log(LOG_CONTEXT, `Backup MediaRecorder initialized with type: ${this.actualMimeType}`);
        
        // Only use this recorder for final recording
        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            this.chunks.push(event.data);
            if (options.onDataAvailable) {
              options.onDataAvailable(event.data);
            }
          }
        };
        
        this.mediaRecorder.start(this.chunkInterval);
      } catch (error) {
        Logger.warn(LOG_CONTEXT, 'Backup MediaRecorder initialization failed:', error);
      }
      
      Logger.log(LOG_CONTEXT, 'Recording started successfully with WAV generator');
      return this.audioStream;
    } catch (error) {
      Logger.error(LOG_CONTEXT, 'Error starting recording:', error);
      this.cleanup();
      throw error;
    }
  }
  
  /**
   * Set up our WAV generator using ScriptProcessorNode
   */
  private static setupWavGenerator(): void {
    try {
      // Initialize audio context
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Create an audio source from the stream
      this.source = this.audioContext.createMediaStreamSource(this.audioStream!);
      
      // Reset chunk buffer and timing
      this.chunkBuffer = [];
      this.chunkStartTime = Date.now();
      
      // Create a script processor to handle the raw audio data
      const bufferSize = 4096;
      this.scriptProcessor = this.audioContext.createScriptProcessor(
        bufferSize, 
        1, // mono input
        1  // mono output
      );
      
      // Set up audio processing event handler
      this.scriptProcessor.onaudioprocess = (e: AudioProcessingEvent) => {
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
          this.generateWavChunk();
        }
      };
      
      // Connect the nodes: source -> scriptProcessor -> destination
      this.source.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.audioContext.destination);
      
      Logger.log(LOG_CONTEXT, 'WAV generator initialized successfully');
    } catch (error) {
      Logger.error(LOG_CONTEXT, 'Failed to initialize WAV generator:', error);
      throw error;
    }
  }
  
  /**
   * Generate a WAV chunk from the accumulated audio buffer
   */
  private static generateWavChunk(): void {
    if (!this.audioContext || this.chunkBuffer.length === 0) return;
    
    try {
      // Calculate total samples from all buffer chunks
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
      const wavBlob = this.createWavFile(combinedBuffer, this.audioContext.sampleRate);
      
      // Reset for next chunk
      this.chunkBuffer = [];
      this.chunkStartTime = Date.now();
      
      // Send the WAV chunk to the callback
      if (this.onChunkCallback) {
        const chunk: AudioRecorderChunk = {
          blob: wavBlob,
          timestamp: Date.now()
        };
        Logger.log(LOG_CONTEXT, `WAV chunk generated: ${(wavBlob.size/1024).toFixed(1)}KB, Type: audio/wav`);
        this.onChunkCallback(chunk);
      }
    } catch (error) {
      Logger.error(LOG_CONTEXT, 'Error generating WAV chunk:', error);
    }
  }
  
  /**
   * Create a WAV blob from Float32Array audio data
   */
  private static createWavFile(audioData: Float32Array, sampleRate: number): Blob {
    // WAV parameters - 16-bit mono PCM
    const numChannels = 1;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = audioData.length * bytesPerSample;
    const bufferSize = 44 + dataSize; // 44 bytes for WAV header
    
    // Create the buffer
    const buffer = new ArrayBuffer(bufferSize);
    const view = new DataView(buffer);
    
    // Write WAV header
    // "RIFF" chunk descriptor
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    this.writeString(view, 8, 'WAVE');
    
    // "fmt " sub-chunk
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    
    // "data" sub-chunk
    this.writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);
    
    // Write audio data
    let offset = 44;
    for (let i = 0; i < audioData.length; i++) {
      // Convert float to 16-bit PCM
      const sample = Math.max(-1, Math.min(1, audioData[i]));
      const pcmValue = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, pcmValue, true);
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
      
      // Generate any remaining audio in our buffer
      if (this.chunkBuffer.length > 0) {
        this.generateWavChunk();
      }
      
      // Clean up audio processing components
      if (this.source && this.scriptProcessor) {
        try {
          this.source.disconnect(this.scriptProcessor);
          this.scriptProcessor.disconnect();
        } catch (e) {
          // Ignore disconnect errors
        }
      }
      
      // Get final recording from MediaRecorder if available
      if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
        this.mediaRecorder.onstop = () => {
          if (this.chunks.length > 0) {
            const finalBlob = new Blob(this.chunks, { type: this.actualMimeType || 'audio/wav' });
            Logger.log(LOG_CONTEXT, `Recording stopped, final size: ${(finalBlob.size/1024).toFixed(1)}KB`);
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
        // No MediaRecorder available, clean up and resolve
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

    // Clean up audio processing components
    if (this.source) {
      try {
        this.source.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
      this.source = null;
    }
    
    if (this.scriptProcessor) {
      try {
        this.scriptProcessor.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
      this.scriptProcessor = null;
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