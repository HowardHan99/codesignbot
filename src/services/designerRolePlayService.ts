/**
 * Service for simulating designer role play functionality
 * Provides methods for generating designer thinking processes and design decisions
 */
import { MiroService } from './miroService';
import { TranscriptProcessingService } from './transcriptProcessingService';
import { MiroFrameService } from './miro/frameService';
import { DocumentService } from './miro/documentService';

interface DesignerThinkingProcess {
  thinking: string[];         // Designer's thought process
  decisions: string[];        // Final design decisions/highlights
}

/**
 * Available AI models for designer role play
 */
export enum DesignerModelType {
  GPT4 = 'gpt4',
  CLAUDE = 'claude',
  GPT_O3 = 'gpt_o3',
  GEMINI = 'gemini'
}

export class DesignerRolePlayService {
  private static isProcessing: boolean = false;
  private static readonly THINKING_FRAME_NAME = 'Thinking-Dialogue';
  private static readonly DECISION_FRAME_NAME = 'Design-Proposal';
  
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
   * @param designChallenge The design challenge to solve
   * @param modelType The AI model to use for reasoning (GPT4 or Claude)
   */
  public static async generateDesignerThinking(
    designChallenge: string, 
    modelType: DesignerModelType = DesignerModelType.GPT4
  ): Promise<DesignerThinkingProcess> {
    if (this.isProcessing) {
      throw new Error('A designer role play session is already in progress');
    }
    
    try {
      this.isProcessing = true;
      
      const response = await this.makeRequest('/api/designer-roleplay', {
        designChallenge,
        type: 'thinking',
        modelType
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
   * Creates a document-style text box in the Thinking-Dialogue frame for the designer's thinking process
   */
  private static async addThinkingToDialogueFrame(thoughts: string[]): Promise<void> {
    try {
      console.log(`Creating designer thinking document with ${thoughts.length} thinking steps`);
      
      // Directly use the native document method that we know works
      // Only specify width for fixed aspect ratio widgets (Miro API requirement)
      await DocumentService.createMiroNativeDocument(
        this.THINKING_FRAME_NAME,
        '🧠 Designer Thinking Process',
        thoughts,
        {
          // Only specify width, not height, for fixed aspect ratio widgets
          width: 650
          // Height will be determined automatically by Miro based on content
        }
      );
      
      console.log('Designer thinking document created successfully!');
    } catch (error) {
      console.error('Error creating designer thinking document:', error);
      
      // If direct document creation fails, fall back to the thinking process document method
      console.log('Falling back to standard thinking process document method');
      
      await DocumentService.createThinkingProcessDocument(
        this.THINKING_FRAME_NAME,
        thoughts,
        {
          fontSize: 16,
          fontFamily: 'open_sans',
          width: 600
        }
      );
    }
  }

  /**
   * Creates sticky notes in the Design-Proposal frame for the final decisions
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
   * @param modelType The AI model to use for reasoning (GPT4 or Claude)
   * @returns The designer's thinking process and decisions
   */
  public static async simulateDesigner(modelType: DesignerModelType = DesignerModelType.GPT4): Promise<DesignerThinkingProcess> {
    try {
      const designChallenge = await MiroService.getDesignChallenge();
      
      if (!designChallenge) {
        throw new Error('No design challenge found. Please create one in the Design-Challenge frame.');
      }
      
      const designerThinking = await this.generateDesignerThinking(designChallenge, modelType);
      await this.addThinkingToBoard(designerThinking);
      
      // Return the designer thinking process for use in the UI
      return designerThinking;
    } catch (error) {
      throw error;
    }
  }
} 