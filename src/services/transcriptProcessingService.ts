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
    // CONFIGURABLE: System prompt for transcript formatting
    // Adjust these rules to control how transcripts are formatted into sticky notes
    const systemPrompt = `You are a transcript formatter. Your task is to convert raw transcript text into meaningful content for sticky notes.
    
    Rules:
    1. Preserve the original meaning without summarizing or changing the content
    2. Only split the text if necessary for clarity or if it contains distinct topics
    3. Each segment must be a complete, coherent thought
    4. Length guidelines: Aim for 150-250 characters per segment, but prioritize preserving the full thought
    5. Only split at natural break points (topic shifts, completed thoughts)
    6. Fix punctuation and remove filler words
    7. Do not artificially create multiple segments if the content is best understood as a single unit
    8. If the original text is already a single coherent point, keep it as one segment
    
    Format each segment as:
    content: [The formatted segment]
    category: [General]`;

    try {
      console.log('Processing transcript:', {
        length: transcript.length,
        preview: transcript.substring(0, 50) + '...'
      });

      // Only remove basic filler sounds, keep all other words
      // CONFIGURABLE: Filler words to remove from transcript
      const cleanedTranscript = transcript
        .replace(/\b(um|uh|hmm|like)\b/gi, '')  // Remove common fillers
        .replace(/\s+/g, ' ')  // Normalize whitespace
        .trim();

      // Make direct request to OpenAI
      const response = await fetch('/api/openaiwrap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // CONFIGURABLE: User prompt for formatting transcript
          userPrompt: `Format this text into clear, coherent segments for sticky notes, preserving complete thoughts and logical flow: ${cleanedTranscript}`,
          systemPrompt,
          useGpt4: true  // CONFIGURABLE: Whether to use GPT-4 for transcript processing
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to process transcript');
      }

      const result = await response.json();
      
      // Parse and validate the response
      const segments = result.response
        .split('\n\n')
        .filter((block: string) => block.trim())
        .map((block: string) => {
          const lines = block.split('\n');
          const segment: ProcessedDesignPoint = {
            proposal: '',
            category: 'General'
          };

          lines.forEach((line: string) => {
            if (line.toLowerCase().startsWith('content:')) {
              segment.proposal = line.substring(8).trim();
            }
          });

          return segment;
        })
        .filter((s: ProcessedDesignPoint) => s.proposal.length > 0);

      // If we still only have one segment but transcript is substantial, force split it
      if (segments.length === 1 && cleanedTranscript.length > 100) {
        console.log('Only one segment returned, forcing split...');
        
        // Split by sentences
        const sentences = segments[0].proposal.match(/[^.!?]+[.!?]+/g) || [];
        
        if (sentences.length > 1) {
          const midPoint = Math.ceil(sentences.length / 2);
          const firstHalf = sentences.slice(0, midPoint).join(' ');
          const secondHalf = sentences.slice(midPoint).join(' ');
          
          segments.pop(); // Remove the single segment
          
          segments.push({
            proposal: firstHalf.trim(),
            category: 'General'
          });
          
          segments.push({
            proposal: secondHalf.trim(),
            category: 'General'
          });
        }
      }

      console.log(`Transcript processed into ${segments.length} sticky-note segments`);
      
      return segments;
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
    try {
      console.log(`Creating ${proposals.length} sticky notes in frame "${frameTitle}"`);
      
      // Check if the frame already exists and has connections we should preserve
      const existingFrame = await MiroFrameService.findFrameByTitle(frameTitle);
      let existingConnections: Array<{from: string, to: string}> = [];
      
      if (existingFrame) {
        console.log(`Frame "${frameTitle}" exists, checking for existing connections`);
        
        // Get existing content with connections
        const frameContent = await MiroFrameService.getFrameContentWithConnections(existingFrame);
        existingConnections = frameContent.connections;
        
        console.log(`Found ${existingConnections.length} existing connections to preserve`);
        
        // If we have existing stickies, make sure to relate the new proposals to them
        if (frameContent.stickies.length > 0) {
          console.log(`Frame has ${frameContent.stickies.length} existing sticky notes`);
          
          // Create a map of existing content for quick lookup
          const existingContentMap = new Map<string, string>();
          frameContent.stickies.forEach(sticky => {
            const content = sticky.content.replace(/<\/?p>/g, '').trim();
            existingContentMap.set(content, sticky.id);
          });
          
          // Check if any of our new proposals match existing content
          const newContents = proposals.map(p => p.proposal.trim());
          const duplicates = newContents.filter(content => 
            existingContentMap.has(content)
          );
          
          if (duplicates.length > 0) {
            console.log(`Found ${duplicates.length} proposals that already exist in the frame`);
            
            // Filter out proposals that already exist
            proposals = proposals.filter(p => !existingContentMap.has(p.proposal.trim()));
            
            console.log(`After filtering duplicates, ${proposals.length} proposals will be created`);
          }
        }
      }
      
      // Use the MiroService to create sticky notes in a grid layout with connections
      await MiroService.createStickiesFromPoints(proposals, frameTitle, existingConnections);
      
    } catch (error) {
      console.error(`Error creating sticky notes in frame "${frameTitle}":`, error);
      throw error;
    }
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