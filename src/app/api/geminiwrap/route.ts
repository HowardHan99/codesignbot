import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Logger } from '../../../utils/logger';

// Initialize Google Generative AI client
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY || '');

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
    const { userPrompt, systemPrompt, expectsJson = false } = body;

    if (!userPrompt || !systemPrompt) {
      return NextResponse.json(
        { error: 'Missing userPrompt or systemPrompt' },
        { status: 400 }
      );
    }

    if (!process.env.GOOGLE_GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'Gemini API key not configured' },
        { status: 500 }
      );
    }

    // Log request basics (without exposing full content for privacy)
    Logger.log('GEMINI-WRAPPER', `Gemini API request: model=gemini-1.5-flash`);
    Logger.log('GEMINI-WRAPPER', `System prompt length: ${systemPrompt.length}, User prompt length: ${userPrompt.length}`);
    
    // Log total input length for debugging
    const totalInputLength = systemPrompt.length + userPrompt.length;
    Logger.log('GEMINI-WRAPPER', `Total input length: ${totalInputLength} characters`);
    
    // Warn if input is very large
    if (totalInputLength > 50000) {
      Logger.warn('GEMINI-WRAPPER', `Very large input detected (${totalInputLength} chars) - may hit context limits`);
    }

    // Set timeout for Gemini requests (120 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    try {
      // Use Gemini model with good free tier support
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

      // Enhance the system prompt for JSON requests
      let enhancedSystemPrompt = systemPrompt;
      if (expectsJson) {
        enhancedSystemPrompt += `

CRITICAL JSON REQUIREMENTS:
- You MUST respond with valid JSON only
- Do NOT include any markdown formatting, code blocks, or explanations
- Do NOT use backticks or \`\`\`json formatting
- Start your response directly with { and end with }
- Ensure all strings are properly quoted
- Do not include any text before or after the JSON object

If you cannot provide the requested content due to any restrictions, respond with:
{"points": ["Content unavailable due to safety restrictions"]}`;
      }

      // Combine system prompt and user prompt for Gemini
      const combinedPrompt = `${enhancedSystemPrompt}\n\nUser request: ${userPrompt}`;

      Logger.log('GEMINI-WRAPPER', 'Sending request to Gemini', {
        combinedPromptLength: combinedPrompt.length,
        expectsJson,
        systemPromptLength: enhancedSystemPrompt.length,
        userPromptLength: userPrompt.length
      });

      // Configure generation settings based on whether JSON is expected
      const generationConfig: any = {
        maxOutputTokens: expectsJson ? 8192 : 4096, // Increased token limits for complex analysis
        temperature: 0.7,
      };

      // For JSON requests, use Gemini's structured output feature
      if (expectsJson) {
        generationConfig.responseMimeType = "application/json";
        // Add a basic JSON schema for our points structure
        generationConfig.responseSchema = {
          type: "object",
          properties: {
            points: {
              type: "array",
              items: {
                type: "string"
              },
              minItems: 4,
              maxItems: 4
            }
          },
          required: ["points"]
        };
      }
      
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: combinedPrompt }] }],
        generationConfig,
      });
      
      clearTimeout(timeoutId);
      
      const response = await result.response;
      
      // Enhanced response validation and logging
      Logger.log('GEMINI-WRAPPER', 'Raw Gemini response received', {
        hasResponse: !!response,
        hasText: !!response?.text,
        usageMetadata: response?.usageMetadata || 'none'
      });
      
      let assistantMessage = '';
      try {
        assistantMessage = response.text() || '';
      } catch (textError) {
        Logger.error('GEMINI-WRAPPER', 'Error extracting text from Gemini response:', textError);
        throw new Error('Failed to extract text from Gemini response');
      }
      
      // Validate that we got a non-empty response
      if (!assistantMessage || assistantMessage.trim() === '') {
        const finishReason = response?.candidates?.[0]?.finishReason || 'unknown';
        const safetyRatings = response?.candidates?.[0]?.safetyRatings || [];
        
        // Check if it was blocked by safety filters
        const wasBlocked = finishReason === 'SAFETY' || 
                          finishReason === 'RECITATION' || 
                          safetyRatings.some((rating: any) => rating.blocked === true);
        
        Logger.error('GEMINI-WRAPPER', 'Gemini returned empty response', {
          responseObject: response,
          finishReason,
          safetyRatings,
          wasBlocked,
          candidatesLength: response?.candidates?.length || 0
        });
        
        if (wasBlocked) {
          throw new Error(`Gemini blocked the request due to safety restrictions (${finishReason}). Try rephrasing your request to be less confrontational or controversial.`);
        } else {
          throw new Error(`Gemini returned empty response (finish reason: ${finishReason}). This may be due to API issues or the model being unable to generate content for this request.`);
        }
      }
      
      Logger.log('GEMINI-WRAPPER', 'Gemini response validation passed', {
        messageLength: assistantMessage.length,
        messagePreview: assistantMessage.substring(0, 200) + (assistantMessage.length > 200 ? '...' : ''),
        expectsJson
      });
      
      const processedResponse = processAiResponse(assistantMessage, expectsJson);
      
      // Additional validation for JSON responses
      if (expectsJson && processedResponse) {
        try {
          JSON.parse(processedResponse);
          Logger.log('GEMINI-WRAPPER', 'JSON response validation passed');
        } catch (jsonError) {
          Logger.warn('GEMINI-WRAPPER', 'JSON response validation failed, but continuing', {
            error: jsonError,
            processedResponse: processedResponse.substring(0, 500)
          });
        }
      }
      
      const duration = Date.now() - startTime;
      Logger.log('GEMINI-WRAPPER', `Gemini API request completed in ${duration}ms`);
      
      return NextResponse.json({ 
        response: processedResponse,
        timestamp: Date.now(),
        tokens: {
          prompt: response.usageMetadata?.promptTokenCount || 0,
          completion: response.usageMetadata?.candidatesTokenCount || 0,
          total: response.usageMetadata?.totalTokenCount || 0
        }
      });
    } catch (innerError: any) {
      clearTimeout(timeoutId);
      Logger.error('GEMINI-WRAPPER', 'Error during Gemini request:', innerError);
      
      if (innerError.name === 'AbortError') {
        return NextResponse.json(
          { error: 'Request timed out after 120 seconds' },
          { status: 408 }
        );
      }
      
      // Handle Gemini API specific errors
      if (innerError.status) {
        return NextResponse.json(
          { error: `Gemini API error: ${innerError.message}` },
          { status: innerError.status }
        );
      }
      
      throw innerError; // Re-throw for the outer catch
    }
  } catch (error: any) {
    const duration = Date.now() - startTime;
    Logger.error('GEMINI-WRAPPER', `Error in Gemini wrapper (${duration}ms):`, error);
    
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
} 