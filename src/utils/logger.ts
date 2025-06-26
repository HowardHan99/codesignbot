/**
 * Simple logging utility for consistent logging throughout the application
 * By default, all logging is disabled. Use `enableContext` to allow specific contexts.
 */
export class Logger {
  // Array of contexts to explicitly enable for logging
  private static enabledContexts: string[] = ['TRANSCRIBE-API', 'AntagoInteract', 'MiroService'];
 
  /**
   * Check if the context should be logged
   * @param context The context to check
   * @returns True if the context is explicitly enabled
   */
  private static shouldLog(context: string): boolean {
    // Check if the specific context is in the enabled list (case-insensitive)
    return this.enabledContexts.some(enabled => 
      context.toUpperCase() === enabled.toUpperCase()
    );
  }
  
  /**
   * Enable logging for a specific context
   * @param context Context to enable logging for
   */
  static enableContext(context: string): void {
    const upperContext = context.toUpperCase();
    if (!this.enabledContexts.includes(upperContext)) {
      this.enabledContexts.push(upperContext);
    }
  }
  
  /**
   * Disable logging for a specific context
   * @param context Context to disable logging for
   */
  static disableContext(context: string): void {
    const upperContext = context.toUpperCase();
    this.enabledContexts = this.enabledContexts.filter(
      enabled => enabled !== upperContext
    );
  }

  /**
   * Disable logging for all contexts by clearing the enabled list.
   */
  static disableAllContexts(): void {
    this.enabledContexts = [];
  }

  /**
   * Log informational message if the context is enabled
   * @param context The context/area of the application
   * @param message The message to log
   * @param data Optional data to include
   */
  static log(context: string, message: string, data?: any): void {
    if (!this.shouldLog(context)) return;
    console.log(`[${context}] ${message}`, data !== undefined ? data : '');
  }

  /**
   * Log warning message if the context is enabled
   * @param context The context/area of the application
   * @param message The message to log
   * @param data Optional data to include
   */
  static warn(context: string, message: string, data?: any): void {
    if (!this.shouldLog(context)) return;
    console.warn(`[${context}] ${message}`, data !== undefined ? data : '');
  }

  /**
   * Log error message if the context is enabled
   * @param context The context/area of the application
   * @param message The message to log
   * @param error Optional error object or data to include
   */
  static error(context: string, message: string, error?: any): void {
    if (!this.shouldLog(context)) return;
    console.error(`[${context}] ${message}`, error !== undefined ? error : '');
  }
} 