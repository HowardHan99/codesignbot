import { NextRequest, NextResponse } from 'next/server';
import { OpenAI } from 'openai';

// Initialize OpenAI API client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text } = body;

    if (!text) {
      console.error('Embeddings API: Missing text parameter');
      return NextResponse.json(
        { error: 'Missing text parameter' },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error('Embeddings API: Missing OpenAI API key');
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    console.log(`Generating embeddings for text (${text.length} chars): ${text.substring(0, 100)}...`);
    
    try {
      const response = await openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: text,
      });

      if (!response.data?.[0]?.embedding) {
        console.error('Embeddings API: Invalid response from OpenAI', response);
        return NextResponse.json(
          { error: 'Invalid response from OpenAI API' },
          { status: 500 }
        );
      }

      console.log(`Successfully generated embeddings (${response.data[0].embedding.length} dimensions)`);
      return NextResponse.json({ embedding: response.data[0].embedding });
      
    } catch (openaiError) {
      console.error('Embeddings API: OpenAI API error:', openaiError);
      return NextResponse.json(
        { error: `OpenAI API error: ${openaiError instanceof Error ? openaiError.message : 'Unknown error'}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Embeddings API: Unexpected error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
} 