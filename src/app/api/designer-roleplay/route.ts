import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { DesignerModelType } from '../../../services/designerRolePlayService';

// Initialize OpenAI API with environment variables
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Anthropic API with environment variables
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  defaultHeaders: {
    'anthropic-version': '2023-06-01'
  }
});

// System prompt for the designer role play
const DESIGNER_SYSTEM_PROMPT = `You are an experienced professional product designer specializing in creating innovative solutions to complex problems. You approach design challenges with a structured thinking process, considering user needs, context, constraints, and opportunities. You think through problems step by step, focusing on user-centered design principles.

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
    const { designChallenge, type, modelType = DesignerModelType.GPT4 } = requestData;
    
    console.log('[DESIGNER ROLE PLAY API] Request data parsed', {
      challengeLength: designChallenge?.length || 0,
      challengePreview: designChallenge?.substring(0, 100) + (designChallenge?.length > 100 ? '...' : '') || 'none',
      type: type || 'not specified',
      modelType
    });

    // Validate request
    if (!designChallenge) {
      console.error('[DESIGNER ROLE PLAY API] Missing design challenge');
      return NextResponse.json(
        { error: 'Design challenge is required' },
        { status: 400 }
      );
    }

    // User prompt with the design challenge
    const userPrompt = `Design Challenge: ${designChallenge}

Please show your complete thinking process as you work through this design challenge, and then provide the key design decisions you would make to solve it.`;

    let responseText = '';
    let thinking: string[] = [];
    let decisions: string[] = [];
    
    // Call appropriate AI model based on modelType
    try {
      if (modelType === DesignerModelType.CLAUDE) {
        console.log('[DESIGNER ROLE PLAY API] Calling Claude API');
        const claudeStartTime = Date.now();
        
        try {
          // Log the API key presence (not the actual key)
          console.log('[DESIGNER ROLE PLAY API] Anthropic API Key present:', !!process.env.ANTHROPIC_API_KEY);
          
          // Only use Claude 3.7 Sonnet with thinking process
          const model = 'claude-3-7-sonnet-20250219';  
          console.log(`[DESIGNER ROLE PLAY API] Using Claude model: ${model}`);
          
          // Configure the API call
          let params: any = {
            model: model,
            max_tokens: 8000,
            system: DESIGNER_SYSTEM_PROMPT,
            messages: [
              { 
                role: 'user', 
                content: [
                  {
                    type: 'text',
                    text: userPrompt
                  }
                ]
              }
            ],
            thinking: { 
              type: 'enabled', 
              budget_tokens: 4000 
            }
          };
          
          // Start timing the processing
          const processingStartTime = Date.now();
          
          // Make the API call with appropriate parameters
          console.log(`[DESIGNER ROLE PLAY API] Making Claude API call with params:`, {
            model: params.model,
            max_tokens: params.max_tokens,
            thinkingEnabled: !!params.thinking,
            messageLengthChars: userPrompt.length
          });

          const completion = await anthropic.messages.create(params);

          // Log the full API response (with sensitive info redacted)
          console.log('[DESIGNER ROLE PLAY API] Raw Claude API response received:', {
            id: completion.id,
            model: completion.model,
            type: completion.type,
            role: completion.role,
            content_blocks: completion.content?.map(block => ({
              type: block.type,
              text_length: block.type === 'text' ? (block as any).text?.length || 0 : 0,
              thinking_length: block.type === 'thinking' ? (block as any).thinking?.length || 0 : 0,
              has_signature: block.type === 'thinking' && 'signature' in block
            }))
          });
          
          // Log content blocks information
          if (completion.content) {
            console.log(`[DESIGNER ROLE PLAY API] Received ${completion.content.length} content blocks`);
            
            // Log types of all blocks
            const blockTypes = completion.content.map(block => block.type);
            console.log('[DESIGNER ROLE PLAY API] Content block types:', blockTypes);
            
            // Log thinking blocks specifically
            const thinkingBlocks = completion.content.filter(block => block.type === 'thinking');
            console.log(`[DESIGNER ROLE PLAY API] Found ${thinkingBlocks.length} thinking blocks`);
            
            if (thinkingBlocks.length > 0) {
              // Log a preview of the first thinking block
              const firstThinking = thinkingBlocks[0];
              console.log('[DESIGNER ROLE PLAY API] First thinking block preview:', {
                type: firstThinking.type,
                raw_preview: JSON.stringify(firstThinking).substring(0, 200) + '...'
              });
            }
          }
          
          // Extract thinking content from the response
          let thinkingContent = '';
          try {
            if (completion.content) {
              // Get thinking blocks
              const thinkingBlocks = completion.content.filter(block => block.type === 'thinking');
              console.log(`[DESIGNER ROLE PLAY API] Processing ${thinkingBlocks.length} thinking blocks`);
              
              if (thinkingBlocks.length > 0) {
                // Extract thinking content directly from the block text
                thinkingContent = thinkingBlocks
                  .map(block => {
                    // Log the block structure for debugging
                    console.log('[DESIGNER ROLE PLAY API] Thinking block structure:', 
                      JSON.stringify(block).substring(0, 300) + '...');
                    
                    // Access the thinking property from the block
                    // Claude 3.7 thinking blocks have their content in a property called 'thinking'
                    return (block as any).thinking || '';
                  })
                  .filter(content => content.length > 0)
                  .join('\n\n');
                
                console.log(`[DESIGNER ROLE PLAY API] Combined thinking content length: ${thinkingContent.length} characters`);
                console.log('[DESIGNER ROLE PLAY API] Thinking content preview:', thinkingContent.substring(0, 150) + '...');
              } else {
                console.log('[DESIGNER ROLE PLAY API] No thinking blocks found in response');
              }
            }
          } catch (error) {
            console.error('[DESIGNER ROLE PLAY API] Error extracting thinking content:', error);
            if (error instanceof Error) {
              console.error('Error details:', error.message);
              console.error('Error stack:', error.stack);
            }
          }

          // Process the thinking content
          const thinkingPoints = [];
          if (thinkingContent && typeof thinkingContent === 'string') {
            console.log('[DESIGNER ROLE PLAY API] Processing thinking content');
            try {
              // Clean the heading if present
              thinkingContent = thinkingContent.replace(/^## Thinking\s*/i, '').trim();
              
              // Split the thinking content into points
              const points = thinkingContent
                .split(/\n(?=-|\d+\.)/)
                .map(point => point.trim())
                .filter(point => point.length > 0);
              
              console.log(`[DESIGNER ROLE PLAY API] Extracted ${points.length} thinking points`);
              if (points.length > 0) {
                console.log('[DESIGNER ROLE PLAY API] First thinking point:', points[0]);
              }
              
              thinkingPoints.push(...points);
            } catch (error) {
              console.error('[DESIGNER ROLE PLAY API] Error processing thinking points:', error);
              // Fallback - use the raw thinking content as a single point
              if (thinkingContent.trim().length > 0) {
                thinkingPoints.push(thinkingContent.trim());
              }
            }
          } else {
            console.log('[DESIGNER ROLE PLAY API] No valid thinking content to process');
          }

          // Extract text content (may include both thinking and design decisions)
          const text = completion.content
            ?.filter(block => block.type === 'text')
            ?.map(block => (block as any).text)
            ?.join('\n') || '';

          console.log(`[DESIGNER ROLE PLAY API] Text content length: ${text.length} characters`);
          console.log('[DESIGNER ROLE PLAY API] Text content preview:', text.substring(0, 150) + '...');

          // Extract design decisions section
          let designDecisions = [];
          try {
            console.log('[DESIGNER ROLE PLAY API] Attempting to extract design decisions');
            
            // Try to extract design decisions using regex
            const designDecisionsMatch = text.match(/## Design Decisions[\s\S]*?$/i);
            if (designDecisionsMatch) {
              console.log('[DESIGNER ROLE PLAY API] Found design decisions section via regex');
              
              // Log the raw decisions section
              const rawDecisions = designDecisionsMatch[0];
              console.log('[DESIGNER ROLE PLAY API] Raw decisions section preview:', 
                rawDecisions.substring(0, 150) + (rawDecisions.length > 150 ? '...' : ''));
              
              // Clean the heading and split into points
              const decisionsText = rawDecisions.replace(/^## Design Decisions\s*/i, '').trim();
              const decisions = decisionsText
                .split(/\n(?=-|\d+\.)/)
                .map(d => d.trim())
                .filter(d => d.length > 0);
              
              console.log(`[DESIGNER ROLE PLAY API] Extracted ${decisions.length} design decisions`);
              if (decisions.length > 0) {
                console.log('[DESIGNER ROLE PLAY API] First design decision:', decisions[0]);
              }
              
              designDecisions = decisions;
            } else {
              console.log('[DESIGNER ROLE PLAY API] No design decisions section found via regex, using fallback');
              
              // Fallback: If we can't extract the Design Decisions section with regex,
              // use the entire text as designDecisions if we have thinking content separately
              if (thinkingPoints.length > 0) {
                console.log('[DESIGNER ROLE PLAY API] Using fallback: using entire text as design decisions');
                designDecisions = [text];
              } else {
                // If no thinking content was found separately, try to extract design decisions
                // by assuming second half of content is design decisions
                console.log('[DESIGNER ROLE PLAY API] Using fallback: splitting content in half');
                const lines = text.split('\n');
                const midPoint = Math.floor(lines.length / 2);
                const secondHalf = lines.slice(midPoint).join('\n');
                designDecisions = [secondHalf];
              }
            }
          } catch (error) {
            console.error('[DESIGNER ROLE PLAY API] Error extracting design decisions:', error);
            if (error instanceof Error) {
              console.error('Error details:', error.message);
            }
            // Fallback for error case
            designDecisions = [text];
          }

          // Log the final extracted content
          const processingEndTime = Date.now();
          const processingDuration = processingEndTime - processingStartTime;
          console.log(`[DESIGNER ROLE PLAY API] Processing completed in ${processingDuration}ms`);
          console.log(`[DESIGNER ROLE PLAY API] Final thinking points: ${thinkingPoints.length}`);
          console.log(`[DESIGNER ROLE PLAY API] Final design decisions: ${designDecisions.length}`);
          
          // Log samples of each
          if (thinkingPoints.length > 0) {
            console.log('[DESIGNER ROLE PLAY API] Sample thinking point:', thinkingPoints[0]);
          }
          if (designDecisions.length > 0) {
            console.log('[DESIGNER ROLE PLAY API] Sample design decision:', designDecisions[0]);
          }

          // Set the thinking and decisions arrays
          thinking = thinkingPoints;
          decisions = designDecisions;

          const claudeDuration = Date.now() - claudeStartTime;
          console.log(`[DESIGNER ROLE PLAY API] Claude API call completed in ${claudeDuration}ms`);
        } catch (error) {
          // Enhanced error logging
          console.error('[DESIGNER ROLE PLAY API] Detailed Claude API error:', error);
          if (error instanceof Error) {
            console.error('Error message:', error.message);
            console.error('Error stack:', error.stack);
            
            // Parse error message for specific Claude API issues
            if (error.message.includes('thinking')) {
              console.error('[DESIGNER ROLE PLAY API] Claude API error related to thinking parameter');
              
              // If the error message contains JSON, try to extract and log it
              const jsonMatch = error.message.match(/\{.*\}/s);
              if (jsonMatch) {
                try {
                  const errorJson = JSON.parse(jsonMatch[0]);
                  console.error('[DESIGNER ROLE PLAY API] Extracted error JSON:', errorJson);
                } catch (e) {
                  console.error('[DESIGNER ROLE PLAY API] Failed to parse error JSON');
                }
              }
            }
            
            if (error.message.includes('max_tokens')) {
              console.error('[DESIGNER ROLE PLAY API] Claude API error related to token limits');
            }
            
            if (error.message.includes('budget_tokens')) {
              console.error('[DESIGNER ROLE PLAY API] Claude API error related to thinking budget');
            }
            
            if (error.message.includes('type:')) {
              console.error('[DESIGNER ROLE PLAY API] Claude API error related to object type');
            }
            
            if ('status' in error) {
              console.error('Error status:', (error as any).status);
              
              // Log specific HTTP error codes
              const status = (error as any).status;
              if (status === 400) {
                console.error('[DESIGNER ROLE PLAY API] Bad request error - check API parameters');
              } else if (status === 401) {
                console.error('[DESIGNER ROLE PLAY API] Authentication error - check API key');
              } else if (status === 403) {
                console.error('[DESIGNER ROLE PLAY API] Permission error - account may not have access');
              } else if (status === 404) {
                console.error('[DESIGNER ROLE PLAY API] Resource not found - check model name');
              } else if (status === 429) {
                console.error('[DESIGNER ROLE PLAY API] Rate limit error - too many requests');
              } else if (status >= 500) {
                console.error('[DESIGNER ROLE PLAY API] Claude service error - API issues');
              }
            }
            
            if ('error' in error) {
              const errorDetails = (error as any).error;
              console.error('[DESIGNER ROLE PLAY API] API Error Details:', JSON.stringify(errorDetails, null, 2));
            }
          }
          
          // Do not fall back to GPT-4, just propagate the error
          throw new Error(`Claude API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      } else {
        // Default to OpenAI GPT-4
    console.log('[DESIGNER ROLE PLAY API] Calling OpenAI API');
    const openaiStartTime = Date.now();
    
        try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
              { role: 'system', content: DESIGNER_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 2000
    });
          
          responseText = completion.choices[0]?.message?.content || '';
    
    const openaiDuration = Date.now() - openaiStartTime;
    console.log(`[DESIGNER ROLE PLAY API] OpenAI API call completed in ${openaiDuration}ms`);
        } catch (error) {
          console.error('[DESIGNER ROLE PLAY API] Error calling OpenAI API:', error);
          throw new Error('Failed to call OpenAI API: ' + (error as Error).message);
        }
      }
    } catch (error) {
      console.error('[DESIGNER ROLE PLAY API] Error with all model APIs:', error);
      throw error;
    }

    // Process the response into thinking process and decisions
    if (modelType !== DesignerModelType.CLAUDE) {
    console.log('[DESIGNER ROLE PLAY API] Processing response into thinking and decisions');
      
      // For GPT-4, extract thinking from the response text using regex
      console.log('[DESIGNER ROLE PLAY API] Attempting regex extraction');
    const thinkingMatch = responseText.match(/(?:Thinking Process|Thinking|Process):(.*?)(?:Design Decisions|Key Design Decisions|Main Insights|Design Decision):/s);

    if (thinkingMatch && thinkingMatch[1]) {
        console.log('[DESIGNER ROLE PLAY API] Found thinking section with regex');
        
      thinking = thinkingMatch[1]
        .trim()
        .split(/\d+\.\s+|\n\s*\n+|\n-\s+/)
        .filter((item: string) => item.trim().length > 0)
        .map((item: string) => item.trim());
      
        console.log('[DESIGNER ROLE PLAY API] Successfully extracted thinking points using regex', {
          count: thinking.length,
          firstPointPreview: thinking[0]?.substring(0, 100) + '...'
      });
    } else {
      console.warn('[DESIGNER ROLE PLAY API] Failed to extract thinking points using regex');
        console.log('[DESIGNER ROLE PLAY API] Response text preview:', responseText.substring(0, 300) + '...');
    }

      // Extract design decisions using regex
      console.log('[DESIGNER ROLE PLAY API] Attempting to extract design decisions using regex');
      const decisionsMatch = responseText.match(/(?:Design Decisions|Key Design Decisions|Main Insights|Design Decision):(.*?)(?:$|Conclusion)/s);

    if (decisionsMatch && decisionsMatch[1]) {
        console.log('[DESIGNER ROLE PLAY API] Found decisions section with regex');
        console.log('[DESIGNER ROLE PLAY API] Raw decisions section:', decisionsMatch[1].substring(0, 200) + '...');
        
      decisions = decisionsMatch[1]
        .trim()
        .split(/\d+\.\s+|\n\s*\n+|\n-\s+/)
        .filter((item: string) => item.trim().length > 0)
        .map((item: string) => item.trim());
      
      console.log('[DESIGNER ROLE PLAY API] Successfully extracted decision points', {
          count: decisions.length,
          decisions: decisions.map(d => d.substring(0, 50) + '...').join('\n')
      });
    } else {
      console.warn('[DESIGNER ROLE PLAY API] Failed to extract decision points using regex');
    }

    // If parsing failed, fallback to manual splitting
    if (thinking.length === 0) {
        console.log('[DESIGNER ROLE PLAY API] Using full response as thinking (fallback)');
      thinking = [responseText];
    }

    if (decisions.length === 0) {
      // Extract what seems to be decisions from the text
      console.log('[DESIGNER ROLE PLAY API] Attempting alternate decision extraction');
      
      const potentialDecisions = responseText.match(/(?:\d+\.\s+[A-Z].*?)(?:\.\s+|$)/g);
      if (potentialDecisions) {
          console.log('[DESIGNER ROLE PLAY API] Found potential decisions with alternate regex:', 
            potentialDecisions.length);
          
        decisions = potentialDecisions.map((d: string) => d.trim());
        console.log('[DESIGNER ROLE PLAY API] Extracted decisions using alternate method', {
            count: decisions.length,
            decisions: decisions.map(d => d.substring(0, 50) + '...').join('\n')
        });
      } else {
        // If no structured decisions found, provide a default
          console.log('[DESIGNER ROLE PLAY API] No decisions found, using default decision');
        decisions = ['Based on the designer\'s thinking process, a key design decision would be to address the core user needs.'];
        }
      }
    }
    
    // Final response preparation
    console.log('[DESIGNER ROLE PLAY API] Preparing final response', {
      thinkingCount: thinking.length,
      decisionsCount: decisions.length
    });

    // Return the processed response
    const totalDuration = Date.now() - startTime;
    console.log(`[DESIGNER ROLE PLAY API] Request completed in ${totalDuration}ms`, {
      thinkingCount: thinking.length,
      decisionsCount: decisions.length,
      thinkingSample: thinking.length > 0 ? thinking[0].substring(0, 100) + '...' : 'none',
      decisionsSample: decisions.length > 0 ? decisions[0].substring(0, 100) + '...' : 'none'
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