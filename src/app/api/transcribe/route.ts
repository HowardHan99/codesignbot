import { NextRequest, NextResponse } from 'next/server';
import { OpenAI } from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// List of supported audio formats by OpenAI
const SUPPORTED_FORMATS = ['flac', 'm4a', 'mp3', 'mp4', 'mpeg', 'mpga', 'oga', 'ogg', 'wav', 'webm'];

export async function POST(request: NextRequest) {
  try {
    // Get the form data from the request
    const formData = await request.formData();
    const audio = formData.get('audio');

    if (!audio || !(audio instanceof Blob)) {
      console.error('Audio file is missing or invalid');
      return NextResponse.json(
        { error: 'Audio file is required' },
        { status: 400 }
      );
    }

    // Log audio file details for debugging
    const audioType = audio.type;
    const audioSize = audio.size;
    console.log(`Received audio file: ${audioSize} bytes, type: ${audioType}`);

    // Check if the file is likely a valid audio file (basic check)
    if (audioSize < 100) {
      console.error(`Audio file too small: ${audioSize} bytes`);
      return NextResponse.json(
        { error: 'Audio file is too small or empty' },
        { status: 400 }
      );
    }

    // Extract the format from the MIME type
    let format = audioType.split('/')[1];
    if (format && format.includes(';')) {
      // Handle "audio/webm;codecs=opus" type formats
      format = format.split(';')[0];
    }

    // Check if the format is supported
    if (!SUPPORTED_FORMATS.includes(format)) {
      console.error(`Unsupported audio format: ${format}`);
      return NextResponse.json(
        { 
          error: `Unsupported audio format: ${format}. Supported formats: ${SUPPORTED_FORMATS.join(', ')}`,
          supportedFormats: SUPPORTED_FORMATS
        },
        { status: 400 }
      );
    }

    // Convert the Blob to ArrayBuffer
    const audioBuffer = await audio.arrayBuffer();
    const audioFile = new Uint8Array(audioBuffer);

    // Create a temporary file name with the correct extension
    const fileName = `audio-${Date.now()}.${format}`;
    console.log(`Created temporary file: ${fileName}`);

    // Create a temporary file for OpenAI
    const file = new File([audioFile], fileName, { type: audioType });

    // Track time for metrics
    const startTime = Date.now();
    console.log('Calling OpenAI Whisper API...');

    try {
      // Send the audio to OpenAI for transcription
      const transcription = await openai.audio.transcriptions.create({
        file: file,
        model: 'whisper-1',
        language: 'en',
      });

      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000; // in seconds
      console.log(`Transcription successful, ${transcription.text.length} chars, took ${duration}s`);

      // Return the transcription
      return NextResponse.json({
        transcription: transcription.text,
        duration,
      });
    } catch (apiError: any) {
      console.error('OpenAI API error:', apiError);

      // Return a more detailed error for API issues
      return NextResponse.json(
        { 
          error: `OpenAI API error: ${apiError.message}`,
          details: apiError.response?.data || 'No additional details'
        },
        { status: 400 }
      );
    }

  } catch (error: any) {
    console.error('Error transcribing audio:', error);
    
    // Return detailed error information
    return NextResponse.json(
      { 
        error: error.message || 'Error transcribing audio',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
} 