import { 
  frameConfig as defaultFrameConfig,
  stickyConfig as defaultStickyConfig,
  relevanceConfig as defaultRelevanceConfig,
  firebaseConfig as defaultFirebaseConfig
} from '../utils/config';

/**
 * Configuration service for managing and overriding application settings
 */
export class ConfigurationService {
  // Runtime configuration overrides
  private static frameConfigOverrides: Partial<typeof defaultFrameConfig> = {};
  private static stickyConfigOverrides: Partial<typeof defaultStickyConfig> = {};
  private static relevanceConfigOverrides: Partial<typeof defaultRelevanceConfig> = {};
  private static apiConfigOverrides: Record<string, any> = {};
  
  /**
   * Get frame configuration with any runtime overrides applied
   */
  public static getFrameConfig(): typeof defaultFrameConfig {
    return {
      ...defaultFrameConfig,
      ...this.frameConfigOverrides,
      // Merge nested properties
      names: {
        ...defaultFrameConfig.names,
        ...(this.frameConfigOverrides.names || {})
      },
      defaults: {
        ...defaultFrameConfig.defaults,
        ...(this.frameConfigOverrides.defaults || {})
      }
    };
  }
  
  /**
   * Get sticky note configuration with any runtime overrides applied
   */
  public static getStickyConfig(): typeof defaultStickyConfig {
    return {
      ...defaultStickyConfig,
      ...this.stickyConfigOverrides,
      // Merge nested properties
      dimensions: {
        ...defaultStickyConfig.dimensions,
        ...(this.stickyConfigOverrides.dimensions || {})
      },
      layout: {
        ...defaultStickyConfig.layout,
        ...(this.stickyConfigOverrides.layout || {})
      },
      colors: {
        ...defaultStickyConfig.colors,
        ...(this.stickyConfigOverrides.colors || {})
      }
    };
  }
  
  /**
   * Get relevance configuration with any runtime overrides applied
   */
  public static getRelevanceConfig(): typeof defaultRelevanceConfig {
    return {
      ...defaultRelevanceConfig,
      ...this.relevanceConfigOverrides,
      // Merge nested properties
      scale: {
        ...defaultRelevanceConfig.scale,
        ...(this.relevanceConfigOverrides.scale || {})
      }
    };
  }
  
  /**
   * Get Firebase configuration
   */
  public static getFirebaseConfig(): typeof defaultFirebaseConfig {
    return { ...defaultFirebaseConfig };
  }
  
  /**
   * Get API configuration for a specific API
   * @param apiName The API name (e.g., 'openai', 'miro')
   */
  public static getApiConfig(apiName: string): Record<string, any> {
    return this.apiConfigOverrides[apiName] || {};
  }
  
  /**
   * Override frame configuration at runtime
   * @param overrides Configuration overrides
   */
  public static overrideFrameConfig(overrides: Partial<typeof defaultFrameConfig>): void {
    this.frameConfigOverrides = {
      ...this.frameConfigOverrides,
      ...overrides
    };
  }
  
  /**
   * Override sticky configuration at runtime
   * @param overrides Configuration overrides
   */
  public static overrideStickyConfig(overrides: Partial<typeof defaultStickyConfig>): void {
    this.stickyConfigOverrides = {
      ...this.stickyConfigOverrides,
      ...overrides
    };
  }
  
  /**
   * Override relevance configuration at runtime
   * @param overrides Configuration overrides
   */
  public static overrideRelevanceConfig(overrides: Partial<typeof defaultRelevanceConfig>): void {
    this.relevanceConfigOverrides = {
      ...this.relevanceConfigOverrides,
      ...overrides
    };
  }
  
  /**
   * Override API configuration at runtime
   * @param apiName The API name (e.g., 'openai', 'miro')
   * @param overrides Configuration overrides
   */
  public static overrideApiConfig(apiName: string, overrides: Record<string, any>): void {
    this.apiConfigOverrides[apiName] = {
      ...(this.apiConfigOverrides[apiName] || {}),
      ...overrides
    };
  }
  
  /**
   * Reset all configuration overrides to defaults
   */
  public static resetToDefaults(): void {
    this.frameConfigOverrides = {};
    this.stickyConfigOverrides = {};
    this.relevanceConfigOverrides = {};
    this.apiConfigOverrides = {};
  }
} 