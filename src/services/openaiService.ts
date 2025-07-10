/**
 * Interface for OpenAI API responses
 */
export interface OpenAIResponse {
  response: string;
}

import { PointTagMapping } from './miroService';
import { Logger } from '../utils/logger';

/**
 * Service class for handling OpenAI API interactions
 * Provides methods for generating, simplifying, and adjusting the tone of analysis
 */
export class OpenAIService {
  /**
   * Makes a request to the OpenAI API endpoint
   * @param endpoint - The API endpoint to call
   * @param data - The request payload
   * @returns Promise resolving to the API response
   */
  private static async makeRequest(endpoint: string, data: any): Promise<OpenAIResponse> {
    try {
      // console.log(`Making request to ${endpoint} with data:`, { 
      //   systemPromptLength: data.systemPrompt?.length || 0,
      //   systemPrompt: data.systemPrompt,
      //   userPromptLength: data.userPrompt?.length || 0,
      //   userPrompt: data.userPrompt});
      
      // Create an AbortController for timeout handling
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
        signal: controller.signal
      });

      // Clear the timeout
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'No error text available');
        throw new Error(`API error (${response.status}): ${errorText}`);
      }

      const jsonResponse = await response.json();
      return jsonResponse;
    } catch (error: any) {
      console.error('Error in OpenAI API request:', error);
      if (error.name === 'AbortError') {
        throw new Error('API request timed out after 60 seconds');
      }
      throw error; // Re-throw for handling upstream
    }
  }

  /**
   * Common method to process and clean OpenAI responses
   * @param result - The raw OpenAI response
   * @param pointCount - Number of points to ensure in the result
   * @param fallbackText - The fallback text to use if needed
   * @returns Processed array of points
   */
  private static processOpenAIResponse(result: OpenAIResponse, pointCount: number, fallbackText: string): string[] {
    // First attempt: Try basic delimiter parsing
    let points = result.response
      .replace(/\*\*\s+\*\*/g, '**') // Fix spacing in delimiters
      .trim()
      .split('**')
      .map(point => point.trim())
      .filter(point => point.length > 0);
    
    // If we got a good number of points, just return them
    if (points.length >= pointCount) {
      console.log(`Found ${points.length} well-formatted points`);
      return points.slice(0, pointCount);
    }
    
    // Simple fallback for when we just need one or two more points
    if (points.length >= pointCount - 2) {
      console.log(`Found ${points.length} points, adding ${pointCount - points.length} fallbacks`);
      const fallbacks = [
        `${fallbackText} with user needs in mind.`,
        `${fallbackText} considering implementation constraints.`,
      ];
      
      while (points.length < pointCount) {
        points.push(fallbacks[points.length - (pointCount - fallbacks.length)]);
      }
      
      return points;
    }
    
    // For more seriously malformed responses, we'll let GPT fix it
    return points;
  }

  /**
   * Uses GPT to reformat a malformed response into properly formatted points
   * @param malformedResponse - The original malformed response
   * @param pointCount - Number of points to extract
   * @returns Promise resolving to array of properly formatted points
   */
  private static async reformatWithGPT(malformedResponse: string, pointCount: number): Promise<string[]> {
    console.log('Reformatting malformed response with GPT');
    
    const systemPrompt = `You are helping to extract and format analysis points from a malformed response.

The original response should have contained exactly ${pointCount} distinct critical points about a design, but the formatting was incorrect.

Your task:
1. Identify ${pointCount} distinct critical points from the text
2. Format each point as a clear, standalone criticism
3. Return exactly ${pointCount} points, numbered 1-${pointCount}
4. If there aren't enough distinct points, create additional relevant ones based on the context
5. Each point should be concise but complete

Format your response as exactly ${pointCount} numbered points, with one point per line:
1. First point
2. Second point
...and so on.

Do not include any introduction, explanation, or conclusion. Just the ${pointCount} numbered points.`;

    try {
      const result = await this.makeRequest('/api/openaiwrap', {
        userPrompt: `Malformed response that needs reformatting into ${pointCount} distinct points:\n\n${malformedResponse}`,
        systemPrompt,
        useGpt4: true 
      });
      
      // Extract the numbered points from the response
      const lines = result.response.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      const formattedPoints: string[] = [];
      
      for (const line of lines) {
        // Remove numbering and any bullet points
        const cleanedLine = line.replace(/^\d+[\.\)]\s*/, '').replace(/^[-•]\s*/, '').trim();
        if (cleanedLine.length > 10) { // Ensure it's a substantial point
          formattedPoints.push(cleanedLine);
        }
      }
      
      console.log(`Reformatting succeeded: extracted ${formattedPoints.length} points`);
      
      return formattedPoints.slice(0, pointCount);
    } catch (error) {
      console.error('Error in reformatting response:', error);
      // If reformatting fails, return generic fallbacks
      return Array(pointCount).fill(null).map((_, i) => 
        `This design element needs further analysis. ${i + 1}`
      );
    }
  }

  /**
   * Generates an antagonistic analysis of design decisions
   * @param userPrompt - The combined design decisions to analyze
   * @param designChallenge - The context of the design challenge
   * @param existingPoints - Array of existing synthesized points to avoid overlap
   * @param consensusPoints - Array of consensus points that should not be questioned
   * @param designPrinciples - Array of design principles to prioritize
   * @param customSystemPrompt - Custom system prompt to add additional instructions
   * @param pointTagMappings - Previous point-tag mappings for learning
   * @returns Promise resolving to the formatted analysis
   */
  public static async generateAnalysis(
    userPrompt: string, 
    designChallenge: string,
    existingPoints: string[] = [],
    consensusPoints: string[] = [],
    designPrinciples?: string,
    customSystemPrompt?: string,
    pointTagMappings?: PointTagMapping[],
  ): Promise<string> {

    // Base system prompt template
    const BASE_SYSTEM_PROMPT = `You are a public-service design expert who is good at identifying the tensions and broad social implications of design proposals. You are analyzing design proposals and solutions for the design challenge with the following conditions background, and design challenge: "${designChallenge || 'No challenge specified'}". Provide exactly 5 provacative points that identify potential problems or conflicts in these decisions. The  points should focus on constructive conflicts that can be used to make the designer be aware of the broader social implications and community members of their design proposals. The points should be concise and suitable for a stickynote length. It should also be understood by a non-design audience - try to avoid design jargon and big words. `;

    // Use custom prompt if provided, otherwise use base prompt
    let systemPrompt = customSystemPrompt || BASE_SYSTEM_PROMPT;

    // Construct the main message parts
    const messageParts = [
      `Analyze the following design decisions:\n\n${userPrompt}`
    ];

    // Add point-tag mappings if provided (simple format)
    if (pointTagMappings && pointTagMappings.length > 0) {
      const { formatPointTagMappingsForPrompt } = await import('./miroService');
      const tagMappingsText = formatPointTagMappingsForPrompt(pointTagMappings);
      if (tagMappingsText) {
        messageParts.push(tagMappingsText);
        systemPrompt += `\n\nNote: You can see previous antagonistic points and how users tagged them. Use this to understand what types of points users found useful vs not useful. Generate points that align with the user's demonstrated preferences while still being critical and constructive.`;
      }
    }

    // Add design principles if provided
    if (designPrinciples) {
      messageParts.push(`\n\n--- Key Design Principles to Prioritize ---\n${designPrinciples}`);
    }

    // Add synthesized points if any
    if (existingPoints.length > 0) {
      messageParts.push(
        `\n\nAlso consider these synthesized themes from previous discussions:\n${existingPoints.join('\n')}`
      );
    }
    
    // Add consensus points if any
    if (consensusPoints.length > 0) {
      messageParts.push(
        `\n\nConsensus points from the design team (please do not question or criticize these points):\n${consensusPoints.join('\n')}`
      );
    }
    
    // Check for the "Previous User Feedback & Suggestions" in the userPrompt and extract it if found
    const incorporateSuggestionsLabel = "Previous User Feedback & Suggestions:";
    const hasFeedback = userPrompt.includes(incorporateSuggestionsLabel);
    
    if (hasFeedback) {
      // Add instructions to consider previous feedback in the system prompt
      systemPrompt += `\n\nIMPORTANT: The user has provided feedback on previous iterations of design criticism. Please carefully review their feedback and incorporate it into your analysis. Evolve your criticism based on what they've found useful or what they've addressed already. Don't repeat criticisms that have been addressed, but you may build upon partially addressed issues with more nuanced perspectives.`;
      
      Logger.log('OPENAI-API', 'Found user feedback in the prompt. Adding special instructions to system prompt.');
    }

    try {
      Logger.log('OPENAI-API', 'Starting generateAnalysis call to OpenAI API in the non thinking process mode');
      
      // === LOG THE COMPLETE FINAL MESSAGE ===
      console.log('🚀 === FINAL MESSAGE SENT TO OPENAI ===');
      console.log('SYSTEM PROMPT (includes design challenge):', systemPrompt);
      console.log('USER PROMPT (complete with all components):', messageParts.join('\n'));
      console.log('🚀 === END FINAL MESSAGE ===');
      
      const result = await this.makeRequest('/api/openaiwrap', {
        userPrompt: messageParts.join('\n'),
        systemPrompt,
        useGpt4: true // Use GPT-4 for generating analysis
      });

      Logger.log('OPENAI-API', 'request to openai', {
        userPrompt: messageParts.join('\n'),
        systemPrompt: systemPrompt
      });

      // Try to process with basic delimiter parsing
      let points = this.processOpenAIResponse(result, 10, 'This design decision requires further analysis');
      
      // If we didn't get enough points with basic parsing, use GPT to reformat
      if (points.length < 10) {
        Logger.log('OPENAI-API', 'Response format not ideal, using GPT to reformat');
        points = await this.reformatWithGPT(result.response, 10);
      }

      // Filter for conflicts and preserve all 10 points
      const filteredPoints = await this.filterNonConflictingPoints(points, consensusPoints);      
      return filteredPoints.join(' ** ');
    } catch (error) {
      Logger.error('OPENAI-API', 'Error in generateAnalysis:', error);
      throw error; // Re-throw to be caught by caller
    }
  }

  /**
   * Filters points to ensure they don't conflict with consensus points
   */
  private static async filterNonConflictingPoints(
    points: string[], 
    consensusPoints: string[]
  ): Promise<string[]> {
    const systemPrompt = `You are filtering design criticism points to ensure they don't conflict with consensus points.

Consensus points that you should defintely follow:
${consensusPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}

Review these criticism points and:
1. Select all points that do NOT conflict with the consensus points 
2. If a point conflicts with the consensus points such as the designer has already considered or addresses, skip it and move to the next one
3. If fewer than 10 non-conflicting points are found, generate substitutes that:
   - focus on different aspects, such as different user groups, different parts of the design decision, or different parts of the design process
   - Address different aspects than the consensus points
   - Maintain critical perspective
   - Are unique from other selected points
4. If any points are longer than 300 characters, simplify them to be 300 characters or less.

Return exactly 5 final points separated by ** **.`;

    const result = await this.makeRequest('/api/openaiwrap', {
      userPrompt: points.join('\n'),
      systemPrompt,
      useGpt4: true // Use GPT-4 for filtering points
    });

    return this.processOpenAIResponse(result, 10, 'This point needs revision');
  }

  /**
   * Simplifies a given analysis into more concise points
   * @param response - The analysis to simplify
   * @returns Promise resolving to the simplified analysis
   */
  public static async simplifyAnalysis(response: string): Promise<string> {
    const result = await this.makeRequest('/api/openaiwrap', {
      userPrompt: response,
      systemPrompt: `Please simplify the following criticism points into three very concise, clear points.

Rules:
1. You MUST provide the same number of points as the original response, no more, no less
2. Each point should be no more than 20 words
3. Keep the core message of each original point
4. Do not use any numbering, bullet points, or labels
5. Format with exactly two ** ** between points

Example format:
First point here ** ** Second point here ** ** Third point here

Do not include any other text or formatting.`
    });

    const points = this.processOpenAIResponse(result, 3, 'This point needs further simplification');
    return points.join(' ** ');
  }

  /**
   * Adjusts the tone of an analysis while maintaining the core message
   * @param response - The analysis to adjust
   * @param newTone - The desired tone (e.g., 'persuasive', 'aggressive', 'critical')
   * @returns Promise resolving to the tone-adjusted analysis
   */
  public static async adjustTone(response: string, newTone: string): Promise<string> {
    const toneInstructions = {
      persuasive: `Act as a charismatic consultant who genuinely wants to help. Use phrases like "Consider this perspective...", "What if we looked at it this way...", "I understand the intention, however...", "Let's explore a different angle...". Be diplomatic but firm in your critiques.`,
      aggressive: `Act as a brutally honest critic who doesn't hold back. Use strong phrases like "This approach is fundamentally flawed!", "This completely misses the mark...". Be confrontational and direct, expressing strong disagreement and frustration.`,
      critical: `Act as a meticulous academic reviewer. Use analytical phrases like "The evidence does not support...", "This lacks rigorous consideration of...", "A critical examination reveals...". Be thorough and uncompromising in your analysis.`
    };

    const result = await this.makeRequest('/api/openaiwrap', {
      userPrompt: response,
      systemPrompt: `${toneInstructions[newTone as keyof typeof toneInstructions] || 'Be direct but professional.'}

Rules for the response:
1. You MUST provide the same number of points as the original response, no more, no less
2. Each point should be a complete, self-contained criticism
3. Do not use any numbering, bullet points, or labels
4. Keep each point focused on a single issue
5. Maintain the core message of each original point while adjusting the tone
6. Format your response with exactly two ** ** between each point

Example format:
First point here ** ** Second point here ** ** Third point here

Rewrite the following criticism points using this format and tone. Do not add any additional text or formatting.`
    });

    const points = this.processOpenAIResponse(result, 3, 'This design decision requires further analysis');
    return points.join(' ** ');
  }

  /**
   * Generates a response in a conversation context
   * @param userMessage - The user's current message
   * @param designChallenge - The context of the design challenge
   * @param currentCriticism - Array of current criticism points
   * @param conversationContext - Previous conversation history
   * @returns Promise resolving to the assistant's response
   */
  public static async generateConversationResponse(
    userMessage: string,
    designChallenge: string,
    currentCriticism: string[],
    conversationContext: string
  ): Promise<string> {
    const systemPrompt = `You are a design critique agent helping with the design challenge: "${designChallenge}".
You have provided these criticisms:
${currentCriticism.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Previous conversation context:
${conversationContext}

Rules:
1. If the user clarifies something about your criticism, remember it for future interactions
2. If the user disagrees with a point, engage in a constructive discussion
3. Keep responses focused on the design challenge and your criticisms
4. Be direct but professional
5. If the user types "noted", acknowledge and move on
6. If you receive an instruction starting with "instruct:", follow it precisely

Respond to the user's message in a helpful and constructive way.`;

    const result = await this.makeRequest('/api/openaiwrap', {
      userPrompt: userMessage,
      systemPrompt,
    });

    return result.response;
  }

  /**
   * Analyzes images using OpenAI's Vision model
   * @param imagePaths Array of image paths to analyze
   * @returns Promise resolving to array of image descriptions
   */
  public static async analyzeImages(imagePaths: string[]): Promise<string[]> {
    try {
      const descriptions = await Promise.all(imagePaths.map(async (path) => {
        const result = await fetch('/api/openaiwrap', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userPrompt: path,
            systemPrompt: 'You are a helpful assistant analyzing design sketches. Describe the key elements, interactions, and design patterns you observe in this image. Focus on the user interface elements and their relationships.',
            isVisionRequest: true
          }),
        });

        if (!result.ok) {
          throw new Error(`Failed to analyze image: ${result.status}`);
        }

        const { response } = await result.json();
        return response;
      }));

      return descriptions;
    } catch (error) {
      console.error('Error analyzing images:', error);
      throw error;
    }
  }

  /**
   * Generates theme-specific antagonistic analysis points
   * @param userPrompt - The combined design decisions to analyze
   * @param themeName - The name of the design theme to focus on
   * @param designChallenge - The context of the design challenge
   * @param consensusPoints - Array of consensus points that should not be questioned
   * @param designPrinciples - Array of design principles to prioritize
   * @param customSystemPrompt - Custom system prompt to add additional instructions
   * @param pointTagMappings - Previous point-tag mappings for learning
   * @returns Promise resolving to array of points specific to the theme
   */
  public static async generateThemeSpecificAnalysis(
    userPrompt: string,
    themeName: string,
    designChallenge: string,
    consensusPoints: string[] = [],
    designPrinciples?: string,
    customSystemPrompt?: string,
    pointTagMappings?: PointTagMapping[]
  ): Promise<string[]> {

    // Base system prompt template
    const BASE_THEME_SYSTEM_PROMPT = `You are analyzing design decisions for the design challenge with the following background, conditions, and design challenge: "${designChallenge || 'No challenge specified'}" with a specific focus on the theme "${themeName}".

Provide exactly 3 critical points that identify potential problems or conflicts related specifically to the "${themeName}" theme of these design proposals, your critical points should be constructive conflicts that can be used to make the designer be aware of the broader social implications and community members of their design proposals.

Rules:
1. NEVER question or criticize the consensus points - these are established agreements that must be respected
2. Focus on potential problems, conflicts, or negative consequences related to ${themeName}
3. Always provide EXACTLY 5 points, no more, no less
4. Each point should be a complete, self-contained criticism
5. Keep each point focused on a single issue within the ${themeName} theme`;

    // Use custom prompt if provided, otherwise use base prompt
    let systemPrompt = customSystemPrompt || BASE_THEME_SYSTEM_PROMPT;

    // Add point-tag mappings if provided
    if (pointTagMappings && pointTagMappings.length > 0) {
      const { formatPointTagMappingsForPrompt } = await import('./miroService');
      const tagMappingsText = formatPointTagMappingsForPrompt(pointTagMappings);
      if (tagMappingsText) {
        systemPrompt += `\n\nPrevious points and user tags (focus on the "${themeName}" theme while considering user preferences):\n${tagMappingsText}`;
      }
    }
    
    // Check for the "Previous User Feedback & Suggestions" in the userPrompt and extract it if found
    const incorporateSuggestionsLabel = "Previous User Feedback & Suggestions:";
    const hasFeedback = userPrompt.includes(incorporateSuggestionsLabel);
    
    if (hasFeedback) {
      // Add instructions to consider previous feedback in the system prompt
      systemPrompt += `\n\nIMPORTANT: The user has provided feedback on previous iterations of design criticism related to the "${themeName}" theme. Please carefully review their feedback and incorporate it into your analysis. Evolve your criticism based on what they've found useful or what they've addressed already. Don't repeat criticisms that have been addressed, but you may build upon partially addressed issues with more nuanced perspectives.`;
      
      Logger.log('OPENAI-API', `Found user feedback in the prompt for theme "${themeName}". Adding special instructions to system prompt.`);
    }

    const result = await this.makeRequest('/api/openaiwrap', {
      userPrompt,
      systemPrompt,
      useGpt4: true // Use GPT-4 for generating theme-specific analysis
    });

    return this.processOpenAIResponse(result, 5, `The design needs further consideration regarding ${themeName}.`);
  }

  /**
   * Generates multiple theme-specific analyses in parallel
   * @param userPrompt - The combined design decisions to analyze
   * @param themes - Array of theme objects with name and color
   * @param designChallenge - The context of the design challenge
   * @param consensusPoints - Array of consensus points that should not be questioned
   * @param designPrinciples - Array of design principles to prioritize
   * @param customSystemPrompt - Custom system prompt to add additional instructions
   * @param pointTagMappings - Previous point-tag mappings for learning
   * @returns Promise resolving to array of themed responses
   */
  public static async generateAllThemeAnalyses(
    userPrompt: string,
    themes: Array<{name: string, color: string}>,
    designChallenge: string,
    consensusPoints: string[] = [],
    designPrinciples?: string,
    customSystemPrompt?: string,
    pointTagMappings?: PointTagMapping[]
  ): Promise<Array<{name: string, color: string, points: string[]}>> {
    // Run all theme analyses in parallel
    const themeAnalysesPromises = themes.map(theme => 
      this.generateThemeSpecificAnalysis(
        userPrompt,
        theme.name,
        designChallenge,
        consensusPoints,
        designPrinciples,
        customSystemPrompt,
        pointTagMappings
      ).then(points => ({
        name: theme.name,
        color: theme.color,
        points
      }))
    );
    
    // Wait for all analyses to complete
    return Promise.all(themeAnalysesPromises);
  }

  /**
   * Simplifies a single analysis point to make it more concise
   * @param point - The analysis point to simplify
   * @returns Promise resolving to simplified point
   */
  public static async simplifyPoint(point: string): Promise<string> {
    const systemPrompt = `You are helping to simplify design criticism points to make them more concise and actionable.

Task: Simplify the given design criticism point to make it more concise while preserving the core critique.

Guidelines:
1. Reduce the length by 30-50% while preserving the main idea
2. Remove unnecessary explanations but keep the key concern
3. Maintain the tone of the original point
4. Make it direct and actionable
5. Don't add any new criticism that wasn't in the original`;

    const result = await this.makeRequest('/api/openaiwrap', {
      userPrompt: point,
      systemPrompt,
      useGpt4: true
    });

    // Remove any bullets or numbering the AI might have added
    let simplified = result.response.replace(/^\s*[\d*-]+\s*/, '').trim();
    
    // If somehow we got a completely empty result, return the original
    if (!simplified) {
      simplified = point;
    }

    return simplified;
  }

  /**
   * Adjusts the tone of a single analysis point
   * @param point - The analysis point to adjust
   * @param tone - The target tone (persuasive, aggressive, critical)
   * @returns Promise resolving to tone-adjusted point
   */
  public static async adjustPointTone(point: string, tone: string): Promise<string> {
    // Map the tone to a more descriptive guideline
    let toneGuideline = '';
    switch (tone) {
      case 'persuasive':
        toneGuideline = 'This should sound convincing, empathetic, and focused on mutual benefit. Use persuasive language that appeals to shared goals and values.';
        break;
      case 'aggressive':
        toneGuideline = 'This should sound forceful, direct, and uncompromising. Use strong language and be very direct about the issues.';
        break;
      case 'critical':
        toneGuideline = 'This should sound analytical, detailed, and thorough in the criticism. Emphasize specific flaws and why they are problematic.';
        break;
      default:
        // If an unrecognized tone, default to normal
        return point;
    }

    const systemPrompt = `You are helping to adjust the tone of design criticism points without changing their core message.

Task: Rewrite the given design criticism point in a ${tone} tone.

Tone guidelines: ${toneGuideline}

IMPORTANT:
1. Do NOT change the core criticism or concern
2. Do NOT add new criticisms or remove existing ones
3. Only change the tone and wording
4. Keep approximately the same length
5. Maintain the same level of technical detail`;

    const result = await this.makeRequest('/api/openaiwrap', {
      userPrompt: point,
      systemPrompt,
      useGpt4: true
    });

    // Remove any bullets or numbering the AI might have added
    let adjusted = result.response.replace(/^\s*[\d*-]+\s*/, '').trim();
    
    // If somehow we got a completely empty result, return the original
    if (!adjusted) {
      adjusted = point;
    }

    return adjusted;
  }

  /**
   * Generates a detailed illustration for a specific critique point.
   * @param originalPoint - The specific critique point to unpack.
   * @param designProposal - The full text of the design proposal (concatenated sticky notes).
   * @param designChallenge - The overall design challenge.
   * @param allCurrentPoints - An array of all current critique points for context.
   * @returns Promise resolving to the detailed illustration text.
   */
  public static async unpackPointDetail(
    originalPoint: string,
    designProposal: string,
    designChallenge: string,
    allCurrentPoints: string[]
  ): Promise<string> {
    const systemPrompt = `
You are an AI assistant specializing in design critique elaboration.
Your task is to take a concise design critique point and expand on it, providing a detailed and contextually relevant explanation for the specific critique point given the nature of wicked problems.

You will be given:
1. The original design proposal.
2. The overall design challenge.
3. A list of all critique points that were generated for this proposal (for context).
4. The specific critique point that needs to be unpacked.

Based on this information, provide a detailed illustration or explanation for the specific critique point.
The output should be a single block of text, suitable for a sticky note in 80 words or less.
Focus on clarifying *why* this point is a concern, what aspects of the proposal it relates to, or potential consequences.
Do not simply rephrase the original point. Add substantive detail. Maintain a professional and constructive tone.

Context:
Design Proposal:
---
${designProposal}
---
Design Challenge:
---
${designChallenge}
---
All Current Critique Points (for context, do not elaborate on these, only the one specified below):
---
- ${allCurrentPoints.join('\n- ')}
---
`;

    const userPromptForUnpack = `Please unpack the following critique point with detailed illustration:
"${originalPoint}"`;

    try {
      const result = await this.makeRequest('/api/openaiwrap', {
        userPrompt: userPromptForUnpack,
        systemPrompt,
        useGpt4: true, // Consider using GPT-4 for better elaboration
      });
      
      // The response should be the detailed illustration directly.
      // Add minimal cleaning if necessary, e.g., trim whitespace.
      return result.response.trim();
    } catch (error) {
      Logger.error('OPENAI-API', 'Error in unpackPointDetail:', error);
      throw error; // Re-throw to be caught by caller
    }
  }

  /**
   * Generates 3-4 separate explanation points for a specific critique point.
   * @param originalPoint - The specific critique point to unpack.
   * @param designProposal - The full text of the design proposal (concatenated sticky notes).
   * @param designChallenge - The overall design challenge.
   * @param allCurrentPoints - An array of all current critique points for context.
   * @returns Promise resolving to an array of explanation points.
   */
  public static async unpackPointDetailAsPoints(
    originalPoint: string,
    designProposal: string,
    designChallenge: string,
    allCurrentPoints: string[]
  ): Promise<string[]> {
    const systemPrompt = `
You are an AI assistant specializing in design critique elaboration.
Your task is to take a concise design critique point and provide a detailed explanation, then break that explanation into 3-4 logical parts.

You will be given:
1. The original design proposal.
2. The overall design challenge.
3. A list of all critique points that were generated for this proposal (for context).
4. The specific critique point that needs to be unpacked.

Based on this information:
1. First, develop a comprehensive explanation of WHY this criticism is valid and important
2. Then, break that explanation into 3-4 logical segments that flow together
3. Each segment should be concise (15-20 words max) but part of the larger explanation
4. The segments should read as a coherent explanation when combined

Return only the 3-4 segments, one per line, without bullet symbols or numbering.

Context:
Design Proposal:
---
${designProposal}
---
Design Challenge:
---
${designChallenge}
---
All Current Critique Points (for context, do not elaborate on these, only the one specified below):
---
- ${allCurrentPoints.join('\n- ')}
---
`;

    const userPromptForUnpack = `Please unpack the following critique point by creating one comprehensive explanation and breaking it into 3-4 flowing segments (max 10-15 words each):
"${originalPoint}"`;

    try {
      const result = await this.makeRequest('/api/openaiwrap', {
        userPrompt: userPromptForUnpack,
        systemPrompt,
        useGpt4: true, // Consider using GPT-4 for better elaboration
      });
      
      // Split response into individual points (by line breaks)
      const points = result.response.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .slice(0, 4); // Ensure max 4 points
      
      return points;
    } catch (error) {
      Logger.error('OPENAI-API', 'Error in unpackPointDetailAsPoints:', error);
      throw error; // Re-throw to be caught by caller
    }
  }

  /**
   * Synthesizes RAG content into actionable insights and takeaways
   * @param ragContent - The raw RAG content to synthesize
   * @param designChallenge - The current design challenge for context
   * @param designProposals - The current design proposals/decisions
   * @returns Promise resolving to synthesized insights as examples
   */
  public static async synthesizeRagInsights(
    ragContent: string,
    designChallenge: string,
    designProposals: string
  ): Promise<string> {
    const systemPrompt = `You are a design research analyst who synthesizes external knowledge and insights for design teams.

Your task is to analyze the provided external knowledge/research content and extract key insights that could inform design criticism for the current design challenge.

DESIGN CHALLENGE: ${designChallenge || 'No challenge specified'}

CURRENT DESIGN PROPOSALS TO INFORM:
${designProposals}

Instructions:
1. Extract 3-5 key insights, patterns, or lessons from the external content
2. For each insight, briefly explain how it might relate to the current design challenge and proposals
3. Present these as EXAMPLES and CONSIDERATIONS rather than strict requirements
4. Focus on insights that could help identify potential issues, risks, or opportunities
5. Keep insights actionable and relevant to design criticism
6. Use language like "Consider that...", "Research suggests...", "Similar projects have shown...", "One pattern to be aware of..."

Format your response as clear, numbered insights that can be used to inform (not dictate) the design analysis.

Do not make direct criticisms of the current proposals - instead, provide contextual insights that can help inform better criticism.`;

    try {
      // Use a custom timeout for synthesis since it can be complex
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 120 second timeout for synthesis

      const response = await fetch('/api/openaiwrap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userPrompt: ragContent,
          systemPrompt,
          useGpt4: true // Use GPT-4 for synthesis
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'No error text available');
        throw new Error(`API error (${response.status}): ${errorText}`);
      }

      const result = await response.json();

      Logger.log('OPENAI-API', 'Successfully synthesized RAG insights', {
        ragContentLength: ragContent.length,
        responseLength: result.response.length
      });

      return result.response;
    } catch (error: any) {
      Logger.error('OPENAI-API', 'Error synthesizing RAG insights:', error);
      if (error.name === 'AbortError') {
        throw new Error('RAG synthesis timed out after 120 seconds - content may be too large');
      }
      throw error;
    }
  }
} 