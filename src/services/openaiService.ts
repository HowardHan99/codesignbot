/**
 * Interface for OpenAI API responses
 */
export interface OpenAIResponse {
  response: string;
}

import { PointTagMapping } from './miroService';
import { Logger } from '../utils/logger';
import { ConfigurationService } from './configurationService';

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
 * Provides methods for generating stakeholder pushback and objections to design decisions
 */
export class OpenAIService {
  /**
   * Makes a request to the AI API endpoint (OpenAI or Gemini)
   * @param endpoint - The API endpoint to call ('/api/openaiwrap' or '/api/geminiwrap')
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
      console.error('Error in AI API request:', error);
      if (error.name === 'AbortError') {
        throw new Error('API request timed out after 60 seconds');
      }
      throw error; // Re-throw for handling upstream
    }
  }

  /**
   * Generates stakeholder pushback and objections to design decisions with JSON output
   * @param userPrompt - The combined design decisions to analyze
   * @param designChallenge - The context of the design challenge
   * @param existingPoints - Array of existing synthesized points to avoid overlap
   * @param consensusPoints - Array of consensus points that should not be questioned
   * @param designPrinciples - Array of design principles to prioritize
   * @param customSystemPrompt - Custom system prompt to add additional instructions
   * @param pointTagMappings - Previous point-tag mappings for learning
   * @param discardedPoints - Points the user found irrelevant or wrong (AVOID these patterns)
   * @param ragContent - RAG content to be included in system prompt for caching
   * @param synthesizedRagInsights - RAG insights to be included in system prompt for caching
   * @param provider - AI provider to use (optional, uses configured provider by default)
   * @returns Promise resolving to the stakeholder pushback as JSON
   */
  public static async generateAnalysis(
    userPrompt: string, 
    designChallenge: string,
    existingPoints: string[] = [],
    consensusPoints: string[] = [],
    designPrinciples?: string,
    customSystemPrompt?: string,
    pointTagMappings?: PointTagMapping[],
    discardedPoints?: string[],
    ragContent?: string,
    synthesizedRagInsights?: string,
    provider?: 'openai' | 'gemini'
  ): Promise<string> {

    // Use provider parameter if provided, otherwise use configured provider
    const aiConfig = ConfigurationService.getAiConfig();
    const selectedProvider = provider || aiConfig.provider;

    // Base system prompt template with JSON output requirement
    const BASE_SYSTEM_PROMPT = `You are channeling the voice of concerned community members and stakeholders who are raising genuine objections and resistance to design proposals. You represent the pushback and opposition that would emerge from real stakeholders when these design decisions are presented to them.

DESIGN CHALLENGE: ${designChallenge || DEFAULT_DESIGN_CHALLENGE}

BACKGROUND CONTEXT: ${designChallenge ? '' : DEFAULT_BACKGROUND}

Your task is to voice the genuine concerns, objections, and resistance that different stakeholder groups would raise when confronted with these design proposals. These are NOT suggestions for improvement - they are expressions of opposition, worry, and pushback.

Provide exactly 4 stakeholder objections that represent genuine pushback and resistance to these decisions. Each point MUST follow this exact format:

"[specific group of people/community members] might push back: [A genuine objection, concern, or resistance they would voice - can be phrased as a question or statement]"

Requirements:
- Each point should voice genuine opposition, resistance, or pushback that stakeholders would actually raise
- Each point should be a single stakeholder of a single concern
- These should sound like real objections you'd hear in community meetings, not helpful suggestions or advice on how to fix the design decisions.
- DO NOT GIVE ANY SUGGESTIONS OR ANALYSIS OF pushback point.
- YOU CAN USE AGGRESIVE TONE TO PUSHBACK TO THE DESIGN PROPOSALS .
- Points should be concise and suitable for sticky note length, which is about 50 words
- Don't be 50 words longer but also don't be too short
- The objections can be phrased as questions (e.g., "Why should we trust this when...?" or "What happens to people who...?") or statements of pushback. 
- Focus on CONCEPTUAL concerns that would create pushback, opposition, or resistance at this ideation stage - not implementation concerns or too much detail.
- Don't use any real commuity names or locations in the points
- Remember that these are objections to a public service website redesign ideation, so try to maintain the pushback and resistance at this stage and link it to specific design decisions. 
- Make it sound like stakeholders pushing back, not experts giving advice.
- Don't use the dash (-) in the points
- THERE CAN ALSO BE CONFLICTS BETWEEN THE POINTS YOU GENERATED. 

CRITICAL: You must respond with valid JSON in exactly this format:
{
  "points": [
    "stakeholder 1 or comunity group 1 might push back: [A genuine objection, concern, or resistance they would voice - can be phrased as a question or statement]",
    "stakeholder 2 or comunity group 2 might push back: [A genuine objection, concern, or resistance they would voice - can be phrased as a question or statement]",
    "stakeholder 3 or comunity group 3 might push back: [A genuine objection, concern, or resistance they would voice - can be phrased as a question or statement]",
    "stakeholder 4 or comunity group 4 might push back: [A genuine objection, concern, or resistance they would voice - can be phrased as a question or statement]"
  ]
}

QUALITY CRITERIA - Prioritize points that are:
1. HIGHLY RELEVANT to the design challenge and specific design proposals, especially something special that the designer is trying to do.
2. HIGHLY CONFLICTUAL - challenging and likely to generate genuine pushback
3. AUTHENTIC - sounding like real stakeholder resistance, not expert advice, or suggestions and advice on how to fix the design decisions.
4. DIVERSE in stakeholder groups, pushback, and types of opposition

IMPORTANT: If user feedback or directions are provided in the prompt, you MUST ensure AT LEAST 2 out of 4 points directly address or build upon that feedback. User feedback can be a feature that users want to go in or suggestions for the generation, consider these.`;

    // Use custom prompt if provided, otherwise use base prompt
    let systemPrompt = customSystemPrompt || BASE_SYSTEM_PROMPT;

    // Add RAG content to system prompt for caching optimization
    // When design proposals don't change, this allows the system prompt (including RAG content) to be cached
    // if (ragContent) {
    //   systemPrompt += `\n\n--- EXTERNAL KNOWLEDGE & RESEARCH INSIGHTS ---\nConsider these research insights and external knowledge when generating your analysis:Use this information to inform your critique but don't directly reference it unless highly relevant.`;
    // }

    // Add synthesized RAG insights to system prompt for caching optimization
    if (synthesizedRagInsights) {
      systemPrompt += `\n\n--- SYNTHESIZED RAG INSIGHTS (EXAMPLES & CONSIDERATIONS) ---\nConsider these synthesized insights and examples when generating your analysis:\n\n${synthesizedRagInsights}\n\nUse these insights to inform your critique but don't directly reference them unless highly relevant.`;
    }

    // Add high-level guidance for handling different types of user input to system prompt
    let userGuidanceNotes: string[] = [];
    if (pointTagMappings && pointTagMappings.length > 0) {
      userGuidanceNotes.push("user tagging preferences");
    }
    if (consensusPoints.length > 0) {
      userGuidanceNotes.push("consensus agreements");
    }
    if (discardedPoints && discardedPoints.length > 0) {
      userGuidanceNotes.push("discarded criticism patterns");
    }
    
    // Check for user feedback in the user prompt
    const incorporateSuggestionsLabel = "Previous User Define Directions: these are the directions that users want to go in OR SUGGESTIONS FOR THE GENERATION, CONSIDER THESE";
    const hasFeedback = userPrompt.includes(incorporateSuggestionsLabel);
    if (hasFeedback) {
      userGuidanceNotes.push("user feedback/directions");
    }
    
    // Check for existing antagonistic points
    const existingPointsLabel = "Existing Antagonistic Points (Avoid Repetition):";
    const hasExistingPoints = userPrompt.includes(existingPointsLabel);
    if (hasExistingPoints) {
      userGuidanceNotes.push("existing antagonistic points");
    }

    // Add high-level behavioral guidance to system prompt for caching
    if (userGuidanceNotes.length > 0) {
      systemPrompt += `\n\n--- USER INPUT GUIDANCE ---\nThe user has provided ${userGuidanceNotes.join(', ')} in their prompt. Follow these high-level principles while maintaining the tone of genuine stakeholder pushback and resistance:

      1. **User Tagging Preferences**: Learn from previously tagged points to understand what types of stakeholder opposition and resistance the user finds valuable vs not useful. Generate pushback that aligns with their demonstrated preferences for authentic stakeholder concerns.

      2. **Consensus Agreements**: Respect established agreements and features that users want to preserve. NEVER question, criticize, or contradict consensus points. These are off-limits for stakeholder pushback.

      3. **Discarded Criticism Patterns**: Avoid generating pushback similar to patterns the user found irrelevant or wrong. Focus on different types of stakeholder resistance, concerns from different user groups, implementation objections, or social opposition.

      4. **User Feedback/Directions**: When user feedback is provided, PRIORITIZE IT HEAVILY. Ensure AT LEAST 2 out of 4 points are directly relevant to the user's feedback, suggestions, or directions. Voice stakeholder concerns that specifically address what the user highlighted. Don't just acknowledge the feedback - make it a central focus of the stakeholder resistance. Build upon partially addressed issues with more nuanced opposition and ensure the feedback fundamentally shapes the type of pushback you generate.

      5. **Existing Antagonistic Points**: Avoid repetition by generating genuinely NEW stakeholder objections that complement (not duplicate) existing pushback points. You can use similar stakeholder groups if their concerns are genuinely different types of opposition.

  Apply these principles while maintaining authentic stakeholder voice and genuine resistance. The detailed content for these guidance types will be provided in the user prompt.`;
    }

    // Construct the main message parts
    const messageParts = [
      `Analyze the following design decisions:\n\n${userPrompt}`
    ];

    // Add point-tag mappings if provided (detailed content in user prompt)
    if (pointTagMappings && pointTagMappings.length > 0) {
      const { formatPointTagMappingsForPrompt } = await import('./miroService');
      const tagMappingsText = formatPointTagMappingsForPrompt(pointTagMappings);
      if (tagMappingsText) {
        messageParts.push(`\n--- USER TAGGING PREFERENCES (DETAILED) ---\n${tagMappingsText}`);
        messageParts.push(`\nBased on the above tagged points, generate points that align with the user's demonstrated preferences for what constitutes useful vs not useful criticism. Focus on the patterns they found valuable while still being critical and constructive.`);
      }
    }

    // Add design principles if provided
    if (designPrinciples) {
      messageParts.push(`\n\n--- KEY DESIGN PRINCIPLES TO PRIORITIZE ---\n${designPrinciples}`);
    }

    // Add synthesized points if any
    if (existingPoints.length > 0) {
      messageParts.push(
        `\n\n--- SYNTHESIZED THEMES FROM PREVIOUS DISCUSSIONS ---\nConsider these synthesized themes from previous discussions:\n${existingPoints.join('\n')}`
      );
    }
    
    // Add consensus points if any (detailed content in user prompt)
    if (consensusPoints.length > 0) {
      messageParts.push(
        `\n\n--- CONSENSUS POINTS (DETAILED) ---\nThese are established agreements, or features that users want to preserve, that MUST be respected:\n${consensusPoints.join('\n')}\n\nCRITICAL: Do NOT question, criticize, or contradict these consensus points. These are the features that designers have agreed to keep.`
      );
    }
    
    // Add discarded points if any (detailed content in user prompt)
    if (discardedPoints && discardedPoints.length > 0) {
      messageParts.push(
        `\n\n--- DISCARDED POINTS (DETAILED PATTERNS TO AVOID) ---\nThe user found these types of criticisms irrelevant or wrong, avoid these topics and similar patterns:\n${discardedPoints.join('\n')}\n\nIMPORTANT: AVOID generating points that are similar in theme, focus, or approach to the discarded points. Instead, focus on different aspects, different user groups, different stages of the design process, or different social implications. Ensure your analysis is diverse and addresses areas NOT covered by the discarded patterns.\n\nFor HETEROGENEITY: Since the user has provided discarded patterns, ensure your 4 points cover diverse perspectives, don't cluster around similar themes.`
      );
    }
    
    // Handle user feedback (detailed content in user prompt)
    if (hasFeedback) {
      messageParts.push(
        `\n\n--- USER FEEDBACK & DIRECTIONS (DETAILED) ---\nThe user has provided feedback or directions that they want more focus on. 

CRITICAL PRIORITY: You MUST ensure that AT LEAST 2 out of your 4 points are directly relevant to, build upon, or address the user's feedback and suggestions. This is not optional.

Instructions:
1. Carefully review the user feedback/suggestions provided
2. Generate stakeholder pushback that specifically responds to or builds upon what the user has highlighted
3. If the user suggests exploring certain stakeholder groups, conflicts, or aspects, voice opposition and concerns from those perspectives
4. Build upon partially addressed issues with more nuanced stakeholder resistance and objections
5. Ensure the feedback fundamentally shapes the type of pushback and opposition you generate

The remaining 2 points can address other aspects of the design, but the user's feedback should be the primary driver of the stakeholder pushback you voice.`
      );
    }
    
    // Handle existing antagonistic points (detailed content in user prompt)
    if (hasExistingPoints) {
      messageParts.push(
        `\n\n--- EXISTING ANTAGONISTIC POINTS (DETAILED) ---\nThere are some exsiting critique points. You MUST avoid generating points that are similar in content, focus, or approach to these existing points. However, you CAN repeat the same stakeholder groups as long as the concerns are genuinely different types of opposition, but the points must be different. `
      );
    }

    // Add final JSON formatting reminder
    systemPrompt += `\n\nREMEMBER: Your response must be valid JSON with exactly this structure:
{
  "points": [
    "point1",
    "point2", 
    "point3",
    "point4"
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
        
        // Determine API endpoint based on provider
        const endpoint = selectedProvider === 'gemini' ? '/api/geminiwrap' : '/api/openaiwrap';
        
        const result = await this.makeRequest(endpoint, {
          userPrompt: messageParts.join('\n'),
          systemPrompt,
          useGpt4: true,
          expectsJson: true // Signal that we expect JSON response
        });

        Logger.log('OPENAI-API', `request to ${selectedProvider} for stakeholder pushback generation with JSON format`, {
          userPrompt: messageParts.join('\n'),
          systemPrompt: systemPrompt,
          expectsJson: true,
          attempt: attempt,
          provider: selectedProvider
        });

        // Check if we got an empty response (common with Gemini)
        if (!result.response || result.response.trim() === '' || result.response === 'No response') {
          console.error(`Empty response from ${selectedProvider} on attempt ${attempt}`);
          Logger.error('OPENAI-API', `Empty response from ${selectedProvider} on attempt ${attempt}`);
          
          if (attempt === MAX_RETRIES) {
            throw new Error(`${selectedProvider} returned empty responses after ${MAX_RETRIES} attempts - this may be due to content filtering or API issues`);
          }
          
          // Wait longer before retrying for empty responses
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue; // Try again
        }

        // Parse JSON response
        let parsedResponse;
        try {
          parsedResponse = JSON.parse(result.response);
        } catch (parseError) {
          console.error(`JSON parsing failed on attempt ${attempt}, raw response:`, result.response);
          Logger.error('OPENAI-API', `Failed to parse JSON response from ${selectedProvider} on attempt ${attempt}:`, {
            error: parseError,
            rawResponse: result.response.substring(0, 500),
            provider: selectedProvider
          });
          
          if (attempt === MAX_RETRIES) {
            throw new Error(`Failed to get valid JSON response from ${selectedProvider} after ${MAX_RETRIES} attempts. Last response: ${result.response.substring(0, 200)}`);
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

        // Ensure we have exactly 4 points
        let points = parsedResponse.points.filter((point: string) => point && point.trim().length > 0);
        
        if (points.length < 4) {
          Logger.log('OPENAI-API', `Only got ${points.length} points on attempt ${attempt}, need 4`);
          
          if (attempt === MAX_RETRIES) {
            throw new Error(`Could not get 4 valid points after ${MAX_RETRIES} attempts`);
          }
          continue; // Try again
        }

        // Take exactly 4 points
        points = points.slice(0, 4);

        console.log(`JSON GENERATION COMPLETE - Attempt ${attempt} successful`);
        console.log(`Final result: ${points.length} stakeholder pushback points in JSON format`);
        
        // Return as JSON string for compatibility with existing code
        return JSON.stringify({ points });
        
      } catch (error) {
        Logger.error('OPENAI-API', `Error in generateAnalysis attempt ${attempt}:`, error);
        
        if (attempt === MAX_RETRIES) {
          // Add helpful error message for Gemini-specific issues
          if (selectedProvider === 'gemini' && error instanceof Error) {
            if (error.message.includes('safety restrictions') || error.message.includes('blocked')) {
              throw new Error(`${error.message}\n\nTip: Try switching to the OpenAI provider in the AI Provider dropdown, as it may be less restrictive for this type of content.`);
            } else if (error.message.includes('empty response')) {
              throw new Error(`${error.message}\n\nTip: Try switching to the OpenAI provider in the AI Provider dropdown, or try again as this may be a temporary Gemini API issue.`);
            }
          }
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
    // Try to find "[group] would push back:" patterns
    const pushbackPatterns = response.split('\n')
      .map(line => line.trim())
      .filter(line => line.toLowerCase().includes('would push back:'))
      .slice(0, 4);
    
    if (pushbackPatterns.length >= 3) {
      return pushbackPatterns;
    }
    
    // Fallback: Try to find older "might disagree:" patterns
    const mightDisagreePatterns = response.split('\n')
      .map(line => line.trim())
      .filter(line => line.toLowerCase().includes('might disagree:'))
      .slice(0, 4);
    
    if (mightDisagreePatterns.length >= 3) {
      return mightDisagreePatterns;
    }
    
    // Fallback: Try to find older "For [group]:" patterns
    const forPatternPoints = response.split('\n')
      .map(line => line.trim())
      .filter(line => line.toLowerCase().startsWith('for ') && line.includes(':'))
      .slice(0, 4);
    
    if (forPatternPoints.length >= 3) {
      return forPatternPoints;
    }
    
    // Try numbered list parsing
    const numberedMatches = response.match(/\d+\.\s*.+/g);
    if (numberedMatches && numberedMatches.length >= 3) {
      return numberedMatches
        .map(match => match.replace(/^\d+\.\s*/, '').trim())
        .slice(0, 4);
    }
    
    // Return empty array instead of fallback points - let retry logic handle it
    return [];
  }

  /**
   * Simplifies a given analysis into more concise points
   * @param response - The analysis to simplify
   * @returns Promise resolving to the simplified analysis
   */
//   public static async simplifyAnalysis(response: string): Promise<string> {
//     // First parse the input to understand structure
//     let inputPoints: string[] = [];
//     try {
//       const parsed = JSON.parse(response);
//       if (parsed.points && Array.isArray(parsed.points)) {
//         inputPoints = parsed.points;
//       }
//     } catch (e) {
//       // Legacy format - split by ** delimiters
//       inputPoints = response.split('**').map(point => point.trim()).filter(point => point.length > 0);
//     }
    
//     const pointCount = inputPoints.length;

//     const systemPrompt = `Please simplify the following criticism points into ${pointCount} very concise, clear points.

// Rules:
// 1. You MUST provide exactly ${pointCount} points, no more, no less
// 2. Each point should be no more than 20 words
// 3. Keep the core message of each original point
// 4. Maintain the same stakeholder focus as the original points
// 5. Do not use any numbering, bullet points, or labels

// CRITICAL: You must respond with valid JSON in exactly this format:
// {
//   "points": [
//     "simplified point 1",
//     "simplified point 2",
//     "simplified point 3"
//   ]
// }

// The JSON must contain exactly ${pointCount} points corresponding to the ${pointCount} original points.`;

//     const MAX_RETRIES = 3;
    
//     for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
//       try {
//         const result = await this.makeRequest('/api/openaiwrap', {
//           userPrompt: response,
//           systemPrompt,
//           useGpt4: true,
//           expectsJson: true
//         });

//         // Parse JSON response
//         let parsedResponse;
//         try {
//           parsedResponse = JSON.parse(result.response);
//         } catch (parseError) {
//           console.error(`JSON parsing failed on simplify attempt ${attempt}:`, result.response);
//           if (attempt === MAX_RETRIES) {
//             throw new Error(`Failed to get valid JSON response after ${MAX_RETRIES} attempts`);
//           }
//           continue;
//         }

//         // Validate response structure
//         if (!parsedResponse.points || !Array.isArray(parsedResponse.points)) {
//           if (attempt === MAX_RETRIES) {
//             throw new Error(`Invalid JSON response structure after ${MAX_RETRIES} attempts`);
//           }
//           continue;
//         }

//         // Ensure we have the right number of points
//         let points = parsedResponse.points.filter((point: string) => point && point.trim().length > 0);
        
//         if (points.length < pointCount) {
//           if (attempt === MAX_RETRIES) {
//             throw new Error(`Could not get ${pointCount} valid points after ${MAX_RETRIES} attempts`);
//           }
//           continue;
//         }

//         // Take exactly the right number of points
//         points = points.slice(0, pointCount);

//         // Return as JSON string for compatibility
//         return JSON.stringify({ points });
        
//       } catch (error) {
//         if (attempt === MAX_RETRIES) {
//           throw error;
//         }
//         await new Promise(resolve => setTimeout(resolve, 1000));
//       }
//     }
    
//     throw new Error(`Failed to simplify analysis after ${MAX_RETRIES} attempts`);
//   }

  /**
   * Adjusts the tone of an analysis while maintaining the core message
   * @param response - The analysis to adjust
   * @param newTone - The desired tone (e.g., 'persuasive', 'aggressive', 'critical')
   * @returns Promise resolving to the tone-adjusted analysis
   */
//   public static async adjustTone(response: string, newTone: string): Promise<string> {
//     // First parse the input to understand structure
//     let inputPoints: string[] = [];
//     try {
//       const parsed = JSON.parse(response);
//       if (parsed.points && Array.isArray(parsed.points)) {
//         inputPoints = parsed.points;
//       }
//     } catch (e) {
//       // Legacy format - split by ** delimiters
//       inputPoints = response.split('**').map(point => point.trim()).filter(point => point.length > 0);
//     }
    
//     const pointCount = inputPoints.length;

//     const toneInstructions = {
//       persuasive: `Act as a charismatic consultant who genuinely wants to help. Use phrases like "Consider this perspective...", "What if we looked at it this way...", "I understand the intention, however...", "Let's explore a different angle...". Be diplomatic but firm in your critiques.`,
//       aggressive: `Act as a brutally honest critic who doesn't hold back. Use strong phrases like "This approach is fundamentally flawed!", "This completely misses the mark...". Be confrontational and direct, expressing strong disagreement and frustration.`,
//       critical: `Act as a meticulous academic reviewer. Use analytical phrases like "The evidence does not support...", "This lacks rigorous consideration of...", "A critical examination reveals...". Be thorough and uncompromising in your analysis.`
//     };

//     const systemPrompt = `${toneInstructions[newTone as keyof typeof toneInstructions] || 'Be direct but professional.'}

// Rules for the response:
// 1. You MUST provide exactly ${pointCount} points, no more, no less
// 2. Each point should be a complete, self-contained criticism
// 3. Do not use any numbering, bullet points, or labels
// 4. Keep each point focused on a single issue
// 5. Maintain the core message of each original point while adjusting the tone
// 6. Preserve the stakeholder focus of each original point

// CRITICAL: You must respond with valid JSON in exactly this format:
// {
//   "points": [
//     "tone-adjusted point 1",
//     "tone-adjusted point 2",
//     "tone-adjusted point 3"
//   ]
// }

// The JSON must contain exactly ${pointCount} points corresponding to the ${pointCount} original points.

// Rewrite the following criticism points using this format and tone. Do not add any additional text or formatting.`;

//     const MAX_RETRIES = 3;
    
//     for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
//       try {
//         const result = await this.makeRequest('/api/openaiwrap', {
//           userPrompt: response,
//           systemPrompt,
//           useGpt4: true,
//           expectsJson: true
//         });

//         // Parse JSON response
//         let parsedResponse;
//         try {
//           parsedResponse = JSON.parse(result.response);
//         } catch (parseError) {
//           console.error(`JSON parsing failed on tone adjust attempt ${attempt}:`, result.response);
//           if (attempt === MAX_RETRIES) {
//             throw new Error(`Failed to get valid JSON response after ${MAX_RETRIES} attempts`);
//           }
//           continue;
//         }

//         // Validate response structure
//         if (!parsedResponse.points || !Array.isArray(parsedResponse.points)) {
//           if (attempt === MAX_RETRIES) {
//             throw new Error(`Invalid JSON response structure after ${MAX_RETRIES} attempts`);
//           }
//           continue;
//         }

//         // Ensure we have the right number of points
//         let points = parsedResponse.points.filter((point: string) => point && point.trim().length > 0);
        
//         if (points.length < pointCount) {
//           if (attempt === MAX_RETRIES) {
//             throw new Error(`Could not get ${pointCount} valid points after ${MAX_RETRIES} attempts`);
//           }
//           continue;
//         }

//         // Take exactly the right number of points
//         points = points.slice(0, pointCount);

//         // Return as JSON string for compatibility
//         return JSON.stringify({ points });
        
//       } catch (error) {
//         if (attempt === MAX_RETRIES) {
//           throw error;
//         }
//         await new Promise(resolve => setTimeout(resolve, 1000));
//       }
//     }
    
//     throw new Error(`Failed to adjust tone after ${MAX_RETRIES} attempts`);
//   }

  /**
   * Generates a response in a conversation context
   * @param userMessage - The user's current message
   * @param designChallenge - The context of the design challenge
   * @param currentCriticism - Array of current criticism points
   * @param conversationContext - Previous conversation history
   * @returns Promise resolving to the assistant's response
   */
//   public static async generateConversationResponse(
//     userMessage: string,
//     designChallenge: string,
//     currentCriticism: string[],
//     conversationContext: string
//   ): Promise<string> {
//     const systemPrompt = `You are a design critique agent helping with the design challenge: "${designChallenge || DEFAULT_DESIGN_CHALLENGE}".

// ${!designChallenge ? DEFAULT_BACKGROUND : ''}

// You have provided these criticisms:
// ${currentCriticism.map((c, i) => `${i + 1}. ${c}`).join('\n')}

// Previous conversation context:
// ${conversationContext}

// Rules:
// 1. If the user clarifies something about your criticism, remember it for future interactions
// 2. If the user disagrees with a point, engage in a constructive discussion
// 3. Keep responses focused on the design challenge and your criticisms
// 4. Be direct but professional
// 5. If the user types "noted", acknowledge and move on
// 6. If you receive an instruction starting with "instruct:", follow it precisely

// Respond to the user's message in a helpful and constructive way.`;

//     const result = await this.makeRequest('/api/openaiwrap', {
//       userPrompt: userMessage,
//       systemPrompt,
//     });

//     return result.response;
//   }

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
      // Always use OpenAI for unpack points (faster)
      const endpoint = '/api/openaiwrap';
      
      const result = await this.makeRequest(endpoint, {
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

--- EXTERNAL KNOWLEDGE & RESEARCH CONTENT ---
${ragContent}

Instructions:
1. Extract 3-5 key insights, patterns, or lessons from the external content above
2. For each insight, briefly explain how it might relate to the current design challenge and proposals
3. Present these as EXAMPLES and CONSIDERATIONS rather than strict requirements
4. Focus on insights that could help identify potential issues, risks, or opportunities
5. Keep insights actionable and relevant to design criticism
6. Use language like "Consider that...", "Research suggests...", "Similar projects have shown...", "One pattern to be aware of..."

Format your response as clear, numbered insights that can be used to inform (not dictate) the design analysis.

Do not make direct criticisms of the current proposals - instead, provide contextual insights that can help inform better criticism.`;

    const userPrompt = `Please synthesize the provided external knowledge and research content into actionable insights that could inform design criticism for the current design challenge and proposals.`;

    try {
      // Use a custom timeout for synthesis since it can be complex
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 120 second timeout for synthesis

      // Always use OpenAI for RAG synthesis (faster)
      const endpoint = '/api/openaiwrap';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userPrompt: userPrompt,
          systemPrompt: systemPrompt,
          useGpt4: true
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
      ragContent?: string;
      synthesizedRagInsights?: string;
      needsSimplified?: boolean;
      needsStandard?: boolean;
      provider?: 'openai' | 'gemini';
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

    // Get configured provider if not explicitly provided
    const aiConfig = ConfigurationService.getAiConfig();
    const selectedProvider = options.provider || aiConfig.provider;

    // Main Analysis Generation - run in parallel
    const mainPromises: Promise<any>[] = [];

    // Generate themed analysis if themes are provided
    /*
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
    */

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
          options.discardedPoints,
          options.ragContent,
          options.synthesizedRagInsights,
          selectedProvider
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
          options.discardedPoints,
          options.ragContent,
          options.synthesizedRagInsights,
          selectedProvider
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
          options.discardedPoints,
          options.ragContent,
          options.synthesizedRagInsights,
          selectedProvider
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
    // if (options.needsSimplified && results.standardResponse) {
    //   const simplifiedPromise = this.simplifyAnalysis(results.standardResponse).then(simplified => {
    //     results.simplifiedResponse = simplified;
    //     return simplified;
    //   });
      
    //   await simplifiedPromise;
    // }

    Logger.log('OPENAI-API', 'Comprehensive pushback generation completed', {
      hasThemed: !!results.themedResponses,
      hasStandard: !!results.standardResponse,
      hasSimplified: !!results.simplifiedResponse,
      hasVariations: !!results.variations
    });

    return results;
  }
}
