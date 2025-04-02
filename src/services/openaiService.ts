/**
 * Interface for OpenAI API responses
 */
export interface OpenAIResponse {
  response: string;
}

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

    return await response.json();
  }

  /**
   * Common method to process and clean OpenAI responses
   * @param result - The raw OpenAI response
   * @param pointCount - Number of points to ensure in the result
   * @param fallbackText - The fallback text to use if needed
   * @returns Processed array of points
   */
  private static processOpenAIResponse(result: OpenAIResponse, pointCount: number, fallbackText: string): string[] {
    // Clean and validate the response
    let points = result.response
      .replace(/•/g, '')
      .replace(/\d+\./g, '')
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\*\*\s+\*\*/g, '**')
      .trim()
      .split('**')
      .map(point => point.trim())
      .filter(point => point.length > 0);

    // Ensure we have exactly the required number of points
    while (points.length < pointCount) {
      points.push(points.length > 0 ? points[points.length - 1] : fallbackText);
    }
    
    return points.slice(0, pointCount);
  }

  /**
   * Generates an antagonistic analysis of design decisions
   * @param userPrompt - The combined design decisions to analyze
   * @param designChallenge - The context of the design challenge
   * @param existingPoints - Array of existing synthesized points to avoid overlap
   * @param consensusPoints - Array of consensus points that should not be questioned
   * @returns Promise resolving to the formatted analysis
   */
  public static async generateAnalysis(
    userPrompt: string, 
    designChallenge: string,
    existingPoints: string[] = [],
    consensusPoints: string[] = []
  ): Promise<string> {
    const consensusPointsText = consensusPoints.length > 0
      ? `\n\nConsensus points that should NOT be questioned or criticized:\n${consensusPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}`
      : '';

    const systemPrompt = `You are analyzing design decisions for the design challenge: "${designChallenge || 'No challenge specified'}". Provide exactly 10 critical points that identify potential problems or conflicts in these decisions.

Rules:
1. NEVER question or criticize the consensus points - these are established agreements that must be respected
2. Focus on potential problems, conflicts, or negative consequences
3. Always provide EXACTLY 10 points, no more, no less
4. Each point should be a complete, self-contained criticism
5. Keep each point focused on a single issue

Format your response as exactly 10 points separated by ** **. Example:
First point here ** ** Second point here ** ** Third point here ** ** Fourth point here ** ** Fifth point here ** ** Sixth point here ** ** Seventh point here ** ** Eighth point here ** ** Ninth point here ** ** Tenth point here${consensusPointsText}`;

    const result = await this.makeRequest('/api/openaiwrap', {
      userPrompt,
      systemPrompt,
      useGpt4: true // Use GPT-4 for generating analysis
    });

    const points = this.processOpenAIResponse(result, 10, 'This design decision requires further analysis');

    // Filter for conflicts and preserve all 10 points
    const filteredPoints = await this.filterNonConflictingPoints(points, consensusPoints);
    
    return filteredPoints.join(' ** ');
  }

  /**
   * Filters points to ensure they don't conflict with consensus points
   */
  private static async filterNonConflictingPoints(
    points: string[], 
    consensusPoints: string[]
  ): Promise<string[]> {
    const systemPrompt = `You are filtering design criticism points to ensure they don't conflict with consensus points.

Consensus points that must not be contradicted:
${consensusPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}

Review these criticism points and:
1. Select all points that do NOT conflict with the consensus points
2. If a point conflicts with the consensus points such as the designer has already considered or addresses, skip it and move to the next one
3. If fewer than 10 non-conflicting points are found, generate substitutes that:
   - focus on different aspects, such as different user groups, different parts of the design decision, or different parts of the design process
   - Address different aspects than the consensus points
   - Maintain critical perspective
   - Are unique from other selected points

Return exactly 10 final points separated by ** **.`;

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
1. You MUST provide EXACTLY 3 points, no more, no less
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
1. You MUST provide EXACTLY 3 points, no more, no less
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
   * @returns Promise resolving to array of points specific to the theme
   */
  public static async generateThemeSpecificAnalysis(
    userPrompt: string,
    themeName: string,
    designChallenge: string,
    consensusPoints: string[] = []
  ): Promise<string[]> {
    const consensusPointsText = consensusPoints.length > 0
      ? `\n\nConsensus points that should NOT be questioned or criticized:\n${consensusPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}`
      : '';

    const systemPrompt = `You are analyzing design decisions for the design challenge: "${designChallenge || 'No challenge specified'}" with a specific focus on the theme "${themeName}".

Provide exactly 5 critical points that identify potential problems or conflicts related specifically to the "${themeName}" theme of these design decisions.

Rules:
1. NEVER question or criticize the consensus points - these are established agreements that must be respected
2. Focus on potential problems, conflicts, or negative consequences related to ${themeName}
3. Always provide EXACTLY 5 points, no more, no less
4. Each point should be a complete, self-contained criticism
5. Keep each point focused on a single issue within the ${themeName} theme

Format your response as exactly 5 points separated by ** **. Example:
First point here ** ** Second point here ** ** Third point here ** ** Fourth point here ** ** Fifth point here${consensusPointsText}`;

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
   * @returns Promise resolving to array of themed responses
   */
  public static async generateAllThemeAnalyses(
    userPrompt: string,
    themes: Array<{name: string, color: string}>,
    designChallenge: string,
    consensusPoints: string[] = []
  ): Promise<Array<{name: string, color: string, points: string[]}>> {
    // Run all theme analyses in parallel
    const themeAnalysesPromises = themes.map(theme => 
      this.generateThemeSpecificAnalysis(
        userPrompt,
        theme.name,
        designChallenge,
        consensusPoints
      ).then(points => ({
        name: theme.name,
        color: theme.color,
        points
      }))
    );
    
    // Wait for all analyses to complete
    return Promise.all(themeAnalysesPromises);
  }
} 