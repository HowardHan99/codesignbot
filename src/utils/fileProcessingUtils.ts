/**
 * Utility functions for handling file and audio processing
 */
import { ApiService } from '../services/apiService';

/**
 * Transcribe an audio file using the API
 * @param file The audio file to transcribe
 * @returns The transcription result with transcription text and duration
 */
export const transcribeAudioFile = async (file: File): Promise<{ transcription: string; duration: number }> => {
  console.log(`Sending audio file to transcription API: ${file.name}`);
  
  // Use the ApiService for transcription
  const result = await ApiService.transcribeAudio(file);
  
  if (!result.transcription) {
    throw new Error('Transcription failed');
  }
  
  console.log(`Transcription complete. Length: ${result.transcription.length} characters, Duration: ${result.duration}s`);
  
  return result;
};

/**
 * Chunk a transcript into smaller pieces for processing
 * This simulates processing chunks of speech in real-time
 * @param transcript The full transcript text
 * @param chunkSize Size of each chunk in characters
 * @returns Array of chunks
 */
export const chunkTranscript = (transcript: string, chunkSize: number = 750): string[] => {
  const chunks: string[] = [];
  
  for (let i = 0; i < transcript.length; i += chunkSize) {
    chunks.push(transcript.substring(i, i + chunkSize));
  }
  
  return chunks;
};

/**
 * Calculate the progress percentage based on current position in processing
 * @param currentIndex Current index being processed
 * @param totalLength Total length of the content
 * @param startPercentage Starting percentage (e.g., 10 if first 10% is for a different phase)
 * @param availablePercentage Percentage available for this phase (e.g., 80 if this phase should go from 10% to 90%)
 * @returns The calculated progress percentage
 */
export const calculateProgressPercentage = (
  currentIndex: number,
  totalLength: number,
  startPercentage: number = 10,
  availablePercentage: number = 80
): number => {
  return Math.min(
    startPercentage + Math.round((currentIndex / totalLength) * availablePercentage),
    startPercentage + availablePercentage
  );
};

/**
 * Create a delay promise for rate limiting or simulating processing time
 * @param ms Milliseconds to delay
 * @returns Promise that resolves after the specified time
 */
export const delay = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
}; 