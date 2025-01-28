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
    const { userPrompt, systemPrompt } = body;

    if (!userPrompt || !systemPrompt) {
      return NextResponse.json(
        { error: 'Missing userPrompt or systemPrompt' },
        { status: 400 }
      );
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
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