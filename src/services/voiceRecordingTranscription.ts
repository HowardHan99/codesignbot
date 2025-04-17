/**
 * VoiceRecordingTranscriptionService
 * Service for transcribing audio using OpenAI's advanced transcription API.
 * Handles audio chunk processing and conversion for reliable speech-to-text.
 */
import { Logger } from '../utils/logger';

// Log context for this module
const LOG_CONTEXT = 'WHISPER-API';

export interface TranscriptionResult {
  text: string;
  duration?: number;
  error?: string;
}

export class VoiceRecordingTranscriptionService {
  // Static cache for the first chunk that contains WebM headers
  private static firstChunkCache: Blob | null = null;
  private static chunkCount: number = 0;

  /**
   * Reset the chunk cache - call this when starting a new recording session
   */
  public static resetChunkCache(): void {
    this.firstChunkCache = null;
    this.chunkCount = 0;
    Logger.log(LOG_CONTEXT, 'Chunk cache reset');
  }

  /**
   * Convert audio blob to WAV format using AudioContext
   * This ensures each chunk is a complete, valid audio file
   * @param audioBlob The audio blob to convert
   * @returns Promise resolving to a WAV format Blob
   */
  private static async convertToWav(audioBlob: Blob): Promise<Blob> {
    return new Promise(async (resolve, reject) => {
      try {
        Logger.log(LOG_CONTEXT, `Converting ${audioBlob.type} (${(audioBlob.size/1024).toFixed(1)}KB) to WAV format`);
        
        // Create AudioContext
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        
        // Convert blob to ArrayBuffer
        const arrayBuffer = await audioBlob.arrayBuffer();
        
        // Decode the audio data
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        // Create WAV file from AudioBuffer
        const wavBlob = await this.audioBufferToWav(audioBuffer);
        
        Logger.log(LOG_CONTEXT, `Conversion successful: ${(wavBlob.size/1024).toFixed(1)}KB WAV file`);
        resolve(wavBlob);
      } catch (error) {
        Logger.error(LOG_CONTEXT, 'Error converting audio format:', error);
        // If conversion fails, return the original blob
        Logger.log(LOG_CONTEXT, 'Using original audio blob as fallback');
        resolve(audioBlob);
      }
    });
  }
  
  /**
   * Convert AudioBuffer to WAV format Blob
   * @param audioBuffer The decoded audio buffer
   * @returns WAV format Blob
   */
  private static audioBufferToWav(audioBuffer: AudioBuffer): Blob {
    const numOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length;
    const bitsPerSample = 16; // Standard for WAV
    const blockAlign = numOfChannels * bitsPerSample / 8;
    const byteRate = sampleRate * blockAlign;
    const dataSize = length * blockAlign;
    const bufferSize = 44 + dataSize; // 44 bytes is the size of the WAV header
    
    // Create the WAV buffer
    const arrayBuffer = new ArrayBuffer(bufferSize);
    const dataView = new DataView(arrayBuffer);
    
    // Write WAV header
    this.writeWavHeader(dataView, {
      numOfChannels,
      sampleRate,
      bitsPerSample,
      dataSize
    });
    
    // Write audio data
    this.writeAudioData(dataView, audioBuffer, 44); // Start writing at byte 44 (after the header)
    
    // Create and return the WAV Blob
    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }
  
  /**
   * Write WAV header to DataView
   */
  private static writeWavHeader(dataView: DataView, options: { 
    numOfChannels: number, 
    sampleRate: number, 
    bitsPerSample: number, 
    dataSize: number 
  }): void {
    const { numOfChannels, sampleRate, bitsPerSample, dataSize } = options;
    const blockAlign = numOfChannels * bitsPerSample / 8;
    const byteRate = sampleRate * blockAlign;
    
    // "RIFF" chunk descriptor
    this.writeString(dataView, 0, 'RIFF');
    dataView.setUint32(4, 36 + dataSize, true); // File size - 8
    this.writeString(dataView, 8, 'WAVE');
    
    // "fmt " sub-chunk
    this.writeString(dataView, 12, 'fmt ');
    dataView.setUint32(16, 16, true); // Size of fmt chunk
    dataView.setUint16(20, 1, true); // Audio format (1 = PCM)
    dataView.setUint16(22, numOfChannels, true);
    dataView.setUint32(24, sampleRate, true);
    dataView.setUint32(28, byteRate, true);
    dataView.setUint16(32, blockAlign, true);
    dataView.setUint16(34, bitsPerSample, true);
    
    // "data" sub-chunk
    this.writeString(dataView, 36, 'data');
    dataView.setUint32(40, dataSize, true);
  }
  
  /**
   * Write string to DataView
   */
  private static writeString(dataView: DataView, offset: number, string: string): void {
    for (let i = 0; i < string.length; i++) {
      dataView.setUint8(offset + i, string.charCodeAt(i));
    }
  }
  
  /**
   * Write audio data to DataView
   */
  private static writeAudioData(dataView: DataView, audioBuffer: AudioBuffer, offset: number): void {
    const length = audioBuffer.length;
    const channels = audioBuffer.numberOfChannels;
    
    // Get audio data from all channels
    const channelData: Float32Array[] = [];
    for (let c = 0; c < channels; c++) {
      channelData.push(audioBuffer.getChannelData(c));
    }
    
    // Interleave the channel data and convert to 16-bit PCM
    let index = offset;
    for (let i = 0; i < length; i++) {
      for (let c = 0; c < channels; c++) {
        // Convert float to 16-bit PCM
        const sample = Math.max(-1, Math.min(1, channelData[c][i]));
        const pcmValue = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        dataView.setInt16(index, pcmValue, true);
        index += 2;
      }
    }
  }

  /**
   * Transcribe an audio blob using OpenAI's Whisper API.
   * @param audioBlob The audio blob to transcribe
   * @returns Promise resolving to the transcription result
   */
  public static async transcribeAudio(audioBlob: Blob): Promise<TranscriptionResult> {
    if (!audioBlob || audioBlob.size < 1000) {
      Logger.warn(LOG_CONTEXT, `Audio blob too small (${audioBlob.size} bytes), skipping transcription`);
      return { text: '', error: 'Audio too small or empty' };
    }

    // Store chunk count for debugging
    this.chunkCount++;
    const currentChunkNum = this.chunkCount;
    
    Logger.log(LOG_CONTEXT, `Preparing chunk #${currentChunkNum} for transcription: ${(audioBlob.size/1024).toFixed(1)}KB, type: ${audioBlob.type}`);

    try {
      // For all chunks after the first one, convert to WAV format to ensure proper headers
      let blobToSend = audioBlob;
      
      if (currentChunkNum > 1 || audioBlob.type.includes('webm')) {
        try {
          // Use WAV conversion for all non-first chunks to ensure proper format
          blobToSend = await this.convertToWav(audioBlob);
          Logger.log(LOG_CONTEXT, `Using WAV-converted audio for chunk #${currentChunkNum}`);
        } catch (conversionError) {
          Logger.error(LOG_CONTEXT, 'Audio conversion failed, using original blob:', conversionError);
        }
      }

      // Create a File object from the Blob with a consistent name and type
      const extension = blobToSend.type.includes('wav') ? 'wav' : this.getExtensionForAudioType(blobToSend.type);
      const file = new File([blobToSend], `audio-chunk-${currentChunkNum}.${extension}`, { type: blobToSend.type });

      // Prepare the FormData to send to our API endpoint
      const formData = new FormData();
      formData.append('audio', file);
      formData.append('timestamp', Date.now().toString());
      formData.append('chunkNumber', currentChunkNum.toString());

      // Send to our API endpoint (which will relay to OpenAI)
      Logger.log(LOG_CONTEXT, `Sending chunk #${currentChunkNum}: ${file.name}, size: ${(file.size/1024).toFixed(1)}KB, type: ${file.type} to API`);
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      // Handle API response
      if (!response.ok) {
        const errorData = await response.text();
        let errorMessage = `API Error: ${response.status} ${response.statusText}`;
        try {
          const errorJson = JSON.parse(errorData);
          errorMessage = errorJson.error || errorMessage;
        } catch (e) {
          // Text wasn't valid JSON
        }
        
        Logger.error(LOG_CONTEXT, `Chunk #${currentChunkNum} transcription failed: ${errorMessage}`, { status: response.status });
        return { text: '', error: errorMessage };
      }

      // Parse successful response
      const result = await response.json();
      Logger.log(LOG_CONTEXT, `Chunk #${currentChunkNum} transcription successful: ${result.transcription.length} chars`);
      return { 
        text: result.transcription,
        duration: result.duration || 0
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during transcription';
      Logger.error(LOG_CONTEXT, `Error during chunk #${currentChunkNum} transcription:`, error);
      return { text: '', error: errorMessage };
    }
  }

  /**
   * Get appropriate file extension based on audio MIME type
   * @param mimeType The MIME type
   * @returns The file extension (without dot)
   */
  private static getExtensionForAudioType(mimeType: string): string {
    // Extract the base MIME type (without parameters)
    const baseMimeType = (mimeType || '').split(';')[0].toLowerCase();
    
    // Map to appropriate extensions (based on OpenAI's supported formats)
    switch (baseMimeType) {
      case 'audio/wav':
      case 'audio/x-wav':
        return 'wav';
      case 'audio/mp3': 
      case 'audio/mpeg':
        return 'mp3';
      case 'audio/mp4':
      case 'audio/x-m4a':
        return 'm4a';
      case 'audio/ogg':
        return 'ogg';
      case 'audio/webm':
        return 'webm';
      case 'audio/flac':
        return 'flac';
      default:
        Logger.warn(LOG_CONTEXT, `Unknown audio MIME type: ${baseMimeType}, using .wav extension`);
        return 'wav'; // Default to wav for unknown types
    }
  }
} 