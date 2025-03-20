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
   */
  private static async makeRequest(endpoint: string, data: any): Promise<any> {
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
        throw new Error(`HTTP error! status: ${response.status}`);
      }
  
      const result = await response.json();
      return result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Simulates a designer's thinking process for solving a design challenge
   */
  public static async generateDesignerThinking(designChallenge: string): Promise<DesignerThinkingProcess> {
    if (this.isProcessing) {
      throw new Error('A designer role play session is already in progress');
    }
    
    try {
      this.isProcessing = true;
      
      const response = await this.makeRequest('/api/designer-roleplay', {
        designChallenge,
        type: 'thinking'
      });

      if (!response || !response.thinking || !response.decisions) {
        throw new Error('Invalid response from designer role play API');
      }

      const thinking = Array.isArray(response.thinking) 
        ? response.thinking 
        : [response.thinking];
      
      const decisions = Array.isArray(response.decisions) 
        ? response.decisions 
        : [response.decisions];

      return { thinking, decisions };
    } catch (error) {
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Creates sticky notes in the Thinking-Dialogue frame for the designer's thinking process
   */
  private static async addThinkingToDialogueFrame(thoughts: string[]): Promise<void> {
    try {
      await TranscriptProcessingService.createDesignProposalStickies(
        thoughts.map(thought => ({
          proposal: thought,
          category: 'designer-thinking'
        })),
        this.THINKING_FRAME_NAME
      );
    } catch (error) {
      throw error;
    }
  }

  /**
   * Creates sticky notes in the Design-Decision frame for the final decisions
   */
  private static async addDecisionsToDesignFrame(decisions: string[]): Promise<void> {
    try {
      await TranscriptProcessingService.createDesignProposalStickies(
        decisions.map(decision => ({
          proposal: decision,
          category: 'design-decision'
        })),
        this.DECISION_FRAME_NAME
      );
      
      const designDecisionFrame = await MiroFrameService.findFrameByTitle(this.DECISION_FRAME_NAME);
      if (designDecisionFrame) {
        await miro.board.viewport.zoomTo([designDecisionFrame]);
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Creates sticky notes in the appropriate frames for the designer's thinking process
   * and final decisions
   */
  public static async addThinkingToBoard(designerThinking: DesignerThinkingProcess): Promise<void> {
    try {
      await this.addThinkingToDialogueFrame(designerThinking.thinking);
      await this.addDecisionsToDesignFrame(designerThinking.decisions);
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Simulates a designer solving a design challenge
   */
  public static async simulateDesigner(): Promise<void> {
    try {
      const designChallenge = await MiroService.getDesignChallenge();
      
      if (!designChallenge) {
        throw new Error('No design challenge found. Please create one in the Design-Challenge frame.');
      }
      
      const designerThinking = await this.generateDesignerThinking(designChallenge);
      await this.addThinkingToBoard(designerThinking);
    } catch (error) {
      throw error;
    }
  }
} 