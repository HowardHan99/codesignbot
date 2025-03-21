import { OpenAIService } from './openaiService';
import { ConfigurationService } from './configurationService';
import { MiroFrameService } from './miro/frameService';
import { Frame, StickyNote } from '@mirohq/websdk-types';
import { MiroService } from './miroService';
import { ProcessedDesignPoint } from '../types/common';

type StickyNoteColor = 'light_yellow' | 'light_green' | 'light_blue' | 'light_pink';

export class TranscriptProcessingService {
  /**
   * Process raw transcript into meaningful design proposals
   */
  static async processTranscript(transcript: string): Promise<ProcessedDesignPoint[]> {
    const systemPrompt = `You are a transcript formatter. Your task is to break the raw transcript into meaningful segments.
    
    Rules:
    1. DO NOT summarize or change the content
    2. DO NOT translate or rephrase
    3. Split the text into logical segments at natural break points
    4. Each segment MUST be a complete thought or statement (at least one full sentence)
    5. Only fix basic punctuation and capitalization if needed
    6. Combine very short, related statements into a single segment
    7. Minimum segment length should be around 15-20 words to ensure meaningful content
    
    Format each segment as:
    content: [The exact transcript segment with basic punctuation]
    category: [General]

    Example:
    If input is: "yeah so basically what we're doing here is looking at the user flow right and then we need to think about how they navigate these screens and what problems they might face during this process"
    
    Output should be:
    content: Yeah, so basically what we're doing here is looking at the user flow, and then we need to think about how they navigate these screens and what problems they might face during this process.
    category: General

    BAD example (too short/split unnecessarily):
    content: Yeah, so basically what we're doing here.
    category: General
    content: We are looking at the user flow.
    category: General`;

    try {
      console.log('Processing transcript:', {
        transcriptLength: transcript.length,
        transcriptPreview: transcript.substring(0, 100) + '...'
      });

      // Only remove basic filler sounds, keep all other words
      const cleanedTranscript = transcript
        .replace(/\b(um|uh)\b/gi, '')  // Only remove filler sounds
        .replace(/\s+/g, ' ')  // Normalize whitespace
        .trim();

      console.log('Cleaned transcript:', {
        originalLength: transcript.length,
        cleanedLength: cleanedTranscript.length,
        cleanedPreview: cleanedTranscript.substring(0, 100) + '...'
      });

      // Make direct request to OpenAI
      const response = await fetch('/api/openaiwrap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userPrompt: cleanedTranscript,
          systemPrompt,
          useGpt4: true
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to process transcript');
      }

      const result = await response.json();
      console.log('OpenAI response received:', {
        responseLength: result.response.length,
        responsePreview: result.response.substring(0, 100) + '...'
      });

      // Parse and validate the response
      const proposals = result.response
        .split('\n\n')
        .filter((block: string) => block.trim())
        .map((block: string) => {
          const lines = block.split('\n');
          const proposal: ProcessedDesignPoint = {
            proposal: '',
            category: 'General'
          };

          lines.forEach((line: string) => {
            const [key, value] = line.split(': ').map((s: string) => s.trim());
            if (key && value) {
              switch(key.toLowerCase()) {
                case 'content':
                  proposal.proposal = value;  // Keep content exactly as is
                  break;
                case 'category':
                  proposal.category = 'General';  // Always use General category
                  break;
              }
            }
          });

          return proposal;
        })
        // Filter out segments that are too short (less than ~15 words)
        .filter((p: ProcessedDesignPoint) => {
          const wordCount = p.proposal.split(/\s+/).length;
          return p.proposal.length > 0 && wordCount >= 15;
        });

      console.log('Final segments:', {
        count: proposals.length,
        proposals: proposals.map((p: ProcessedDesignPoint) => ({
          preview: p.proposal.substring(0, 50) + '...',
          wordCount: p.proposal.split(/\s+/).length
        }))
      });

      return proposals;
    } catch (error) {
      console.error('Error in transcript processing:', error);
      return [];
    }
  }

  /**
   * Create Miro sticky notes from processed design points
   */
  static async createDesignProposalStickies(
    proposals: ProcessedDesignPoint[],
    frameTitle: string = 'ProposalDialogue'
  ): Promise<void> {
    // Use the MiroService to create sticky notes in a grid layout
    await MiroService.createStickiesFromPoints(proposals, frameTitle);
  }
}

// Helper function to get colors based on category
function getColorForCategory(category?: string): StickyNoteColor {
  switch (category?.toLowerCase()) {
    case 'ui':
      return 'light_yellow';
    case 'ux':
      return 'light_green';
    case 'technical':
      return 'light_blue';
    case 'response':
      return 'light_blue';
    default:
      return 'light_yellow'; // Default to yellow for design decisions
  }
} 