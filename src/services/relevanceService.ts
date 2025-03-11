import { ConfigurationService } from './configurationService';
import { ApiService } from './apiService';
import { safeApiCall, logError } from '../utils/errorHandlingUtils';
import { OpenAIRequestParams } from './openaiCacheService';
/**
 * Type for relevance categories
 */
export type RelevanceCategory = 'relevant' | 'not-relevant';

/**
 * Interface for relevance evaluation results
 */
export interface RelevanceResult {
  category: RelevanceCategory;
  score: number;
}

/**
 * Service for evaluating the relevance of content to design decisions
 */
export class RelevanceService {
  // Use a shorter TTL for relevance evaluations since context may change
  private static readonly RELEVANCE_CACHE_TTL = 1000 * 60 * 30; // 30 minutes

  /**
   * Evaluate the relevance of a point to current design decisions
   * @param point The point to evaluate
   * @param designDecisions Array of design decisions to compare against
   * @param threshold Threshold for determining relevance (default from config)
   */
  public static async evaluateRelevance(
    point: string,
    designDecisions: string[],
    threshold: number = ConfigurationService.getRelevanceConfig().scale.defaultThreshold
  ): Promise<RelevanceResult> {
    // If no design decisions exist, everything is considered relevant with max score
    if (designDecisions.length === 0) {
      return { 
        category: 'relevant', 
        score: ConfigurationService.getRelevanceConfig().scale.max 
      };
    }
    
    // Default fallback result with maximum score if the API call fails
    const defaultResult: RelevanceResult = { 
      category: 'relevant', 
      score: ConfigurationService.getRelevanceConfig().scale.max 
    };
    
    // Use our safe API call wrapper
    const result = await safeApiCall<RelevanceResult>(
      async () => {
        // Create a prompt that asks for a numerical score 
        const designContext = designDecisions.join("\n");
        const systemPrompt = this.getSystemPrompt();
        const userPrompt = this.getUserPrompt(designContext, point);
        
        console.log(`Evaluating relevance for point: ${point.substring(0, 50)}...`);
        
        // Prepare params for the API call
        const params: OpenAIRequestParams = {
          systemPrompt,
          userPrompt,
          useGpt4: false, // Use a lighter model for faster response
          temperature: 0.3 // Lower temperature for more consistent results
        };
        
        // Use the API service
        const apiResult = await ApiService.callOpenAI(
          params, 
          this.RELEVANCE_CACHE_TTL
        );
        
        // Extract the numerical score from the response
        const scoreMatch = apiResult.response.match(/\d+/);
        let score = scoreMatch 
          ? parseInt(scoreMatch[0], 10) 
          : ConfigurationService.getRelevanceConfig().scale.defaultThreshold; // Default if no number found
        
        // Constrain score to allowed range in case of parsing issues
        const relevanceConfig = ConfigurationService.getRelevanceConfig();
        score = Math.max(
          relevanceConfig.scale.min, 
          Math.min(relevanceConfig.scale.max, score)
        );
        
        // Use the provided threshold for relevance category determination
        const category = score >= threshold ? 'relevant' : 'not-relevant';
        console.log(`Relevance evaluation: Score ${score}/${relevanceConfig.scale.max} - ${category} (threshold: ${threshold})`);
        
        return { category, score };
      },
      defaultResult,
      'Relevance Evaluation',
      { point: point.substring(0, 100), threshold }
    );
    
    // Return the result or the default if null
    return result || defaultResult;
  }
  
  /**
   * Get the system prompt for relevance evaluation
   */
  private static getSystemPrompt(): string {
    const relevanceConfig = ConfigurationService.getRelevanceConfig();
    
    return `You are an AI assistant that evaluates how relevant a design point is to current design decisions.
      
    Your task is to critically evaluate whether a given point directly addresses or builds upon the existing design decisions.
    
    Scoring criteria (${relevanceConfig.scale.max}-point scale):
    - ${relevanceConfig.scale.max}: HIGHLY RELEVANT - Directly addresses or builds upon specific design decisions. Clear and direct connection to existing work.
    - ${Math.ceil(relevanceConfig.scale.max/2)}: SOMEWHAT RELEVANT - Related to the general theme but connection to specific design decisions is weaker.
    - ${relevanceConfig.scale.min}: NOT RELEVANT - Off-topic or introduces entirely new concepts unrelated to current design decisions.
    
    Respond with ONLY a single numerical score (${relevanceConfig.scale.min}-${relevanceConfig.scale.max}) and nothing else.`;
  }
  
  /**
   * Get the user prompt for relevance evaluation
   */
  private static getUserPrompt(designContext: string, point: string): string {
    const relevanceConfig = ConfigurationService.getRelevanceConfig();
    
    return `Design Decisions:
${designContext}

Point to evaluate:
${point}

Rate this point's relevance to the design decisions above on a scale of ${relevanceConfig.scale.min}-${relevanceConfig.scale.max} (higher = more relevant).
Remember to be critical and rigorous in your assessment. Only assign the highest score (${relevanceConfig.scale.max}) if there's a very clear, direct connection.`;
  }
} 