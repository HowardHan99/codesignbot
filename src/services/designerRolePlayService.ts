/**
 * Service for simulating designer role play functionality
 * Provides methods for generating designer thinking processes and design decisions
 */
import { MiroService } from './miroService';
import { TranscriptProcessingService } from './transcriptProcessingService';
import { MiroFrameService } from './miro/frameService';
import { ConfigurationService } from './configurationService';

interface DesignerThinkingProcess {
  thinking: string[];         // Designer's thought process
  decisions: string[];        // Final design decisions/highlights
}

export class DesignerRolePlayService {
  private static isProcessing: boolean = false;
  private static readonly THINKING_FRAME_NAME = 'Thinking-Dialogue';
  private static readonly DECISION_FRAME_NAME = 'Design-Decision';
  
  /**
   * Makes a request to the OpenAI API endpoint for designer role play
   * @param endpoint - The API endpoint to call
   * @param data - The request payload
   * @returns Promise resolving to the API response
   */
  private static async makeRequest(endpoint: string, data: any): Promise<any> {
    console.log(`[DESIGNER ROLE PLAY] Making API request to ${endpoint}`, data);
    const startTime = Date.now();
    
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
  
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[DESIGNER ROLE PLAY] API request failed with status ${response.status}:`, errorText);
        throw new Error(`HTTP error! status: ${response.status}`);
      }
  
      const result = await response.json();
      const duration = Date.now() - startTime;
      console.log(`[DESIGNER ROLE PLAY] API request completed in ${duration}ms`, {
        thinkingPoints: result.thinking?.length || 0,
        decisionPoints: result.decisions?.length || 0
      });
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[DESIGNER ROLE PLAY] API request failed after ${duration}ms:`, error);
      throw error;
    }
  }

  /**
   * Simulates a designer's thinking process for solving a design challenge
   * @param designChallenge - The design challenge to solve
   * @returns Promise resolving to the designer's thinking process and decisions
   */
  public static async generateDesignerThinking(designChallenge: string): Promise<DesignerThinkingProcess> {
    console.log(`[DESIGNER ROLE PLAY] Starting designer thinking generation for challenge:`, {
      challengeLength: designChallenge.length,
      challengePreview: designChallenge.substring(0, 100) + (designChallenge.length > 100 ? '...' : '')
    });
    
    if (this.isProcessing) {
      console.warn('[DESIGNER ROLE PLAY] Design session already in progress, aborting');
      throw new Error('A designer role play session is already in progress');
    }
    
    const startTime = Date.now();
    
    try {
      this.isProcessing = true;
      console.log('[DESIGNER ROLE PLAY] Session started, making API request');
      
      const response = await this.makeRequest('/api/designer-roleplay', {
        designChallenge,
        type: 'thinking'
      });

      if (!response || !response.thinking || !response.decisions) {
        console.error('[DESIGNER ROLE PLAY] Invalid API response:', response);
        throw new Error('Invalid response from designer role play API');
      }

      const thinking = Array.isArray(response.thinking) 
        ? response.thinking 
        : [response.thinking];
      
      const decisions = Array.isArray(response.decisions) 
        ? response.decisions 
        : [response.decisions];
      
      const duration = Date.now() - startTime;
      console.log(`[DESIGNER ROLE PLAY] Designer thinking generation completed in ${duration}ms`, {
        thinkingCount: thinking.length,
        decisionsCount: decisions.length,
        firstThinking: thinking[0]?.substring(0, 100) + '...',
        firstDecision: decisions[0]?.substring(0, 100) + '...'
      });

      return { thinking, decisions };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[DESIGNER ROLE PLAY] Error generating designer thinking after ${duration}ms:`, error);
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Creates sticky notes in the Thinking-Dialogue frame for the designer's thinking process
   * @param thoughts The designer's thinking process
   * @return Promise resolving when completed
   */
  private static async addThinkingToDialogueFrame(thoughts: string[]): Promise<void> {
    console.log(`[DESIGNER ROLE PLAY] Adding ${thoughts.length} thinking points to Dialogue frame`);
    
    try {
      // Let the TranscriptProcessingService handle this since it already works
      await TranscriptProcessingService.createDesignProposalStickies(
        thoughts.map(thought => ({
          proposal: thought,
          category: 'designer-thinking'
        })),
        this.THINKING_FRAME_NAME
      );
      
      console.log('[DESIGNER ROLE PLAY] Successfully added thinking to Dialogue frame');
    } catch (error) {
      console.error('[DESIGNER ROLE PLAY] Error adding thinking to Dialogue frame:', error);
      throw error;
    }
  }

  /**
   * Creates sticky notes in the Design-Decision frame for the final decisions
   * @param decisions The design decisions
   * @return Promise resolving when completed
   */
  private static async addDecisionsToDesignFrame(decisions: string[]): Promise<void> {
    console.log(`[DESIGNER ROLE PLAY] Adding ${decisions.length} decisions to Design-Decision frame`);
    
    try {
      // Use TranscriptProcessingService instead of direct sticky note creation
      await TranscriptProcessingService.createDesignProposalStickies(
        decisions.map(decision => ({
          proposal: decision,
          category: 'design-decision'
        })),
        this.DECISION_FRAME_NAME
      );
      
      console.log('[DESIGNER ROLE PLAY] Successfully added decisions to Design-Decision frame');
      
      // Find the frame and zoom to it
      const designDecisionFrame = await MiroFrameService.findFrameByTitle(this.DECISION_FRAME_NAME);
      if (designDecisionFrame) {
        console.log('[DESIGNER ROLE PLAY] Zooming to Design-Decision frame');
        await miro.board.viewport.zoomTo([designDecisionFrame]);
      }
    } catch (error) {
      console.error('[DESIGNER ROLE PLAY] Error adding decisions to Design-Decision frame:', error);
      throw error;
    }
  }

  /**
   * Creates sticky notes in the appropriate frames for the designer's thinking process
   * and final decisions
   * @param designerThinking - The designer's thinking process and decisions
   */
  public static async addThinkingToBoard(designerThinking: DesignerThinkingProcess): Promise<void> {
    console.log('[DESIGNER ROLE PLAY] Adding designer thinking to Miro board', {
      thinkingCount: designerThinking.thinking.length,
      decisionsCount: designerThinking.decisions.length
    });
    
    const startTime = Date.now();
    
    try {
      // Process thinking and decisions in order, but one at a time
      // First add thinking to Dialogue frame
      await this.addThinkingToDialogueFrame(designerThinking.thinking);
      
      // Then add decisions to Design-Decision frame
      await this.addDecisionsToDesignFrame(designerThinking.decisions);
      
      const duration = Date.now() - startTime;
      console.log(`[DESIGNER ROLE PLAY] Completed adding all thinking to board in ${duration}ms`);
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[DESIGNER ROLE PLAY] Error adding thinking to board after ${duration}ms:`, error);
      throw error;
    }
  }
  
  /**
   * Simulates a designer solving a design challenge
   * Gets the design challenge, generates thinking, and adds it to the board
   */
  public static async simulateDesigner(): Promise<void> {
    console.log('[DESIGNER ROLE PLAY] Starting designer simulation');
    const startTime = Date.now();
    
    try {
      // Get the design challenge
      console.log('[DESIGNER ROLE PLAY] Fetching design challenge');
      const designChallenge = await MiroService.getDesignChallenge();
      
      if (!designChallenge) {
        console.error('[DESIGNER ROLE PLAY] No design challenge found');
        throw new Error('No design challenge found. Please create one in the Design-Challenge frame.');
      }
      
      console.log('[DESIGNER ROLE PLAY] Design challenge fetched successfully', {
        challengeLength: designChallenge.length,
        challengePreview: designChallenge.substring(0, 100) + (designChallenge.length > 100 ? '...' : '')
      });
      
      // Generate designer thinking
      console.log('[DESIGNER ROLE PLAY] Generating designer thinking');
      const designerThinking = await this.generateDesignerThinking(designChallenge);
      console.log('[DESIGNER ROLE PLAY] Designer thinking generated successfully');
      
      // Add thinking to board
      console.log('[DESIGNER ROLE PLAY] Adding thinking to Miro board');
      await this.addThinkingToBoard(designerThinking);
      console.log('[DESIGNER ROLE PLAY] Successfully added thinking to Miro board');
      
      const duration = Date.now() - startTime;
      console.log(`[DESIGNER ROLE PLAY] Designer simulation completed successfully in ${duration}ms`);
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[DESIGNER ROLE PLAY] Error simulating designer after ${duration}ms:`, error);
      throw error;
    }
  }
} 