import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

// Initialize OpenAI API with environment variables
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generate Sketch API Route
 * Uses DALL-E 3 to generate a design sketch based on design proposals and decisions
 */
export async function POST(request: NextRequest) {
  console.log('[GENERATE SKETCH API] Received request');
  const startTime = Date.now();
  
  try {
    const requestData = await request.json();
    const { prompt, model = 'gpt-4o' } = requestData;
    
    console.log('[GENERATE SKETCH API] Request data parsed', {
      promptLength: prompt?.length || 0,
      promptPreview: prompt?.substring(0, 100) + (prompt?.length > 100 ? '...' : '') || 'none',
      model
    });

    if (!prompt) {
      console.error('[GENERATE SKETCH API] Missing prompt');
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    // Define DALL-E parameters for high-quality design sketches
    const dalleParams = {
      model: model, // 'dall-e-3' preferred for higher quality
      prompt: `${prompt}\n\nCreate a design sketch that best represents the design proposal and decisions.`,
      n: 1,
      size: "1024x1024" as "1024x1024",
      quality: "standard" as "standard",
    };
    
    console.log('[GENERATE SKETCH API] Calling DALL-E API with parameters:', {
      model: dalleParams.model,
      promptLength: dalleParams.prompt.length,
      size: dalleParams.size,
      quality: dalleParams.quality
    });

    // Generate image with DALL-E
    const response = await openai.images.generate(dalleParams);
    
    if (!response.data || response.data.length === 0 || !response.data[0].url) {
      throw new Error('Failed to generate image: Empty response from OpenAI');
    }
    
    const imageUrl = response.data[0].url;
    
    console.log(`[GENERATE SKETCH API] Image generated successfully in ${Date.now() - startTime}ms`);
    
    return NextResponse.json({
      imageUrl,
      model: dalleParams.model
    });

  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`[GENERATE SKETCH API] Error generating sketch after ${duration}ms:`, error);
    return NextResponse.json(
      { error: error.message || 'An error occurred while generating the sketch' },
      { status: 500 }
    );
  }
} 