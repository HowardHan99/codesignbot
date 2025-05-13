import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { DesignerModelType } from '../../../services/designerRolePlayService';
import { GoogleGenerativeAI } from '@google/generative-ai';

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

// Initialize Google Gemini API
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY || '');

const gptmodel = 'o4-mini'

// System prompt for the first step (Thinking + Brainstorming)
const STEP_1_SYSTEM_PROMPT = `You are a professional designer. You approach design challenges with a structured thinking process and creative brainstorming.

Your task is to first think through the given design challenge step-by-step, and then generate multiple distinct design concept proposals based on your thinking.

1.  **Thinking Process:** Showcase your detailed thought process:
    *   How you understand the challenge,objectives and conditions.
    *   How you identify broad user needs and pain points.
    *   Your initial ideation that helps to solve the challenge considering the constrants and objectives.

2.  **Brainstorming Proposals:** Based on your thinking, generate at least 3 distinct design proposals. For each proposal, provide:
    *   A clear concept name or theme.
    *   The primary design goal or objective.
    *   3-5 key characteristics or features that define this approach and how it helps to solve the challenge.

Format your response clearly, separating the Thinking Process and Brainstorming Proposals sections. Use headings like '## Thinking Process' and '## Brainstorming Proposals'.`;

// Claude-specific prompt for Step 1 (Thinking + Brainstorming)
// Claude needs explicit instructions for the 'thinking' block and the final output format.
const CLAUDE_STEP_1_SYSTEM_PROMPT = `You are a professional designer. Your task is to think through the given design challenge and then brainstorm multiple design proposals.

YOUR THINKING PROCESS will be captured in the "thinking" section of your response. Explore:
- How you understand the challenge,objectives and conditions.
- How you identify broad user needs and pain points.
- Your initial ideation that helps to solve the challenge considering the constrants and objectives.  

YOUR RESPONSE should ONLY include the Brainstorming Proposals, presented under the heading "## Brainstorming Proposals". Generate at least 2 distinct proposals. For each proposal:
- **Concept Name/Theme:** [Name]
- **Goal:** [Objective] and how it helps to solve the challenge.
- **Characteristics:**
    - [Characteristic 1]
    - [Characteristic 2]
    - [Characteristic 3]
    - [...]

## Brainstorming Proposals

**Concept Name/Theme:** ...
**Goal:** ...
**Characteristics:**
- ...

**Concept Name/Theme:** ...
... and so on.`;

// System prompt for the second step (Final Decisions from Proposals)
const STEP_2_FINAL_DECISION_SYSTEM_PROMPT = `You are a professional designer tasked with synthesizing multiple design proposals into a single, concrete design solution.

Based on the provided design proposals, which represent different approaches to a design challenge, your task is to:

1.  **Evaluate:** Briefly evaluate the strengths and weaknesses of the different proposals.
2.  **Synthesize:** Combine the best elements or choose the most promising direction.
3.  **Define Solution:** Formulate a final, concrete design solution.

Your output should ONLY be the final design decisions, presented as clear, actionable bullet points under the heading '## Final Design Decisions'. These decisions should describe specific features, user flows, or design choices for the final solution.

## Final Design Decisions
- [First concrete feature or decision]
- [Second concrete feature or decision]
- [Third concrete feature or decision]
... and so on.`;

// System prompt for all models (GPT-O3, Gemini) - Use STEP_1 prompt
const GENERAL_SYSTEM_PROMPT = STEP_1_SYSTEM_PROMPT;

/**
 * Designer Role Play API Route
 * Step 1: Generates thinking process and brainstorming proposals.
 * Step 2: Generates final design decisions from proposals.
 */
export async function POST(request: NextRequest) {
  console.log('[DESIGNER ROLE PLAY API] Received request');
  const startTime = Date.now();
  
  try {
    const requestData = await request.json();
    const { designChallenge, type, modelType = DesignerModelType.GPT4 } = requestData;
    
    console.log('[DESIGNER ROLE PLAY API] Request data parsed', {
      challengeLength: designChallenge?.length || 0,
      challengePreview: designChallenge?.substring(0, 100) + (designChallenge?.length > 100 ? '...' : '') || 'none',
      type: type || 'not specified',
      modelType
    });

    if (!designChallenge) {
      console.error('[DESIGNER ROLE PLAY API] Missing design challenge');
      return NextResponse.json({ error: 'Design challenge is required' }, { status: 400 });
    }

    let thinking: string[] = [];
    let brainstormingProposals: string[] = [];
    let decisions: string[] = [];

    // --- STEP 1: Generate Thinking Process and Brainstorming Proposals --- 
    console.log('[DESIGNER ROLE PLAY API] Starting Step 1: Thinking & Proposals');
    const step1StartTime = Date.now();
    try {
      const step1UserPrompt = `Design Challenge: ${designChallenge}

Please first show your thinking process, then generate brainstorming proposals based on that process.`;
      let step1ResponseText = '';
      let step1ThinkingContent = ''; // For Claude

      if (modelType === DesignerModelType.CLAUDE) {
        console.log('[DESIGNER ROLE PLAY API] Calling Claude API for Step 1');
        const completion = await anthropic.messages.create({
          model: 'claude-3-7-sonnet-20250219', // Use a suitable model
          max_tokens: 8000,
          system: CLAUDE_STEP_1_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: step1UserPrompt }],
          thinking: { type: 'enabled', budget_tokens: 4000 }
        });

        // Extract thinking from thinking blocks
        const thinkingBlocks = completion.content?.filter(block => block.type === 'thinking') || [];
        step1ThinkingContent = thinkingBlocks.map(block => (block as any).thinking || '').join('\n');
        thinking = parseThinkingContent(step1ThinkingContent, 'Claude thinking block');

        // Extract proposals from text blocks (which should ONLY contain proposals based on prompt)
        step1ResponseText = completion.content
          ?.filter(block => block.type === 'text')
          ?.map(block => (block as any).text)
          ?.join('\n') || '';
        brainstormingProposals = parseBrainstormingProposals(step1ResponseText, 'Claude text block');

      } else {
        // For OpenAI and Gemini
        console.log(`[DESIGNER ROLE PLAY API] Calling ${gptmodel} API for Step 1`);
        if (modelType === DesignerModelType.GPT_O3) {
          const completion = await openai.chat.completions.create({
            model: gptmodel,
            messages: [
              { role: 'system', content: GENERAL_SYSTEM_PROMPT },
              { role: 'user', content: step1UserPrompt }
            ],
          });
          step1ResponseText = completion.choices[0]?.message?.content || '';
        } else if (modelType === DesignerModelType.GEMINI) {
          const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro-preview-03-25' });
          const prompt = `${GENERAL_SYSTEM_PROMPT}\n\n${step1UserPrompt}`;
          const result = await model.generateContent(prompt);
          step1ResponseText = (await result.response).text();
        } else { // Default to GPT-4
          const completion = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: [
              { role: 'system', content: GENERAL_SYSTEM_PROMPT },
              { role: 'user', content: step1UserPrompt }
            ],
            temperature: 0.7,
            max_tokens: 4000 // Increased max tokens
          });
          step1ResponseText = completion.choices[0]?.message?.content || '';
        }
        
        // Parse thinking and proposals from the single response
        thinking = parseThinkingContent(step1ResponseText, modelType);
        brainstormingProposals = parseBrainstormingProposals(step1ResponseText, modelType);
      }
      
      console.log(`[DESIGNER ROLE PLAY API] Step 1 completed in ${Date.now() - step1StartTime}ms`, {
        thinkingCount: thinking.length,
        proposalCount: brainstormingProposals.length,
        thinkingSample: thinking[0]?.substring(0, 100) + '...',
        proposalSample: brainstormingProposals[0]?.substring(0, 100) + '...'
      });

    } catch (error) {
      console.error(`[DESIGNER ROLE PLAY API] Error in Step 1 after ${Date.now() - step1StartTime}ms:`, error);
      // Decide if we should stop or try to proceed with defaults
      // For now, let's throw to indicate failure
      throw new Error(`Step 1 failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // --- STEP 2: Generate Final Design Decisions from Proposals --- 
    console.log('[DESIGNER ROLE PLAY API] Starting Step 2: Final Decisions');
    const step2StartTime = Date.now();
    if (brainstormingProposals.length > 0) {
      try {
        const step2UserPrompt = `Here are the design proposals generated earlier:

${brainstormingProposals.map((p, i) => `Proposal ${i + 1}:\n${p}`).join('\n\n')}

Please evaluate these proposals and synthesize them into a single, concrete design solution, providing only the final design decisions.`;
        
        let step2ResponseText = '';

        // Use the same model type as Step 1 for consistency
        if (modelType === DesignerModelType.CLAUDE) {
          console.log('[DESIGNER ROLE PLAY API] Calling Claude API for Step 2');
          const completion = await anthropic.messages.create({
            model: 'claude-3-7-sonnet-20250219', 
            max_tokens: 2000, 
            system: STEP_2_FINAL_DECISION_SYSTEM_PROMPT,
            messages: [{ role: 'user', content: step2UserPrompt }]
            // No 'thinking' needed for step 2
          });
          step2ResponseText = completion.content
            ?.filter(block => block.type === 'text')
            ?.map(block => (block as any).text)
            ?.join('\n') || '';
        } else {
          console.log(`[DESIGNER ROLE PLAY API] Calling ${gptmodel} API for Step 2`);
          if (modelType === DesignerModelType.GPT_O3) {
            const completion = await openai.chat.completions.create({
              model: gptmodel,
              messages: [
                { role: 'system', content: STEP_2_FINAL_DECISION_SYSTEM_PROMPT },
                { role: 'user', content: step2UserPrompt }
              ],
            });
            step2ResponseText = completion.choices[0]?.message?.content || '';
          } else if (modelType === DesignerModelType.GEMINI) {
            const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro-preview-03-25' });
            const prompt = `${STEP_2_FINAL_DECISION_SYSTEM_PROMPT}\n\n${step2UserPrompt}`;
            const result = await model.generateContent(prompt);
            step2ResponseText = (await result.response).text();
          } else { // Default to GPT-4
            const completion = await openai.chat.completions.create({
              model: 'gpt-4',
              messages: [
                { role: 'system', content: STEP_2_FINAL_DECISION_SYSTEM_PROMPT },
                { role: 'user', content: step2UserPrompt }
              ],
              temperature: 0.6,
              max_tokens: 2000
            });
            step2ResponseText = completion.choices[0]?.message?.content || '';
          }
        }
        
        // Parse final decisions from the response
        decisions = parseFinalDecisions(step2ResponseText, modelType);

        console.log(`[DESIGNER ROLE PLAY API] Step 2 completed in ${Date.now() - step2StartTime}ms`, {
          decisionCount: decisions.length,
          decisionSample: decisions[0]?.substring(0, 100) + '...'
        });

      } catch (error) {
        console.error(`[DESIGNER ROLE PLAY API] Error in Step 2 after ${Date.now() - step2StartTime}ms:`, error);
        // Provide default decisions if step 2 fails but step 1 succeeded
        decisions = ["Based on the generated proposals, a synthesized design approach is recommended, focusing on core user needs identified in the thinking process."];
      }
    } else {
      console.warn('[DESIGNER ROLE PLAY API] Skipping Step 2 as no brainstorming proposals were generated in Step 1.');
      decisions = ["No brainstorming proposals were generated. Default decision: Focus on addressing the core user needs from the initial thinking process."];
    }

    // --- Final Response Preparation --- 
    console.log('[DESIGNER ROLE PLAY API] Preparing final response', {
      thinkingCount: thinking.length,
      brainstormingCount: brainstormingProposals.length,
      decisionsCount: decisions.length
    });

    const totalDuration = Date.now() - startTime;
    console.log(`[DESIGNER ROLE PLAY API] Request completed in ${totalDuration}ms`, {
      thinkingCount: thinking.length,
      brainstormingCount: brainstormingProposals.length,
      decisionsCount: decisions.length,
      thinkingSample: thinking.length > 0 ? thinking[0].substring(0, 100) + '...' : 'none',
      brainstormingSample: brainstormingProposals.length > 0 ? brainstormingProposals[0].substring(0, 100) + '...' : 'none',
      decisionsSample: decisions.length > 0 ? decisions[0].substring(0, 100) + '...' : 'none'
    });
    
    return NextResponse.json({
      thinking,
      brainstormingProposals,
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

// --- Helper Parsing Functions ---

function parseThinkingContent(responseText: string, source: string): string[] {
  console.log(`[Parsing Helper] Attempting to parse thinking content from ${source}`);
  if (!responseText || responseText.trim().length === 0) return [];
  
  // Try extracting section based on heading for non-Claude sources
  let thinkingText = responseText;
  if (!source.includes('Claude')) {
    const thinkingMatch = responseText.match(/(?:## Thinking Process|Thinking Process:|Thinking:)(.*?)(?:## Brainstorming Proposals|Brainstorming Proposals:|## Design Decisions|Design Decisions:)/si);
    if (thinkingMatch && thinkingMatch[1]) {
        console.log(`[Parsing Helper] Found thinking section via regex for ${source}`);
        thinkingText = thinkingMatch[1].trim();
    } else {
        console.warn(`[Parsing Helper] Could not find dedicated thinking section via regex for ${source}. Using full text.`);
        // Fallback: If no clear section, assume the first part might be thinking, before proposals/decisions
        const firstProposalMatch = responseText.search(/(?:## Brainstorming Proposals|Brainstorming Proposals:|## Design Decisions|Design Decisions:)/si);
        if (firstProposalMatch > 0) {
          thinkingText = responseText.substring(0, firstProposalMatch).trim();
        }
        // If still nothing, use the whole text (might get mixed results)
    }
  }

  // Preserve section headers and structure by properly processing the text
  const processedThinking: string[] = [];
  
  // Split the text into lines first to properly identify section headers and content
  const lines = thinkingText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  // Process line by line to identify headers and content
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check if the line is a section header
    if (line.match(/^(#{1,3}|[A-Z][A-Za-z\s]+:|\*\*[^*]+\*\*)/)) {
      // This is a section header - add as is
      processedThinking.push(line);
    } 
    // Check if it's a bullet point list item
    else if (line.match(/^(\d+\.|[-•*]|\u2022)\s/)) {
      // This is a list item - preserve the bullet format
      processedThinking.push(line);
    } 
    // Otherwise, it's regular content
    else if (line.length > 5) {
      // If it's not attached to a previous line, add as a new entry
      processedThinking.push(line);
    }
  }

  if (processedThinking.length > 0) {
    console.log(`[Parsing Helper] Extracted ${processedThinking.length} thinking elements from ${source}`);
    return processedThinking;
  } else {
    // Fallback if the processing failed
    console.warn(`[Parsing Helper] Structured processing failed for ${source}. Falling back to paragraph splitting.`);
    const paragraphs = thinkingText.split(/\n\s*\n+/).filter(p => p.trim().length > 5);
    return paragraphs.length > 0 ? paragraphs : [thinkingText];
  }
}

function parseBrainstormingProposals(responseText: string, source: string): string[] {
  console.log(`[Parsing Helper] Attempting to parse brainstorming proposals from ${source}`);
  if (!responseText || responseText.trim().length === 0) return [];

  // Extract the section explicitly titled "Brainstorming Proposals"
  const proposalsMatch = responseText.match(/(?:## Brainstorming Proposals|Brainstorming Proposals:)(.*?)(?:$|## Final Design Decisions|Final Design Decisions:)/si);
  let proposalsText = '';

  if (proposalsMatch && proposalsMatch[1]) {
    console.log(`[Parsing Helper] Found brainstorming section via regex for ${source}`);
    proposalsText = proposalsMatch[1].trim();
  } else {
    console.warn(`[Parsing Helper] Could not find dedicated brainstorming section via regex for ${source}. Using full text (might include thinking/decisions).`);
    proposalsText = responseText.trim(); // Use the whole text as fallback
  }

  if (proposalsText.length === 0) {
    console.warn(`[Parsing Helper] No text found for brainstorming proposals from ${source}.`);
    return [];
  }
  
  // Split proposals based on common patterns like "Concept Name/Theme:", "Proposal X:", or double newlines if structure is simple
  const proposalSeparators = /\n(?:\*\*Concept Name\/Theme:|\*\*Proposal \d+:|Concept \d+:|Approach \d+:|---)\s*\n|\n\s*\n+/g;
  
  let proposals = proposalsText
    .split(proposalSeparators)
    .map(p => p.trim())
    .filter(p => p.length > 10 && (p.includes('Goal:') || p.includes('Characteristics:') || p.includes('Key Features:'))); // Filter for likely proposals

  // If splitting by detailed separators fails, try splitting just by major headings
  if (proposals.length < 2) {
    const conceptHeaderPattern = /(?:\*\*Concept Name\/Theme:|\*\*Proposal \d+:|Concept \d+:|Approach \d+:)/gi;
    proposals = proposalsText
      .split(conceptHeaderPattern)
      .map(p => p.trim())
      .filter(p => p.length > 10);
  }

  // If still few proposals, maybe the structure is just paragraphs? Try splitting by double newline again on the extracted text.
  if (proposals.length < 2) {
    proposals = proposalsText.split(/\n\s*\n+/).filter(p => p.trim().length > 10);
  }

  console.log(`[Parsing Helper] Extracted ${proposals.length} brainstorming proposals from ${source}`);
  return proposals;
}

function parseFinalDecisions(responseText: string, source: string): string[] {
  console.log(`[Parsing Helper] Attempting to parse final decisions from ${source}`);
  if (!responseText || responseText.trim().length === 0) return [];

  // Extract the section explicitly titled "Final Design Decisions"
  let decisionsText = responseText;
  const decisionsMatch = responseText.match(/(?:## Final Design Decisions|Final Design Decisions:)(.*)/si);
  if (decisionsMatch && decisionsMatch[1]) {
    console.log(`[Parsing Helper] Found final decisions section via regex for ${source}`);
    decisionsText = decisionsMatch[1].trim();
  } else {
    console.warn(`[Parsing Helper] Could not find dedicated final decisions section via regex for ${source}. Using full text.`);
  }

  // Split into points (usually bulleted or numbered)
  const points = decisionsText
    .split(/\n(?:\d+\. |\* |- |\u2022 )/g) // Split by numbered/bullet points on new lines
    .map(p => p.trim().replace(/^(## Final Design Decisions|Final Design Decisions:)/i, '').trim()) // Clean up point text
    .filter(p => p.length > 5); // Filter out very short/empty lines

  if (points.length > 0) {
    console.log(`[Parsing Helper] Extracted ${points.length} final decision points from ${source}`);
    return points;
  } else {
     // Fallback: Split by double newline if list parsing fails
     const paragraphs = decisionsText.split(/\n\s*\n+/).filter(p => p.trim().length > 5);
     if (paragraphs.length > 0) {
       console.log(`[Parsing Helper] Extracted ${paragraphs.length} final decision paragraphs as fallback from ${source}`);
       return paragraphs;
     } else {
       console.warn(`[Parsing Helper] No structured final decisions found for ${source}. Returning single block.`);
       return [decisionsText]; // Return the whole block if no structure found
     }
  }
} 