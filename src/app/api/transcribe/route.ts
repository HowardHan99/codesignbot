import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { Logger } from '../../../utils/logger';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Support all formats that OpenAI supports
const SUPPORTED_FORMATS = [
  'mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm'
];

// Minimum file size to avoid "too short" errors (1KB)
const MIN_FILE_SIZE = 1000;


export async function POST(request: NextRequest) {
  try {
    Logger.log('TRANSCRIBE-API', 'Received transcription request');
    
    const formData = await request.formData();
    const receivedAudioFile = formData.get('audio') as File | null;
    const chunkNumber = formData.get('chunkNumber') as string || '0';
    
    if (!receivedAudioFile) {
      Logger.error('TRANSCRIBE-API', 'No audio file provided in form data.');
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }
    
    Logger.log('TRANSCRIBE-API', `Received chunk #${chunkNumber}: Name=${receivedAudioFile.name}, Size=${receivedAudioFile.size}, Type=${receivedAudioFile.type}`);
    
    if (receivedAudioFile.size < MIN_FILE_SIZE) {
      Logger.error('TRANSCRIBE-API', `Audio file too small: ${receivedAudioFile.size} bytes`);
      return NextResponse.json({ error: 'Audio file is too small.' }, { status: 400 });
    }
    
    // Basic validation of file extension
    const originalExtension = receivedAudioFile.name.split('.').pop()?.toLowerCase();
    if (!originalExtension || !SUPPORTED_FORMATS.includes(originalExtension)) {
      Logger.warn('TRANSCRIBE-API', `Received file with extension: .${originalExtension}. Checking if format is supported.`);
    }

    try {
      if (!process.env.OPENAI_API_KEY) {
        Logger.error('TRANSCRIBE-API', 'Missing OpenAI API key on server.');
        return NextResponse.json({ error: 'Server configuration error: Missing API key' }, { status: 500 });
      }
      
      Logger.log('TRANSCRIBE-API', 'Sending audio to OpenAI GPT-4o transcription API...');

      // Using the latest gpt-4o-mini-transcribe model with improved options
      const transcriptionResponse = await openai.audio.transcriptions.create({
        file: receivedAudioFile,
        model: 'gpt-4o-transcribe', // Using the newer, faster model
        response_format: 'text', // Explicitly request text format
        language: 'en', // Still specifying English
        prompt: 'You are a helpful assistant that transcribes audio. You are given a chunk of audio and you need to transcribe it into text. You should not return anything if the audio is too short or does not contain any meaningful content.'
      });
      
      // Detailed logging of the raw response from OpenAI
      Logger.log('TRANSCRIBE-API', 'Raw response from OpenAI:', transcriptionResponse);

      let transcriptionText: string;
      if (typeof transcriptionResponse === 'string') {
        transcriptionText = transcriptionResponse;
      } else if (typeof (transcriptionResponse as any)?.text === 'string') {
        // Handling potential object response though 'text' format was requested
        transcriptionText = (transcriptionResponse as any).text;
        Logger.warn('TRANSCRIBE-API', 'OpenAI response was an object, extracted text. Expected string.');
      } else {
        Logger.error('TRANSCRIBE-API', 'Unexpected transcription response format from OpenAI.', transcriptionResponse);
        transcriptionText = ''; // Default to empty string if format is totally unexpected
      }
      
      Logger.log('TRANSCRIBE-API', `Transcription successful. Length: ${transcriptionText.length}. Preview: "${transcriptionText.substring(0, 100)}..."`);
      return NextResponse.json({
        transcription: transcriptionText,
        duration: 0, // Duration still not provided by OpenAI
      });

    } catch (error: any) {
      // Log the detailed error from OpenAI
      Logger.error('TRANSCRIBE-API', 'OpenAI API Error:', {
        status: error.status,
        message: error.message,
        code: error.code,
        param: error.param,
        type: error.type
      });
      
      let errorMessage = `Transcription failed via OpenAI: ${error.message || 'Unknown API error'}`;
      let status = error.status || 500;

      // Better error handling with specific messages
      if (status === 400) {
        if (error.message?.includes('too short')) {
          errorMessage = 'The audio recording is too short.';
        } else if (error.message?.includes('format') || error.message?.includes('decode')) {
          errorMessage = `OpenAI could not decode the audio data. The recording might be corrupted or in an unexpected format.`; 
        } else if (error.message?.includes('file size')) {
          errorMessage = 'The audio file exceeds the maximum size limit.';
        } else {
          errorMessage = `Invalid request to OpenAI: ${error.status} ${error.message}`;
        }
      } else if (status === 401) {
        errorMessage = 'API authentication failed. Please contact support.';
        status = 500; // This is a server issue, not client
      }
      
      return NextResponse.json({ error: errorMessage }, { status });
    }
  } catch (error: any) {
    Logger.error('TRANSCRIBE-API', 'Unexpected Server Error:', error);
    return NextResponse.json({ error: `Server error: ${error.message}` }, { status: 500 });
  }
} 