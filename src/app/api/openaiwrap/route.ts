import { NextRequest, NextResponse } from 'next/server';
import { OpenAI } from 'openai';

// Initialize OpenAI API client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const runtime = 'edge'; // Add edge runtime
export const dynamic = 'force-dynamic'; // No caching

/**
 * Helper function to extract JSON from responses that might be formatted as markdown
 */
function extractJsonFromMarkdown(content: string): string {
  // Check if it's a markdown code block with json
  const jsonBlockMatch = content.match(/```(?:json)?\s*\n([\s\S]*?)```/);
  if (jsonBlockMatch && jsonBlockMatch[1]) {
    return jsonBlockMatch[1].trim();
  }
  
  // Look for content that appears to be a JSON object or array
  const jsonMatch = content.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
  if (jsonMatch && jsonMatch[1]) {
    return jsonMatch[1].trim();
  }
  
  return content;
}

/**
 * Helper function to process an AI response
 * - Extract JSON from markdown if needed for JSON-expecting clients
 */
function processAiResponse(content: string, expectsJson: boolean = false): string {
  if (!content) return '';
  
  // For JSON-expecting clients, try to extract valid JSON
  if (expectsJson) {
    return extractJsonFromMarkdown(content);
  }
  
  return content;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  try {
    const body = await request.json();
    const { userPrompt, systemPrompt, isVisionRequest, useGpt4, expectsJson = false } = body;

    if (!userPrompt || !systemPrompt) {
      return NextResponse.json(
        { error: 'Missing userPrompt or systemPrompt' },
        { status: 400 }
      );
    }

    // Log request basics (without exposing full content for privacy)
    console.log(`OpenAI API request: model=${useGpt4 ? 'gpt-4o-mini' : 'gpt-3.5-turbo'}, isVisionRequest=${isVisionRequest}`);
    console.log(`System prompt length: ${systemPrompt.length}, User prompt length: ${userPrompt.length}`);

    // Set timeout for OpenAI requests (120 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    try {
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

        clearTimeout(timeoutId);
        const assistantMessage = response.choices[0]?.message?.content || 'No response';
        const processedResponse = processAiResponse(assistantMessage, expectsJson);
        
        const duration = Date.now() - startTime;
        console.log(`OpenAI API request completed in ${duration}ms`);
        
        return NextResponse.json({ 
          response: processedResponse,
          timestamp: Date.now(),
          tokens: {
            prompt: response.usage?.prompt_tokens || 0,
            completion: response.usage?.completion_tokens || 0,
            total: response.usage?.total_tokens || 0
          }
        });
      }

      // Enhance the system prompt for JSON requests
      let enhancedSystemPrompt = systemPrompt;
      if (expectsJson) {
        enhancedSystemPrompt += '\n\nIMPORTANT: Return ONLY the raw JSON without any markdown formatting, code blocks, or explanation.';
      }

      const response = await openai.chat.completions.create({
        model: useGpt4 ? 'gpt-4o-mini' : 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: enhancedSystemPrompt },
          { role: 'user', content: userPrompt },
        ],
      });

      clearTimeout(timeoutId);
      const assistantMessage = response.choices[0]?.message?.content || 'No response';
      const processedResponse = processAiResponse(assistantMessage, expectsJson);
      
      const duration = Date.now() - startTime;
      console.log(`OpenAI API request completed in ${duration}ms`);
      
      return NextResponse.json({ 
        response: processedResponse,
        timestamp: Date.now(),
        tokens: {
          prompt: response.usage?.prompt_tokens || 0,
          completion: response.usage?.completion_tokens || 0,
          total: response.usage?.total_tokens || 0
        }
      });
    } catch (innerError: any) {
      clearTimeout(timeoutId);
      console.error('Error during OpenAI request:', innerError);
      
      if (innerError.name === 'AbortError') {
        return NextResponse.json(
          { error: 'Request timed out after 120 seconds' },
          { status: 408 }
        );
      }
      
      // Handle OpenAI API specific errors
      if (innerError.status) {
        return NextResponse.json(
          { error: `OpenAI API error: ${innerError.message}` },
          { status: innerError.status }
        );
      }
      
      throw innerError; // Re-throw for the outer catch
    }
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`Error in OpenAI wrapper (${duration}ms):`, error);
    
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
} 