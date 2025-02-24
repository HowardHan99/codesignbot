import OpenAI from 'openai';
import { TranscriptProcessingService } from './transcriptProcessingService';

interface TranscriptionResponse {
  transcription: string;
  decisions: string[];
  duration: number;
}

export class VoiceRecordingService {
  private static mediaRecorder: MediaRecorder | null = null;
  private static audioChunks: Blob[] = [];
  private static processingInterval: NodeJS.Timeout | null = null;
  private static onNewTranscription: ((points: string[]) => void) | null = null;
  private static currentTranscript: string = '';

  static async startRecording(onNewPoints: (points: string[]) => void): Promise<void> {
    try {
      this.onNewTranscription = onNewPoints;
      this.currentTranscript = '';
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        this.audioChunks.push(event.data);
      };

      // Request data every 30 seconds for better context
      this.mediaRecorder.start(30000);

      // Set up interval processing
      this.processingInterval = setInterval(async () => {
        if (this.audioChunks.length > 0) {
          const currentChunks = [...this.audioChunks];
          this.audioChunks = []; // Clear for new chunks
          await this.processChunks(currentChunks);
        }
      }, 30000);

    } catch (error) {
      console.error('Error starting recording:', error);
      throw error;
    }
  }

  private static async processChunks(chunks: Blob[]): Promise<void> {
    try {
      const audioBlob = new Blob(chunks, { type: 'audio/webm' });
      const formData = new FormData();
      
      const file = new File([audioBlob], 'audio.mp3', { 
        type: audioBlob.type || 'audio/mpeg'
      });
      formData.append('audio', file);

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Processing failed: ${response.statusText}`);
      }

      const result = await response.json();
      this.currentTranscript += ' ' + result.transcription;

      // Process the transcript with GPT
      const processedPoints = await TranscriptProcessingService.processTranscript(result.transcription);
      
      // Call the callback with the processed points
      if (this.onNewTranscription && processedPoints.length > 0) {
        this.onNewTranscription(processedPoints.map(p => p.proposal));
      }

    } catch (error) {
      console.error('Error processing chunks:', error);
    }
  }

  static async stopRecording(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('No recording in progress'));
        return;
      }

      // Clear the processing interval
      if (this.processingInterval) {
        clearInterval(this.processingInterval);
        this.processingInterval = null;
      }

      this.mediaRecorder.onstop = async () => {
        // Process any remaining chunks
        if (this.audioChunks.length > 0) {
          await this.processChunks(this.audioChunks);
        }

        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        this.audioChunks = [];
        this.onNewTranscription = null;
        this.currentTranscript = '';
        resolve(audioBlob);
      };

      this.mediaRecorder.stop();
      this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
    });
  }

  static async processRecording(audioBlob: Blob): Promise<TranscriptionResponse> {
    try {
      const formData = new FormData();
      const file = new File([audioBlob], 'audio.mp3', { 
        type: audioBlob.type || 'audio/mpeg'
      });
      formData.append('audio', file);

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Processing failed: ${response.statusText}`);
      }

      const result = await response.json();
      
      return {
        transcription: result.transcription,
        decisions: [], // We'll let the TranscriptProcessingService handle the decisions
        duration: result.duration
      };
    } catch (error) {
      console.error('Error processing recording:', error);
      throw error;
    }
  }
} 