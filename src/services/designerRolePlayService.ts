/**
 * Service for simulating designer role play functionality
 * Provides methods for generating designer thinking processes and design decisions
 */
import { MiroService } from './miroService';
import { TranscriptProcessingService } from './transcriptProcessingService';
import { MiroFrameService } from './miro/frameService';
import { DocumentService } from './miro/documentService';
import { frameConfig } from '../utils/config';

interface DesignerThinkingProcess {
  thinking: string[];                   // Designer's thought process
  brainstormingProposals: string[];     // Brainstorming design proposals
  decisions: string[];                  // Final design decisions/highlights
  sketch?: string;                      // URL of the generated sketch
}

/**
 * Available AI models for designer role play
 */
export enum DesignerModelType {
  GPT4 = 'gpt4',
  CLAUDE = 'claude',
  GPT_O3 = 'o4-mini',
  GEMINI = 'gemini'
}

export class DesignerRolePlayService {
  private static isProcessing: boolean = false;
  
  /**
   * Toggle to enable or disable sketch generation using DALL-E 3
   * Set to false to turn off automatic sketch generation with designer role play
   */
  public static enableSketchGeneration: boolean = false;
  
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
      
      const brainstormingProposals = Array.isArray(response.brainstormingProposals)
        ? response.brainstormingProposals
        : response.brainstormingProposals ? [response.brainstormingProposals] : [];
      
      const decisions = Array.isArray(response.decisions) 
        ? response.decisions 
        : [response.decisions];

      return { thinking, brainstormingProposals, decisions };
    } catch (error) {
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Creates three separate document-style text boxes in the Thinking-Dialogue frame for the 
   * designer's thinking process, brainstorming proposals, and design decisions.
   */
  private static async addThinkingProposalsAndDecisionsToDialogueFrame(thoughts: string[], proposals: string[], decisions: string[]): Promise<void> {
    try {
      console.log(`Creating three separate documents: ${thoughts.length} thinking steps, ${proposals.length} proposals, ${decisions.length} decisions`);
      
      // Find or create the frame first to get positioning info
      let frame = await MiroFrameService.findFrameByTitle(frameConfig.names.thinkingDialogue);
      if (!frame) {
        frame = await MiroFrameService.createFrame(
          frameConfig.names.thinkingDialogue,
          -1000,
          0,
          1500,
          1200  // Increased height to accommodate three text elements
        );
      }
      
      // Extract high-level themes from the detailed thoughts
      const themeHeadings = this.extractHighLevelThemes(thoughts);
      
      // Prepare content for each of the three text elements
      const thinkingContent = [
        '## 🧠 Designer Thinking Process Key Themes',
        ...themeHeadings
      ];
      
      const proposalsContent = [
        '## 💡 Brainstorming Proposals',
        ...proposals
      ];
      
      const decisionsContent = [
        '## ✨ Final Design Decisions',
        ...decisions
      ];
      
      // Create three separate text elements with different vertical positions
      const yOffset = 350; // Vertical spacing between text elements
      
      // 1. Create thinking process text (top position)
      await DocumentService.createMiroNativeDocument(
        frameConfig.names.thinkingDialogue,
        'Designer Thinking Process', 
        thinkingContent,
        {
          position: { x: frame.x, y: frame.y - 200 },
          width: 650
        }
      );
      
      // 2. Create brainstorming proposals text (middle position)
      await DocumentService.createMiroNativeDocument(
        frameConfig.names.thinkingDialogue,
        'Brainstorming Concepts', 
        proposalsContent,
        {
          position: { x: frame.x, y: frame.y + yOffset },
          width: 650
        }
      );
      
      // 3. Create design decisions text (bottom position)
      await DocumentService.createMiroNativeDocument(
        frameConfig.names.thinkingDialogue,
        'Design Decisions', 
        decisionsContent,
        {
          position: { x: frame.x, y: frame.y + (yOffset * 2) },
          width: 650
        }
      );
      
      console.log('Three separate designer documents created successfully!');
    } catch (error) {
      console.error('Error creating three separate designer documents:', error);
      
      // Fallback: Try creating separate documents if combined fails (less ideal)
      console.log('Falling back to separate document creation attempts');
      try {
        // Use themes for the thinking process instead of full details
        await DocumentService.createThinkingProcessDocument(frameConfig.names.thinkingDialogue, this.extractHighLevelThemes(thoughts), { width: 600 });
        if (proposals.length > 0) {
          // Attempt to use the brainstorming doc function, targeting the same frame
          await DocumentService.createBrainstormingProposalsDocument(frameConfig.names.thinkingDialogue, proposals, { width: 600 });
        }
      } catch (fallbackError) {
         console.error('Fallback document creation also failed:', fallbackError);
         // Optional: Notify user or re-throw original error
         throw error;
      }
    }
  }

  /**
   * Extracts high-level themes from the detailed thinking process
   * @param thoughts The detailed thinking process
   * @returns Array of high-level themes
   */
  private static extractHighLevelThemes(thoughts: string[]): string[] {
    const themes: string[] = [];
    let currentTheme = '';

    thoughts.forEach(thought => {
      const trimmedThought = thought.trim();
      
      // Look for lines that might represent themes/headers
      const isTheme = 
        trimmedThought.startsWith('#') || 
        trimmedThought.includes('**') || 
        trimmedThought.match(/^\|.*\|$/) ||
        trimmedThought.match(/^[A-Z][A-Za-z\s]+:/) ||
        trimmedThought.match(/^([A-Z][A-Z\s]{2,}|User Needs|Location and Context|Technical|Wellness|Interdisciplinary|CMU|Study|Analyze|Benchmark|Consult)/i) ||
        (trimmedThought.includes(':') && !trimmedThought.match(/^[-•*]\s/)); // Has colon but isn't a bullet point

      if (isTheme) {
        // Process the theme text to clean it up
        currentTheme = trimmedThought
          .replace(/^\||\|$/g, '') // Remove vertical bars
          .replace(/\*\*/g, '')    // Remove bold markers
          .replace(/^#+\s*/, '')   // Remove markdown heading markers
          .trim();
          
        themes.push(currentTheme);
      }
    });

    // If no themes were found, create some generic themes based on the thinking process
    if (themes.length === 0) {
      // Create simple phase-based themes
      themes.push('Problem Analysis');
      themes.push('Research & Exploration');
      themes.push('Design Considerations');
      themes.push('Solution Development');
    }

    return themes;
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
        frameConfig.names.designProposal
      );
      
      const designDecisionFrame = await MiroFrameService.findFrameByTitle(frameConfig.names.designProposal);
      if (designDecisionFrame) {
        await miro.board.viewport.zoomTo([designDecisionFrame]);
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Generates a sketch based on design proposals and decisions using DALL-E 3
   * @param designerThinking The designer's thinking process including proposals and decisions
   * @returns URL of the generated image
   */
  private static async generateSketch(designerThinking: DesignerThinkingProcess): Promise<string> {
    try {
      // Combine decisions and proposals for a comprehensive prompt
      const designContent = [
        ...designerThinking.decisions,
        ...designerThinking.brainstormingProposals.slice(0, 2) // Include top proposals if needed
      ].join('\n\n');
      
      const prompt = `Create a detailed design sketch based on the following design proposal and solution:\n${designContent}`;
      
      const response = await this.makeRequest('/api/generate-sketch', {
        prompt,
        model: 'dall-e-3'
      });
      
      if (!response || !response.imageUrl) {
        throw new Error('Failed to generate sketch');
      }
      
      return response.imageUrl;
    } catch (error) {
      console.error('Error generating sketch:', error);
      throw error;
    }
  }

  /**
   * Adds the generated sketch to the Design-Proposal frame
   * @param imageUrl URL of the generated sketch
   */
  private static async addSketchToBoard(imageUrl: string): Promise<void> {
    try {
      const designFrame = await MiroFrameService.findFrameByTitle(frameConfig.names.designProposal);
      
      if (!designFrame) {
        throw new Error(`Design frame '${frameConfig.names.designProposal}' not found`);
      }
      
      // Get frame dimensions to position the image appropriately
      const frameWidth = designFrame.width;
      const frameHeight = designFrame.height;
      
      // Calculate position (bottom of the frame)
      const positionX = designFrame.x;
      const positionY = designFrame.y + (frameHeight / 2) - 100; // Place below existing content
      
      // Create an image on the board
      const image = await miro.board.createImage({
        url: imageUrl,
        title: 'Generated Design Sketch',
        x: positionX,
        y: positionY,
        width: Math.min(600, frameWidth * 0.8) // Limit width to 80% of frame or 600px
      });
      
      // Optionally add a caption
      await miro.board.createStickyNote({
        content: 'AI-Generated Design Sketch',
        x: positionX,
        y: positionY + 300, // Position below the image
        width: 200,
        style: {
          fillColor: 'yellow'
        }
      });
      
      console.log('Added sketch to board successfully');
      return;
    } catch (error) {
      console.error('Error adding sketch to board:', error);
      throw error;
    }
  }

  /**
   * Creates documents and sticky notes in the appropriate frames for the designer's thinking process,
   * brainstorming proposals (in thinking frame), and final decisions.
   */
  public static async addThinkingToBoard(designerThinking: DesignerThinkingProcess): Promise<void> {
    try {
      // Add thinking process AND brainstorming proposals to the dialogue frame
      await this.addThinkingProposalsAndDecisionsToDialogueFrame(designerThinking.thinking, designerThinking.brainstormingProposals, designerThinking.decisions);
      
      // Add design decisions to the proposal frame
      await this.addDecisionsToDesignFrame(designerThinking.decisions);
      
      // Generate and add sketch if enabled and it doesn't exist
      if (this.enableSketchGeneration && !designerThinking.sketch) {
        const sketchUrl = await this.generateSketch(designerThinking);
        designerThinking.sketch = sketchUrl;
      }
      
      // Add the sketch to the board if it exists
      if (this.enableSketchGeneration && designerThinking.sketch) {
        await this.addSketchToBoard(designerThinking.sketch);
      }
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Simulates a designer solving a design challenge
   * @param modelType The AI model to use for reasoning (GPT4 or Claude)
   * @returns The designer's thinking process, brainstorming proposals, and decisions
   */
  public static async simulateDesigner(modelType: DesignerModelType = DesignerModelType.GPT4): Promise<DesignerThinkingProcess> {
    let designChallenge: string | undefined;
    
    try {
      // Fetch the design challenge from the Miro board
      designChallenge = await MiroService.getDesignChallenge();
      
      if (!designChallenge) {
        throw new Error(`No design challenge found. Please create one in the ${frameConfig.names.designChallenge} frame.`);
      }
      
      const designerThinking = await this.generateDesignerThinking(designChallenge, modelType);
      
      // Generate sketch based on design proposals and decisions if enabled
      if (this.enableSketchGeneration) {
        const sketchUrl = await this.generateSketch(designerThinking);
        designerThinking.sketch = sketchUrl;
      }
      
      await this.addThinkingToBoard(designerThinking);
      
      // Return the designer thinking process for use in the UI
      return designerThinking;
    } catch (error) {
      throw error;
    }
  }
} 