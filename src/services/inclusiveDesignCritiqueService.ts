import { ApiService } from './apiService';
import { StickyNoteService } from './miro/stickyNoteService';
import { ConfigurationService } from './configurationService';
import { MiroApiClient } from './miro/miroApiClient';
import { safeApiCall } from '../utils/errorHandlingUtils';
import { inclusiveDesignConfig } from '../utils/config';

/**
 * Service that provides real-time critique of design decisions based on inclusive design principles
 */
export class InclusiveDesignCritiqueService {
  // Get frame name from config
  private static get REAL_TIME_FRAME(): string {
    return ConfigurationService.getFrameConfig().names.realTimeResponse;
  }
  
  // Cache for existing design decisions to avoid repeated fetches
  private static cachedDesignDecisions: string[] = [];
  private static lastFetchTime: number = 0;
  private static readonly CACHE_TTL = 60000; // 1 minute
  
  /**
   * Analyze transcript against inclusive design principles and send critiques if needed
   * @param transcript The transcript to analyze
   * @returns Promise resolving to any generated critiques
   */
  public static async analyzeAndCritique(transcript: string): Promise<string[]> {
    if (!transcript || transcript.trim().length === 0) {
      return [];
    }
    
    console.log('Analyzing transcript for inclusive design critique:', transcript.substring(0, 50) + '...');
    
    // Get current design decisions
    const designDecisions = await this.getDesignDecisions();
    
    // Evaluate transcript against inclusive design principles
    const critiques = await this.evaluateTranscript(transcript, designDecisions);
    
    // If we have critiques, send them to the Miro board
    if (critiques.length > 0) {
      await this.sendCritiquesToBoard(critiques);
    }
    
    return critiques;
  }
  
  /**
   * Get current design decisions for context
   */
  private static async getDesignDecisions(): Promise<string[]> {
    const now = Date.now();
    
    // Use cached decisions if fresh enough
    if (this.cachedDesignDecisions.length > 0 && (now - this.lastFetchTime < this.CACHE_TTL)) {
      return this.cachedDesignDecisions;
    }
    
    // Get design decisions from the Design-Decision frame
    const frameConfig = ConfigurationService.getFrameConfig();
    const designDecisionFrame = frameConfig.names.designDecision;
    
    const decisions = await safeApiCall<string[]>(
      async () => await StickyNoteService.getStickiesFromNamedFrame(designDecisionFrame),
      [],
      'Get Design Decisions',
      { frameName: designDecisionFrame }
    ) || [];
    
    // Update cache
    this.cachedDesignDecisions = decisions;
    this.lastFetchTime = now;
    
    return decisions;
  }
  
  /**
   * Evaluate a transcript against inclusive design principles
   * @param transcript The transcript to evaluate
   * @param designDecisions Current design decisions for context
   * @returns Array of critique messages, empty if no concerns found
   */
  private static async evaluateTranscript(
    transcript: string, 
    designDecisions: string[]
  ): Promise<string[]> {
    // Combine design decisions into a single context string
    const designContext = designDecisions.join("\n");
    
    // Create OpenAI prompt for evaluation
    const evaluationParams = {
      systemPrompt: this.getInclusiveDesignSystemPrompt(),
      userPrompt: this.getInclusiveDesignUserPrompt(transcript, designContext),
      temperature: 0.7,
      useGpt4: true // Use more capable model for nuanced evaluation
    };
    
    // Call AI to evaluate
    const result = await ApiService.callOpenAI(evaluationParams);
    
    // Parse the response to get critique points
    return this.parseCritiqueResponse(result.response);
  }
  
  /**
   * Parse the LLM response to extract critique points
   * @param response The raw response from the AI
   * @returns Array of formatted critique points
   */
  private static parseCritiqueResponse(response: string): string[] {
    // If response starts with "NO_CRITIQUE", there are no concerns
    if (response.trim().startsWith('NO_CRITIQUE')) {
      return [];
    }
    
    // Split response into separate critique points
    // Look for numbered points or bullet points
    const critiques: string[] = [];
    
    // Try to match numbered points like "1.", "2.", etc.
    const numberedMatches = response.match(/\d+\.\s+(.*?)(?=\d+\.|$)/gs);
    if (numberedMatches && numberedMatches.length > 0) {
      return numberedMatches.map(point => point.trim());
    }
    
    // Try to match bullet points
    const bulletMatches = response.match(/[-•*]\s+(.*?)(?=[-•*]|$)/gs);
    if (bulletMatches && bulletMatches.length > 0) {
      return bulletMatches.map(point => point.trim());
    }
    
    // If no structured format is found, just return the whole response
    return [response.trim()];
  }
  
  /**
   * Send critiques to the Miro board as sticky notes
   * @param critiques Array of critique messages
   */
  private static async sendCritiquesToBoard(critiques: string[]): Promise<void> {
    try {
      // Find or create the Real-time-response frame
      const frame = await StickyNoteService.ensureFrameExists(this.REAL_TIME_FRAME);
      
      if (!frame) {
        console.error('Failed to find or create Real-time-response frame');
        return;
      }
      
      // Get existing stickies count for positioning
      const existingStickies = await MiroApiClient.getStickiesInFrame(frame.id);
      const stickyCount = existingStickies ? existingStickies.length : 0;
      
      // Create sticky notes for each critique
      for (let i = 0; i < critiques.length; i++) {
        const stickyConfig = ConfigurationService.getStickyConfig();
        const position = {
          x: frame.x + (stickyCount + i) % 3 * (stickyConfig.dimensions.width + stickyConfig.dimensions.spacing),
          y: frame.y + Math.floor((stickyCount + i) / 3) * (stickyConfig.dimensions.height + stickyConfig.dimensions.spacing) + stickyConfig.layout.topMargin
        };
        
        await MiroApiClient.createStickyNote({
          content: `🔍 INCLUSIVE DESIGN CRITIQUE:\n\n${critiques[i]}`,
          x: position.x,
          y: position.y,
          width: stickyConfig.dimensions.width,
          style: {
            fillColor: stickyConfig.colors.critique.inclusivity,
            textAlign: 'left',
            textAlignVertical: 'top'
          }
        });
        
        console.log(`Created critique sticky note: ${critiques[i].substring(0, 50)}...`);
        
        // Brief delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, ConfigurationService.getRelevanceConfig().delayBetweenCreations));
      }
    } catch (error) {
      console.error('Error sending critiques to board:', error);
    }
  }
  
  /**
   * Get the system prompt for inclusive design evaluation
   */
  private static getInclusiveDesignSystemPrompt(): string {
    const principles = inclusiveDesignConfig.principles.map(
      (principle, index) => `${index + 1}. ${principle}`
    ).join('\n');
    
    return `You are an inclusive design critic that evaluates design decisions and transcripts against inclusive design principles.

Your goal is to identify when design discussions or decisions:
${principles}

If the transcript DOES contain potential issues with inclusive design principles, provide specific critiques in bullet points or numbered format.
If the transcript DOES NOT contradict inclusive design principles, respond with: "NO_CRITIQUE: The current discussion aligns with inclusive design principles."

Be constructive but direct in your critique. Focus on the most significant issues rather than minor concerns.`;
  }
  
  /**
   * Get the user prompt for inclusive design evaluation
   */
  private static getInclusiveDesignUserPrompt(transcript: string, designContext: string): string {
    return `CURRENT DESIGN DECISIONS:
${designContext || "No current design decisions available."}

RECENT TRANSCRIPT:
${transcript}

Evaluate the recent transcript against inclusive design principles. Are there aspects of the discussion that:
- Exclude or marginalize certain user groups?
- Focus too narrowly on privileged users?
- Fail to consider broader impacts?
- Overlook power imbalances?
- Contain biased language or assumptions?
- Make unwarranted assumptions about users?
- Prioritize business over user well-being?

Provide specific critiques or respond with NO_CRITIQUE if no issues are found.`;
  }
} 