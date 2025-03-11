import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

// Initialize OpenAI API with environment variables
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Designer Role Play API Route
 * Generates designer thinking process and design decisions based on a design challenge
 */
export async function POST(request: NextRequest) {
  console.log('[DESIGNER ROLE PLAY API] Received request');
  const startTime = Date.now();
  
  try {
    // Get request data
    const requestData = await request.json();
    const { designChallenge, type } = requestData;
    
    console.log('[DESIGNER ROLE PLAY API] Request data parsed', {
      challengeLength: designChallenge?.length || 0,
      challengePreview: designChallenge?.substring(0, 100) + (designChallenge?.length > 100 ? '...' : '') || 'none',
      type: type || 'not specified'
    });

    // Validate request
    if (!designChallenge) {
      console.error('[DESIGNER ROLE PLAY API] Missing design challenge');
      return NextResponse.json(
        { error: 'Design challenge is required' },
        { status: 400 }
      );
    }

    // System prompt for the designer role play
    const systemPrompt = `You are an experienced professional product designer specializing in creating innovative solutions to complex problems. You approach design challenges with a structured thinking process, considering user needs, context, constraints, and opportunities. You think through problems step by step, focusing on user-centered design principles.

Your task is to think through the given design challenge as if you were solving it in real time, and provide:

1. A detailed thinking process that shows your approach to understanding and solving the design challenge
2. A set of main insights or design decisions that would form the core of your solution

The thinking process should be detailed and showcase your thought process, including:
- How you understand and frame the problem
- Key questions you ask yourself
- How you might research the problem
- How you identify user needs and pain points
- Your ideation and brainstorming process
- How you evaluate and refine potential solutions
- Any challenges you identify and how you might address them

The design decisions should be concrete, actionable points that represent the key components of your solution.`;

    // User prompt with the design challenge
    const userPrompt = `Design Challenge: ${designChallenge}

Please show your complete thinking process as you work through this design challenge, and then provide the key design decisions you would make to solve it.`;

    // Call OpenAI API
    console.log('[DESIGNER ROLE PLAY API] Calling OpenAI API');
    const openaiStartTime = Date.now();
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 2000
    });
    
    const openaiDuration = Date.now() - openaiStartTime;
    console.log(`[DESIGNER ROLE PLAY API] OpenAI API call completed in ${openaiDuration}ms`);

    // Extract response
    const responseText = completion.choices[0]?.message?.content || '';
    console.log('[DESIGNER ROLE PLAY API] Response received', {
      responseLength: responseText.length,
      responsePreview: responseText.substring(0, 100) + '...'
    });

    // Process the response into thinking process and decisions
    console.log('[DESIGNER ROLE PLAY API] Processing response into thinking and decisions');
    const processingStartTime = Date.now();
    
    let thinking: string[] = [];
    let decisions: string[] = [];

    // Parse the response text
    const thinkingMatch = responseText.match(/(?:Thinking Process|Thinking|Process):(.*?)(?:Design Decisions|Key Design Decisions|Main Insights|Design Decision):/s);
    const decisionsMatch = responseText.match(/(?:Design Decisions|Key Design Decisions|Main Insights|Design Decision):(.*?)(?:$|Conclusion)/s);

    if (thinkingMatch && thinkingMatch[1]) {
      // Split thinking into separate points
      thinking = thinkingMatch[1]
        .trim()
        .split(/\d+\.\s+|\n\s*\n+|\n-\s+/)
        .filter((item: string) => item.trim().length > 0)
        .map((item: string) => item.trim());
      
      console.log('[DESIGNER ROLE PLAY API] Successfully extracted thinking points', {
        count: thinking.length
      });
    } else {
      console.warn('[DESIGNER ROLE PLAY API] Failed to extract thinking points using regex');
    }

    if (decisionsMatch && decisionsMatch[1]) {
      // Split decisions into separate points
      decisions = decisionsMatch[1]
        .trim()
        .split(/\d+\.\s+|\n\s*\n+|\n-\s+/)
        .filter((item: string) => item.trim().length > 0)
        .map((item: string) => item.trim());
      
      console.log('[DESIGNER ROLE PLAY API] Successfully extracted decision points', {
        count: decisions.length
      });
    } else {
      console.warn('[DESIGNER ROLE PLAY API] Failed to extract decision points using regex');
    }

    // If parsing failed, fallback to manual splitting
    if (thinking.length === 0) {
      console.log('[DESIGNER ROLE PLAY API] Using full response as thinking');
      thinking = [responseText];
    }

    if (decisions.length === 0) {
      // Extract what seems to be decisions from the text
      console.log('[DESIGNER ROLE PLAY API] Attempting alternate decision extraction');
      
      const potentialDecisions = responseText.match(/(?:\d+\.\s+[A-Z].*?)(?:\.\s+|$)/g);
      if (potentialDecisions) {
        decisions = potentialDecisions.map((d: string) => d.trim());
        console.log('[DESIGNER ROLE PLAY API] Extracted decisions using alternate method', {
          count: decisions.length
        });
      } else {
        // If no structured decisions found, provide a default
        console.log('[DESIGNER ROLE PLAY API] Using default decision');
        decisions = ['Based on the designer\'s thinking process, a key design decision would be to address the core user needs.'];
      }
    }
    
    const processingDuration = Date.now() - processingStartTime;
    console.log(`[DESIGNER ROLE PLAY API] Processing completed in ${processingDuration}ms`);

    // Return the processed response
    const totalDuration = Date.now() - startTime;
    console.log(`[DESIGNER ROLE PLAY API] Request completed in ${totalDuration}ms`, {
      thinkingCount: thinking.length,
      decisionsCount: decisions.length
    });
    
    return NextResponse.json({
      thinking,
      decisions
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`[DESIGNER ROLE PLAY API] Error in designer role play API after ${duration}ms:`, error);
    return NextResponse.json(
      { error: error.message || 'An error occurred during designer role play' },
      { status: 500 }
    );
  }
} 