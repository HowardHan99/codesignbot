/**
 * Interface for OpenAI API responses
 */
export interface OpenAIResponse {
  response: string;
}

import { PointTagMapping } from './miroService';
import { Logger } from '../utils/logger';

// Content from DesignChallenge.txt
const DEFAULT_DESIGN_CHALLENGE = 'How might we redesign the Pittsburgh 311 website to support civic participation and improve communication between residents and the city?';

const DEFAULT_BACKGROUND = `Pittsburgh 311 serves as the city's primary platform for residents to report non-emergency issues, such as potholes, graffiti, and bicycling hazards. According to a Civic Innovation Specialist in the Department of Innovation and Performance, "In some ways, 311 is the city's first line of defense." While the website is intended to facilitate digital reporting, the majority of users still rely on calling the 311 center. As a result, the digital platform remains underutilized. City staff must contend with an overwhelming volume of reports, many of which are low in quality or duplicated, adding to their operational burden.

KEY CHALLENGES:
• Multi-Channel Reporting with Limited Digital Adoption: The 311 service is available via phone, website, and mobile app. Despite multiple channels, most residents prefer reporting issues by phone. The call volume exceeds 80,000 annually and continues to grow.
• Residents' Friction and Frustration: Residents often feel their reports do not result in visible outcomes. Many users feel disconnected from the issue resolution process. The current platform lacks features to help users track the status of their reports.
• Operational Inefficiency and Staff Workload Challenges: City staff face a high volume of incoming reports, many of which are vague, incomplete, or outside the scope of 311 services. A significant portion of staff time is dedicated to manually reviewing, categorizing, and consolidating duplicate submissions.
• Untapped Community Engagement: Local advocates and grassroots groups actively report issues informally. These community efforts are rarely connected to official systems.

SUBGOALS:
• Increase usage of the website to reduce the volume of phone calls. Differentiate the site from the mobile app.
• Improve the quality of submitted reports to reduce staff workload.
• Enhance residents' overall satisfaction with the reporting process, encouraging continued engagement with digital platforms.`;

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
   * Generates an antagonistic analysis of design decisions with JSON output
   * @param userPrompt - The combined design decisions to analyze
   * @param designChallenge - The context of the design challenge
   * @param existingPoints - Array of existing synthesized points to avoid overlap
   * @param consensusPoints - Array of consensus points that should not be questioned
   * @param designPrinciples - Array of design principles to prioritize
   * @param customSystemPrompt - Custom system prompt to add additional instructions
   * @param pointTagMappings - Previous point-tag mappings for learning
   * @param discardedPoints - Points the user found irrelevant or wrong (AVOID these patterns)
   * @returns Promise resolving to the formatted analysis as JSON
   */
  public static async generateAnalysis(
    userPrompt: string, 
    designChallenge: string,
    existingPoints: string[] = [],
    consensusPoints: string[] = [],
    designPrinciples?: string,
    customSystemPrompt?: string,
    pointTagMappings?: PointTagMapping[],
    discardedPoints?: string[]
  ): Promise<string> {

    // Base system prompt template with JSON output requirement
    const BASE_SYSTEM_PROMPT = `You are a public-service design expert who is good at identifying the tensions and broad social implications of design proposals. You are analyzing design proposals and solutions for the design challenge with the following conditions background, and design challenge:

DESIGN CHALLENGE: ${designChallenge || DEFAULT_DESIGN_CHALLENGE}

BACKGROUND CONTEXT: ${designChallenge ? '' : DEFAULT_BACKGROUND}

Provide exactly 5 potential seed points that identify potential problems or conflicts in these decisions. Each point MUST follow this exact format:

"For [specific group of people/community members]: [A potential conflict or pushback they might raise - can be phrased as a question]"

Requirements:
- Each point should focus on a different group of people (e.g., community members, users, local government, elderly, youth, or people with different needs and values, etc.)
- The conflicts should be constructive and help the designer understand broader social implications and the needs of the community members
- Points should be concise and suitable for sticky note length
- Use language understandable by a non-design audience - avoid design jargon and big words
- The conflicts can be phrased as questions (e.g., "Won't this exclude people who...?" or "How will this affect...")
- Focus on real concerns that stakeholder would genuinely raise
- Remember that the user is redesigning a public service website, so the conflicts should be relevant to the design challenge and the design proposals
- Better to focus on the the tensions relevant to the design challenge and the design proposals
- Generate a diverse range of conflicts covering different aspects, stakeholder groups, and types of concerns
- In the Point Don't use Design Decision number as the user doesn't number the design decisions

CRITICAL: You must respond with valid JSON in exactly this format:
{
  "points": [
    "For elderly residents: Won't this new digital interface exclude those who aren't comfortable with technology?",
    "For local businesses: How will this change affect foot traffic and customer access to our stores?",
    "For community members: Won't this new digital interface exclude those who aren't comfortable with technology?",
    "For people with different needs and values: Won't this new digital interface exclude those who aren't comfortable with technology?",
    "For stakeholders: What are the potential implementation challenges of this approach?"
  ]
}

QUALITY CRITERIA - Prioritize points that are:
1. HIGHLY RELEVANT to the design challenge and specific design proposals (8+/10)
2. DIRECTLY MAPPED to specific design decisions in the proposal
3. HIGHLY CONFLICTUAL - challenging and likely to generate pushback (8+/10)
4. HIGHLY CONSTRUCTIVE - helping designers understand broader social implications (8+/10)
5. DIVERSE in stakeholder groups, concerns, and impact types`;

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
    
    // Add consensus points if any - STRONG INFLUENCE
    if (consensusPoints.length > 0) {
      messageParts.push(
        `\n\n--- CONSENSUS POINTS (DO NOT QUESTION OR CRITICIZE) ---\nThese are established agreements, or features that users want to preserve, that MUST be respected:\n${consensusPoints.join('\n')}`
      );
      systemPrompt += `\n\nCRITICAL: Do NOT question, criticize, or contradict the consensus points. These are the features that designers have agreed to keep.`;
    }
    
    // Add discarded points if any - STRONG INFLUENCE TO AVOID
    if (discardedPoints && discardedPoints.length > 0) {
      messageParts.push(
        `\n\n--- DISCARDED POINTS (AVOID THESE PATTERNS OR ANY SIMILAR TOPICS OR GROUP OF PEOPLE) ---\nThe user found these types of criticisms irrelevant or wrong, try to avoid these topics:\n${discardedPoints.join('\n')}`
      );
      systemPrompt += `\n\nIMPORTANT: The user has explicitly indicated that certain types of criticism are not useful. AVOID generating points that are similar in theme, focus, or approach to the discarded points. Instead, focus on different aspects, different user groups, different stages of the design process, or different social implications. Ensure your analysis is diverse and addresses areas NOT covered by the discarded patterns.`;
      
      // Add heterogeneity instructions for stronger diversity
      systemPrompt += `\n\nFor HETEROGENEITY: Since the user has provided discarded patterns, ensure your 5 points cover diverse perspectives such as: (1) different stakeholder groups, (2) different phases of implementation, (3) different scales of impact (individual vs community vs society), (4) different timeframes (immediate vs long-term), and (5) different types of risks (technical, social, ethical, economic). Avoid clustering around similar themes.`;
    }
    
    // Check for the "Previous User Feedback & Suggestions" in the userPrompt and extract it if found
    const incorporateSuggestionsLabel = "Previous User Define Directions: these are the directions that users want to go in OR SUGGESTIONS FOR THE GENERATION, CONSIDER THESE";
    const hasFeedback = userPrompt.includes(incorporateSuggestionsLabel);
    
    // Check for existing antagonistic points to avoid repetition
    const existingPointsLabel = "Existing Antagonistic Points (Avoid Repetition):";
    const hasExistingPoints = userPrompt.includes(existingPointsLabel);
    
    if (hasFeedback) {
      // Add instructions to consider previous feedback in the system prompt
      systemPrompt += `\n\nIMPORTANT: The user has provided feedback or directions that they might want more pushback on. Please carefully review their feedback and incorporate it into your analysis. Evolve your criticism based on what they've found useful or what directions they want to go in. Don't repeat criticisms that have been addressed, but you may build upon partially addressed issues with more nuanced perspectives.`;
      
      Logger.log('OPENAI-API', 'Found user feedback in the prompt. Adding special instructions to system prompt.');
    }
    
    if (hasExistingPoints) {
      // Add instructions to avoid repeating existing antagonistic points
      systemPrompt += `\n\nCRITICAL: The user has provided existing antagonistic critique points. You MUST avoid generating points that are similar in content, focus, or approach to these existing points. However, you CAN repeat the same stakeholder groups as long as the concerns are genuinely different. Focus on:
      - Different types of conflicts or concerns from the same or different stakeholder groups (social, technical, ethical, economic, accessibility, etc.)
      - Different aspects of the design decisions not already critiqued
      - Different timeframes or scales of impact not covered
      - Different underlying values, needs, or priorities not addressed
      
      For example, if existing points cover "For elderly residents: technology concerns", you could generate "For elderly residents: physical accessibility concerns" since these are different types of conflicts.
      
      Ensure your new critique points raise genuinely NEW concerns that complement (not duplicate) the existing critique points, even if they come from similar stakeholder groups.`;
      
      Logger.log('OPENAI-API', 'Found existing antagonistic points in the prompt. Adding anti-repetition instructions to system prompt.');
    }

    // Add final JSON formatting reminder
    systemPrompt += `\n\nREMEMBER: Your response must be valid JSON with exactly this structure:
{
  "points": [
    "point1",
    "point2", 
    "point3",
    "point4",
    "point5"
  ]
}`;

    const MAX_RETRIES = 3;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        Logger.log('OPENAI-API', `Starting generateAnalysis call with JSON output format (attempt ${attempt}/${MAX_RETRIES})`);
        
        // === LOG THE COMPLETE FINAL MESSAGE ===
        console.log(`JSON GENERATION STEP - Attempt ${attempt}`);
        console.log('GENERATION SYSTEM PROMPT:');
        console.log(systemPrompt);
        console.log('GENERATION USER PROMPT:');
        console.log(messageParts.join('\n'));
        
        const result = await this.makeRequest('/api/openaiwrap', {
          userPrompt: messageParts.join('\n'),
          systemPrompt,
          useGpt4: true,
          expectsJson: true // Signal that we expect JSON response
        });

        Logger.log('OPENAI-API', 'request to openai with JSON format', {
          userPrompt: messageParts.join('\n'),
          systemPrompt: systemPrompt,
          expectsJson: true,
          attempt: attempt
        });

        // Parse JSON response
        let parsedResponse;
        try {
          parsedResponse = JSON.parse(result.response);
        } catch (parseError) {
          console.error(`JSON parsing failed on attempt ${attempt}, raw response:`, result.response);
          Logger.error('OPENAI-API', `Failed to parse JSON response on attempt ${attempt}:`, parseError);
          
          if (attempt === MAX_RETRIES) {
            throw new Error(`Failed to get valid JSON response after ${MAX_RETRIES} attempts`);
          }
          continue; // Try again
        }

        // Validate response structure
        if (!parsedResponse.points || !Array.isArray(parsedResponse.points)) {
          Logger.error('OPENAI-API', `Invalid JSON response structure on attempt ${attempt}:`, parsedResponse);
          
          if (attempt === MAX_RETRIES) {
            throw new Error(`Invalid JSON response structure after ${MAX_RETRIES} attempts`);
          }
          continue; // Try again
        }

        // Ensure we have exactly 5 points
        let points = parsedResponse.points.filter((point: string) => point && point.trim().length > 0);
        
        if (points.length < 5) {
          Logger.log('OPENAI-API', `Only got ${points.length} points on attempt ${attempt}, need 5`);
          
          if (attempt === MAX_RETRIES) {
            throw new Error(`Could not get 5 valid points after ${MAX_RETRIES} attempts`);
          }
          continue; // Try again
        }

        // Take exactly 5 points
        points = points.slice(0, 5);

        console.log(`JSON GENERATION COMPLETE - Attempt ${attempt} successful`);
        console.log(`Final result: ${points.length} points in JSON format`);
        
        // Return as JSON string for compatibility with existing code
        return JSON.stringify({ points });
        
      } catch (error) {
        Logger.error('OPENAI-API', `Error in generateAnalysis attempt ${attempt}:`, error);
        
        if (attempt === MAX_RETRIES) {
          throw error; // Re-throw on final attempt
        }
        
        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // This should never be reached due to the throw in the loop
    throw new Error(`Failed to generate analysis after ${MAX_RETRIES} attempts`);
  }

  /**
   * Extracts points from malformed response as a fallback
   * @param response - The malformed response
   * @returns Array of extracted points
   */
  private static extractPointsFromMalformedResponse(response: string): string[] {
    // Try to find "For [group]:" patterns
    const forPatternPoints = response.split('\n')
      .map(line => line.trim())
      .filter(line => line.toLowerCase().startsWith('for ') && line.includes(':'))
      .slice(0, 5);
    
    if (forPatternPoints.length >= 3) {
      return forPatternPoints;
    }
    
    // Try numbered list parsing
    const numberedMatches = response.match(/\d+\.\s*.+/g);
    if (numberedMatches && numberedMatches.length >= 3) {
      return numberedMatches
        .map(match => match.replace(/^\d+\.\s*/, '').trim())
        .slice(0, 5);
    }
    
    // Return empty array instead of fallback points - let retry logic handle it
    return [];
  }

  /**
   * Simplifies a given analysis into more concise points
   * @param response - The analysis to simplify
   * @returns Promise resolving to the simplified analysis
   */
  public static async simplifyAnalysis(response: string): Promise<string> {
    // First parse the input to understand structure
    let inputPoints: string[] = [];
    try {
      const parsed = JSON.parse(response);
      if (parsed.points && Array.isArray(parsed.points)) {
        inputPoints = parsed.points;
      }
    } catch (e) {
      // Legacy format - split by ** delimiters
      inputPoints = response.split('**').map(point => point.trim()).filter(point => point.length > 0);
    }
    
    const pointCount = inputPoints.length;

    const systemPrompt = `Please simplify the following criticism points into ${pointCount} very concise, clear points.

Rules:
1. You MUST provide exactly ${pointCount} points, no more, no less
2. Each point should be no more than 20 words
3. Keep the core message of each original point
4. Maintain the same stakeholder focus as the original points
5. Do not use any numbering, bullet points, or labels

CRITICAL: You must respond with valid JSON in exactly this format:
{
  "points": [
    "simplified point 1",
    "simplified point 2",
    "simplified point 3"
  ]
}

The JSON must contain exactly ${pointCount} points corresponding to the ${pointCount} original points.`;

    const MAX_RETRIES = 3;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await this.makeRequest('/api/openaiwrap', {
          userPrompt: response,
          systemPrompt,
          useGpt4: true,
          expectsJson: true
        });

        // Parse JSON response
        let parsedResponse;
        try {
          parsedResponse = JSON.parse(result.response);
        } catch (parseError) {
          console.error(`JSON parsing failed on simplify attempt ${attempt}:`, result.response);
          if (attempt === MAX_RETRIES) {
            throw new Error(`Failed to get valid JSON response after ${MAX_RETRIES} attempts`);
          }
          continue;
        }

        // Validate response structure
        if (!parsedResponse.points || !Array.isArray(parsedResponse.points)) {
          if (attempt === MAX_RETRIES) {
            throw new Error(`Invalid JSON response structure after ${MAX_RETRIES} attempts`);
          }
          continue;
        }

        // Ensure we have the right number of points
        let points = parsedResponse.points.filter((point: string) => point && point.trim().length > 0);
        
        if (points.length < pointCount) {
          if (attempt === MAX_RETRIES) {
            throw new Error(`Could not get ${pointCount} valid points after ${MAX_RETRIES} attempts`);
          }
          continue;
        }

        // Take exactly the right number of points
        points = points.slice(0, pointCount);

        // Return as JSON string for compatibility
        return JSON.stringify({ points });
        
      } catch (error) {
        if (attempt === MAX_RETRIES) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    throw new Error(`Failed to simplify analysis after ${MAX_RETRIES} attempts`);
  }

  /**
   * Adjusts the tone of an analysis while maintaining the core message
   * @param response - The analysis to adjust
   * @param newTone - The desired tone (e.g., 'persuasive', 'aggressive', 'critical')
   * @returns Promise resolving to the tone-adjusted analysis
   */
  public static async adjustTone(response: string, newTone: string): Promise<string> {
    // First parse the input to understand structure
    let inputPoints: string[] = [];
    try {
      const parsed = JSON.parse(response);
      if (parsed.points && Array.isArray(parsed.points)) {
        inputPoints = parsed.points;
      }
    } catch (e) {
      // Legacy format - split by ** delimiters
      inputPoints = response.split('**').map(point => point.trim()).filter(point => point.length > 0);
    }
    
    const pointCount = inputPoints.length;

    const toneInstructions = {
      persuasive: `Act as a charismatic consultant who genuinely wants to help. Use phrases like "Consider this perspective...", "What if we looked at it this way...", "I understand the intention, however...", "Let's explore a different angle...". Be diplomatic but firm in your critiques.`,
      aggressive: `Act as a brutally honest critic who doesn't hold back. Use strong phrases like "This approach is fundamentally flawed!", "This completely misses the mark...". Be confrontational and direct, expressing strong disagreement and frustration.`,
      critical: `Act as a meticulous academic reviewer. Use analytical phrases like "The evidence does not support...", "This lacks rigorous consideration of...", "A critical examination reveals...". Be thorough and uncompromising in your analysis.`
    };

    const systemPrompt = `${toneInstructions[newTone as keyof typeof toneInstructions] || 'Be direct but professional.'}

Rules for the response:
1. You MUST provide exactly ${pointCount} points, no more, no less
2. Each point should be a complete, self-contained criticism
3. Do not use any numbering, bullet points, or labels
4. Keep each point focused on a single issue
5. Maintain the core message of each original point while adjusting the tone
6. Preserve the stakeholder focus of each original point

CRITICAL: You must respond with valid JSON in exactly this format:
{
  "points": [
    "tone-adjusted point 1",
    "tone-adjusted point 2",
    "tone-adjusted point 3"
  ]
}

The JSON must contain exactly ${pointCount} points corresponding to the ${pointCount} original points.

Rewrite the following criticism points using this format and tone. Do not add any additional text or formatting.`;

    const MAX_RETRIES = 3;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await this.makeRequest('/api/openaiwrap', {
          userPrompt: response,
          systemPrompt,
          useGpt4: true,
          expectsJson: true
        });

        // Parse JSON response
        let parsedResponse;
        try {
          parsedResponse = JSON.parse(result.response);
        } catch (parseError) {
          console.error(`JSON parsing failed on tone adjust attempt ${attempt}:`, result.response);
          if (attempt === MAX_RETRIES) {
            throw new Error(`Failed to get valid JSON response after ${MAX_RETRIES} attempts`);
          }
          continue;
        }

        // Validate response structure
        if (!parsedResponse.points || !Array.isArray(parsedResponse.points)) {
          if (attempt === MAX_RETRIES) {
            throw new Error(`Invalid JSON response structure after ${MAX_RETRIES} attempts`);
          }
          continue;
        }

        // Ensure we have the right number of points
        let points = parsedResponse.points.filter((point: string) => point && point.trim().length > 0);
        
        if (points.length < pointCount) {
          if (attempt === MAX_RETRIES) {
            throw new Error(`Could not get ${pointCount} valid points after ${MAX_RETRIES} attempts`);
          }
          continue;
        }

        // Take exactly the right number of points
        points = points.slice(0, pointCount);

        // Return as JSON string for compatibility
        return JSON.stringify({ points });
        
      } catch (error) {
        if (attempt === MAX_RETRIES) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    throw new Error(`Failed to adjust tone after ${MAX_RETRIES} attempts`);
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
    const systemPrompt = `You are a design critique agent helping with the design challenge: "${designChallenge || DEFAULT_DESIGN_CHALLENGE}".

${!designChallenge ? DEFAULT_BACKGROUND : ''}

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
   * @param discardedPoints - Points the user found irrelevant or wrong (AVOID these patterns)
   * @returns Promise resolving to array of points specific to the theme
   */
  public static async generateThemeSpecificAnalysis(
    userPrompt: string,
    themeName: string,
    designChallenge: string,
    consensusPoints: string[] = [],
    designPrinciples?: string,
    customSystemPrompt?: string,
    pointTagMappings?: PointTagMapping[],
    discardedPoints?: string[]
  ): Promise<string[]> {

    // Base system prompt template
    const BASE_THEME_SYSTEM_PROMPT = `You are analyzing design decisions for the design challenge: "${designChallenge || DEFAULT_DESIGN_CHALLENGE}" with a specific focus on the theme "${themeName}".

${!designChallenge ? `BACKGROUND: Pittsburgh 311 serves as the city's primary platform for residents to report non-emergency issues, such as potholes, graffiti, and bicycling hazards. According to a Civic Innovation Specialist in the Department of Innovation and Performance, "In some ways, 311 is the city's first line of defense." While the website is intended to facilitate digital reporting, the majority of users still rely on calling the 311 center. As a result, the digital platform remains underutilized. City staff must contend with an overwhelming volume of reports, many of which are low in quality or duplicated, adding to their operational burden.` : ''}

Provide exactly 3 critical points that identify potential problems or conflicts related specifically to the "${themeName}" theme of these design proposals. Each point MUST follow this exact format:

"For [specific stakeholder group]: [A potential conflict or pushback they might raise related to ${themeName} - can be phrased as a question]"

Requirements:
- Each point should focus on a different stakeholder group affected by the ${themeName} theme
- The conflicts should be constructive and help the designer understand broader social implications
- Points should be concise and suitable for sticky note length
- Use language understandable by a non-design audience - avoid design jargon and big words
- The conflicts can be phrased as questions (e.g., "Won't this exclude people who...?" or "How will this affect...")
- Focus on real concerns that stakeholder would genuinely raise about the ${themeName} aspect

Rules:
1. NEVER question or criticize the consensus points - these are established agreements that must be respected
2. Focus on potential problems, conflicts, or negative consequences related to ${themeName}
3. Always provide EXACTLY 3 points, no more, no less
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
    
    // Add discarded points guidance if any
    if (discardedPoints && discardedPoints.length > 0) {
      systemPrompt += `\n\nIMPORTANT: The user has indicated these types of criticism are not useful. For the "${themeName}" theme, AVOID generating points similar to these discarded patterns. Focus on different aspects of ${themeName} that haven't been covered:\n${discardedPoints.join('\n')}\n\nEnsure your "${themeName}"-focused points address different angles, user groups, or implications than the discarded patterns.`;
      
      // Add theme-specific heterogeneity guidance
      systemPrompt += `\n\nFor "${themeName}" HETEROGENEITY: Generate points that explore different dimensions of this theme - consider various stakeholder perspectives, different implementation challenges, immediate vs long-term implications, and different types of risks or opportunities within the ${themeName} domain. Ensure diversity even within this focused theme.`;
    }
    
    // Check for the "Previous User Feedback & Suggestions" in the userPrompt and extract it if found
    const incorporateSuggestionsLabel = "Previous User Define Directions: these are the directions that users want to go in OR SUGGESTIONS FOR THE GENERATION, CONSIDER THESE";
    const hasFeedback = userPrompt.includes(incorporateSuggestionsLabel);
    
    if (hasFeedback) {
      // Add instructions to consider previous feedback in the system prompt
      systemPrompt += `\n\nIMPORTANT: The user has provided feedback on previous iterations of design criticism related to the "${themeName}" theme. Please carefully review their feedback and incorporate it into your analysis. Evolve your criticism based on what they've found useful or what they've addressed already. Don't repeat criticisms that have been addressed, but you may build upon partially addressed issues with more nuanced perspectives.`;
      
      Logger.log('OPENAI-API', `Found user feedback in the prompt for theme "${themeName}". Adding special instructions to system prompt.`);
    }

    // Add JSON format requirement
    systemPrompt += `\n\nCRITICAL: You must respond with valid JSON in exactly this format:
{
  "points": [
    "For [stakeholder]: [theme-specific conflict/pushback]",
    "For [stakeholder]: [theme-specific conflict/pushback]",
    "For [stakeholder]: [theme-specific conflict/pushback]"
  ]
}`;

    const MAX_RETRIES = 3;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await this.makeRequest('/api/openaiwrap', {
          userPrompt,
          systemPrompt,
          useGpt4: true,
          expectsJson: true
        });

        // Parse JSON response
        let parsedResponse;
        try {
          parsedResponse = JSON.parse(result.response);
        } catch (parseError) {
          console.error(`JSON parsing failed on theme analysis attempt ${attempt}:`, result.response);
          if (attempt === MAX_RETRIES) {
            throw new Error(`Failed to get valid JSON response after ${MAX_RETRIES} attempts`);
          }
          continue;
        }

        // Validate response structure
        if (!parsedResponse.points || !Array.isArray(parsedResponse.points)) {
          if (attempt === MAX_RETRIES) {
            throw new Error(`Invalid JSON response structure after ${MAX_RETRIES} attempts`);
          }
          continue;
        }

        // Ensure we have exactly 3 points
        let points = parsedResponse.points.filter((point: string) => point && point.trim().length > 0);
        
        if (points.length < 3) {
          if (attempt === MAX_RETRIES) {
            throw new Error(`Could not get 3 valid points after ${MAX_RETRIES} attempts`);
          }
          continue;
        }

        // Take exactly 3 points
        points = points.slice(0, 3);

        return points;
        
      } catch (error) {
        if (attempt === MAX_RETRIES) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    throw new Error(`Failed to generate theme-specific analysis after ${MAX_RETRIES} attempts`);
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
   * @param discardedPoints - Points the user found irrelevant or wrong (AVOID these patterns)
   * @returns Promise resolving to array of themed responses
   */
  public static async generateAllThemeAnalyses(
    userPrompt: string,
    themes: Array<{name: string, color: string}>,
    designChallenge: string,
    consensusPoints: string[] = [],
    designPrinciples?: string,
    customSystemPrompt?: string,
    pointTagMappings?: PointTagMapping[],
    discardedPoints?: string[]
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
        pointTagMappings,
        discardedPoints
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
2. Remove unnecessary explanations but keep the key pushback
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
1. Do NOT change the core criticism or pushback
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
Focus on clarifying *why* this point is a pushback, what aspects of the proposal it relates to, or potential consequences.
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

  /**
   * Comprehensive generation method that handles all analysis variants in one optimized call
   * @param userPrompt - The combined design decisions to analyze
   * @param options - Configuration object with all the options
   * @returns Promise resolving to structured response with all variants
   */
  public static async generateComprehensiveAnalysis(
    userPrompt: string,
    options: {
      designChallenge: string;
      themes?: Array<{name: string, color: string}>;
      existingPoints?: string[];
      consensusPoints?: string[];
      designPrinciples?: string;
      customSystemPrompt?: string;
      pointTagMappings?: PointTagMapping[];
      discardedPoints?: string[];
      needsSimplified?: boolean;
      needsStandard?: boolean;
      variations?: {
        principles?: string;
        prompt?: string;
      };
    }
  ): Promise<{
    themedResponses?: Array<{name: string, color: string, points: string[]}>;
    standardResponse?: string;
    simplifiedResponse?: string;
    variations?: {
      principles?: string;
      prompt?: string;
    };
  }> {
    const results: any = {};

    // Main Analysis Generation - run in parallel
    const mainPromises: Promise<any>[] = [];

    // Generate themed analysis if themes are provided
    if (options.themes && options.themes.length > 0) {
      mainPromises.push(
        this.generateAllThemeAnalyses(
          userPrompt,
          options.themes,
          options.designChallenge,
          options.consensusPoints || [],
          options.designPrinciples,
          options.customSystemPrompt,
          options.pointTagMappings,
          options.discardedPoints
        ).then(themed => {
          results.themedResponses = themed;
          return themed;
        })
      );
    }

    // Generate standard analysis only if specifically needed or no themes
    if (options.needsStandard || !options.themes || options.themes.length === 0) {
      mainPromises.push(
        this.generateAnalysis(
          userPrompt,
          options.designChallenge,
          options.existingPoints || [],
          options.consensusPoints || [],
          options.designPrinciples,
          options.customSystemPrompt,
          options.pointTagMappings,
          options.discardedPoints
        ).then(standard => {
          results.standardResponse = standard;
          return standard;
        })
      );
    }

    // Generate variations if requested
    if (options.variations?.principles) {
      mainPromises.push(
        this.generateAnalysis(
          userPrompt,
          options.designChallenge,
          options.existingPoints || [],
          options.consensusPoints || [],
          options.variations.principles,
          undefined,
          options.pointTagMappings,
          options.discardedPoints
        ).then(principlesResponse => {
          if (!results.variations) results.variations = {};
          results.variations.principles = principlesResponse;
          return principlesResponse;
        })
      );
    }

    if (options.variations?.prompt) {
      mainPromises.push(
        this.generateAnalysis(
          userPrompt,
          options.designChallenge,
          options.existingPoints || [],
          options.consensusPoints || [],
          undefined,
          options.variations.prompt,
          options.pointTagMappings,
          options.discardedPoints
        ).then(promptResponse => {
          if (!results.variations) results.variations = {};
          results.variations.prompt = promptResponse;
          return promptResponse;
        })
      );
    }

    // Wait for all main analyses to complete
    await Promise.all(mainPromises);

    // Post-processing: Generate simplified versions if needed
    if (options.needsSimplified && results.standardResponse) {
      const simplifiedPromise = this.simplifyAnalysis(results.standardResponse).then(simplified => {
        results.simplifiedResponse = simplified;
        return simplified;
      });
      
      await simplifiedPromise;
    }

    Logger.log('OPENAI-API', 'Comprehensive analysis completed', {
      hasThemed: !!results.themedResponses,
      hasStandard: !!results.standardResponse,
      hasSimplified: !!results.simplifiedResponse,
      hasVariations: !!results.variations
    });

    return results;
  }
}