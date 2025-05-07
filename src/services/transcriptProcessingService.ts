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
    1. Preserve the original wording and meaning verbatim. Only correct obvious typographical errors. Do not summarize, rephrase, or remove any words, including filler words.
    3. Each segment must represent a complete, coherent thought or a natural continuation of a thought if split.
    4. Length guidelines: Each segment should contain about 150 words (roughly 300-650 characters). Prioritize preserving the full thought over strict adherence to length if a thought is naturally longer but still reasonable for a sticky note.
    5. Only split at natural break points (topic shifts, completed thoughts, natural pauses).
    6. Fix punctuation for clarity and correct obvious typographical errors only.
    7. Avoid creating multiple segments if the content is best understood as a single unit.
    8. If the original text is already a single coherent point of appropriate length, keep it as one segment.
    9. If the content is or something like  :"You are a helpful assistant that transcribes audio. You are given a chunk of audio and you need to transcribe it into text. You should not return anything if the audio is too short or does not contain any meaningful content." that's halluciation from the AI, just return an empty array.
    
    Format each segment as:
    content: [The formatted segment]
    category: [General]`;

    try {
      console.log('Processing transcript:', {
        length: transcript.length,
        content: transcript
      });

      // CONFIGURABLE: Filler words to remove from transcript
      const cleanedTranscript = transcript
        // .replace(/\\b(um|uh|hmm|like)\\b/gi, '')  // Removed: Preserve original wording
        .replace(/\\s+/g, ' ')  // Normalize whitespace
        .trim();

      // Make direct request to OpenAI
      const response = await fetch('/api/openaiwrap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // CONFIGURABLE: User prompt for formatting transcript
          userPrompt: `Format this text into minimal segments, preserving complete thoughts with very few breaks: ${cleanedTranscript}`,
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
      // REMOVED THIS BLOCK - Rely on improved prompt for segmentation
      /*
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
      */

      console.log(`Transcript processed into ${segments.length} sticky-note segments`);
      
      return segments;
    } catch (error) {
      console.error('Error in transcript processing:', error);
      return [];
    }
  }

  /**
   * Fix typos and punctuation in a transcript without altering content or segmenting.
   */
  static async fixTyposAndPunctuationOnly(transcript: string): Promise<string> {
    const systemPrompt = `You are a text cleanup assistant. Your sole task is to correct typographical errors and normalize punctuation in the provided text.
    
    Rules:
    1. PRESERVE THE ORIGINAL WORDING AND MEANING EXACTLY.
    2. DO NOT summarize, rephrase, add, or remove any words (including filler words like "um", "uh", "like").
    3. DO NOT segment or split the text into multiple parts.
    4. Only correct obvious typographical errors (e.g., "hte" to "the").
    5. Normalize punctuation for readability (e.g., ensure sentences end with proper punctuation, fix misplaced commas if they are clearly typos).
    6. Return the cleaned text as a single, continuous string.
    7. If no corrections are needed, return the original text.`;

    try {
      console.log('Fixing typos/punctuation for transcript:', {
        length: transcript.length,
        preview: transcript.substring(0, 50) + '...'
      });

      const cleanedTranscript = transcript.trim();

      if (cleanedTranscript.length === 0) {
        return "";
      }

      // Make direct request to OpenAI
      const response = await fetch('/api/openaiwrap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userPrompt: `Clean up typos and punctuation in this text: ${cleanedTranscript}`,
          systemPrompt,
          useGpt4: false // GPT-3.5 should be sufficient and faster for this
        }),
      });

      if (!response.ok) {
        console.error('Failed to fix typos/punctuation, API error:', await response.text());
        return transcript; // Return original on failure
      }

      const result = await response.json();
      
      // The response should be a single string
      const correctedText = result.response.trim();

      console.log(`Typos/punctuation fixed. Preview: ${correctedText.substring(0,50)}...`);
      return correctedText;

    } catch (error) {
      console.error('Error in fixTyposAndPunctuationOnly:', error);
      return transcript; // Return original on error
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

