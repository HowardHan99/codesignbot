import { NextRequest, NextResponse } from 'next/server';
import { OpenAI } from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    // Get the form data from the request
    const formData = await request.formData();
    const audio = formData.get('audio');

    if (!audio || !(audio instanceof Blob)) {
      return NextResponse.json(
        { error: 'Audio file is required' },
        { status: 400 }
      );
    }

    // Convert the Blob to ArrayBuffer
    const audioBuffer = await audio.arrayBuffer();
    const audioFile = new Uint8Array(audioBuffer);

    // Create a temporary file name
    const fileName = `audio-${Date.now()}.webm`;

    // Create a temporary file for OpenAI
    const file = new File([audioFile], fileName, { type: audio.type });

    // Track time for metrics
    const startTime = Date.now();

    // Send the audio to OpenAI for transcription
    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
      language: 'en',
    });

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000; // in seconds

    // Return the transcription
    return NextResponse.json({
      transcription: transcription.text,
      duration,
    });
  } catch (error: any) {
    console.error('Error transcribing audio:', error);
    
    return NextResponse.json(
      { error: error.message || 'Error transcribing audio' },
      { status: 500 }
    );
  }
} 