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
   * Generates an antagonistic analysis of design decisions
   * @param userPrompt - The combined design decisions to analyze
   * @param designChallenge - The context of the design challenge
   * @param existingPoints - Array of existing synthesized points to avoid overlap
   * @param consensusPoints - Array of consensus points that should not be questioned
   * @param relevantAnalyses - Array of relevant past analyses to learn from
   * @returns Promise resolving to the formatted analysis
   */
  public static async generateAnalysis(
    userPrompt: string, 
    designChallenge: string,
    existingPoints: string[] = [],
    consensusPoints: string[] = [],
    relevantAnalyses: Array<{ decisions: string[]; analysis: { full: string[]; simplified: string[] } }> = []
  ): Promise<string> {
    const existingPointsText = existingPoints.length > 0 
      ? `\n\nExisting criticism points to avoid overlapping with:\n${existingPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}`
      : '';

    const consensusPointsText = consensusPoints.length > 0
      ? `\n\nConsensus points that should NOT be questioned or criticized:\n${consensusPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}`
      : '';

    // Format relevant analyses for the prompt
    const relevantAnalysesText = relevantAnalyses.length > 0
      ? `\n\nHere are some relevant analyses from similar past design decisions that might be helpful:
${relevantAnalyses.map((item, i) => `
Example ${i + 1}:
Design Decisions:
${item.decisions.map((d, j) => `${j + 1}. ${d}`).join('\n')}

Analysis:
${item.analysis.full.map((a, j) => `${j + 1}. ${a}`).join('\n')}
`).join('\n')}`
      : '';

    const systemPrompt = `You are analyzing design decisions for the design challenge: "${designChallenge || 'No challenge specified'}". Provide exactly 3 critical points that identify potential problems or conflicts in these decisions.

Rules:
1. NEVER question or criticize the consensus points - these are established agreements that must be respected
2. Avoid overlapping with existing criticism points
3. Focus on potential problems, conflicts, or negative consequences to the underconsidered groups
4. Always provide EXACTLY 3 points, no more, no less
5. NEVER include titles, numbers, bullet points, or any other prefixes
6. NEVER use the word "Title:", "Point:", "Criticism:", or similar labels
7. Each point should be a complete, self-contained criticism
8. Keep each point focused on a single issue

Format your response as exactly 3 points separated by ** **. Example:
First complete criticism point here ** ** Second complete criticism point here ** ** Third complete criticism point here

Important:
- Start directly with the first point
- No introductions or summaries
- No numbering or bullet points
- No labels or titles
- Just the 3 points separated by ** **${consensusPointsText}${existingPointsText}`;

    const result = await this.makeRequest('/api/openaiwrap', {
      userPrompt,
      systemPrompt,
    });

    // Clean and validate the response
    let cleanedResponse = result.response
      .replace(/•/g, '') // Remove bullet points
      .replace(/\d+\./g, '') // Remove numbered lists
      .replace(/Title:|\bPoint\b:|\bCriticism\b:/gi, '') // Remove any titles or labels
      .replace(/\n+/g, ' ') // Replace newlines with spaces
      .replace(/\s+/g, ' ') // Normalize spaces
      .replace(/\*\*\s+\*\*/g, '**') // Clean up multiple ** sequences
      .trim();

    // Split points and ensure exactly 3
    let points = cleanedResponse.split('**').map(point => point.trim()).filter(point => point.length > 0);
    
    // If we have fewer than 3 points, repeat the last point
    while (points.length < 3) {
      points.push(points[points.length - 1] || 'This design decision requires further analysis');
    }
    
    // If we have more than 3 points, take only the first 3
    points = points.slice(0, 3);

    // Rejoin with proper separator
    return points.join(' ** ');
  }

  /**
   * Simplifies a given analysis into more concise points
   * @param response - The analysis to simplify
   * @returns Promise resolving to the simplified analysis
   */
  public static async simplifyAnalysis(response: string): Promise<string> {
    const result = await this.makeRequest('/api/openaiwrap', {
      userPrompt: response,
      systemPrompt: `Please simplify the following criticism points into three very concise, clear points. Each point should be no more than 20 words. Format the response with points separated by ** **. Do not include any other text, numbers, or formatting.`
    });

    return result.response.replace(/•/g, '**').replace(/\n/g, ' ** ');
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
      aggressive: `Act as a brutally honest critic who doesn't hold back. Use strong phrases like "You are completely wrong!", "How could you not see that...?". But not necessary these phrases. Be confrontational and direct, expressing strong disagreement and frustration.`,
      critical: `Act as a meticulous academic reviewer. Use analytical phrases like "This approach is fundamentally flawed...", "The evidence does not support...", "This lacks rigorous consideration of...", "A critical examination reveals...". Be thorough and uncompromising in your analysis.`
    };

    const result = await this.makeRequest('/api/openaiwrap', {
      userPrompt: response,
      systemPrompt: `${toneInstructions[newTone as keyof typeof toneInstructions] || 'Be direct but professional.'}
    Rewrite the following three criticism points using this personality and tone. Keep the core messages but adjust the language and delivery to match the personality. Format with ** ** between points. Do not add any additional text, numbers, or formatting.`
    });

    return result.response.replace(/•/g, '**').replace(/\n/g, ' ** ');
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
} 