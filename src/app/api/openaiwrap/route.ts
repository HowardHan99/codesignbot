import { NextRequest, NextResponse } from 'next/server';
import { OpenAI } from 'openai';

// Initialize OpenAI API client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const runtime = 'edge'; // Add edge runtime
export const dynamic = 'force-dynamic'; // No caching

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userPrompt, systemPrompt, isVisionRequest, useGpt4 } = body;

    if (!userPrompt || !systemPrompt) {
      return NextResponse.json(
        { error: 'Missing userPrompt or systemPrompt' },
        { status: 400 }
      );
    }

    if (isVisionRequest) {
      const response = await openai.chat.completions.create({
        model: 'gpt-4-vision-preview',
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Please analyze this image:' },
              {
                type: 'image_url',
                image_url: userPrompt,
              },
            ],
          },
        ],
        max_tokens: 500,
      });

      const assistantMessage = response.choices[0]?.message?.content || 'No response';
      return NextResponse.json({ response: assistantMessage });
    }

    const response = await openai.chat.completions.create({
      model: useGpt4 ? 'gpt-4o-mini' : 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    const assistantMessage = response.choices[0]?.message?.content || 'No response';
    return NextResponse.json({ response: assistantMessage });
    
  } catch (error) {
    console.error('Error communicating with OpenAI:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 