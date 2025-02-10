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
   * @returns Promise resolving to the formatted analysis
   */
  public static async generateAnalysis(userPrompt: string, designChallenge: string): Promise<string> {
    const systemPrompt = `The user has made several design decisions to tackle the design challenge: "${designChallenge || 'No challenge specified'}". Please analyze these decisions as a whole and provide antagonistic responses that show potential problems or conflicts between these decisions. Consider how these decisions might affect different stakeholders or create unexpected consequences when implemented together. Format your response as a list of points separated by ** **. Do not use numbers, bullet points, or ** ** within the points themselves that would create a split. Each point should be a complete, self-contained criticism. Example format: 'First criticism here ** ** Second criticism here ** ** Third criticism here'. DIRECTLY START WITH THE CRITICISM. No NEED FOR TITLE, SUMMARY, OR ANYTHING ELSE. Limit to 3 points.`;

    const result = await this.makeRequest('/api/openaiwrap', {
      userPrompt,
      systemPrompt,
    });

    return result.response.replace(/•/g, '**').replace(/\n/g, ' ** ');
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
    const result = await this.makeRequest('/api/openaiwrap', {
      userPrompt: response,
      systemPrompt: `Rewrite the following three criticism points using a ${newTone} tone. Keep the same core messages but adjust the language and delivery to match the ${newTone} tone. Ensure there are exactly three points. Format with ** ** between points. Do not add any additional text, numbers, or formatting.`
    });

    return result.response.replace(/•/g, '**').replace(/\n/g, ' ** ');
  }
} 