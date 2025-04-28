/**
 * Simple logging utility for consistent logging throughout the application
 */
export class Logger {
  // Array of contexts to exclude from logging
  private static excludedContexts: string[] = ['STICKY-POS','VR-STICKY','VR-STICKY-POS'];
  
  /**
   * Check if the context should be excluded from logging
   * @param context The context to check
   * @returns True if the context should be excluded
   */
  private static shouldExclude(context: string): boolean {
    return this.excludedContexts.some(excluded => 
      context.toUpperCase() === excluded.toUpperCase()
    );
  }
  
  /**
   * Add a context to the exclusion list
   * @param context Context to exclude from logging
   */
  static excludeContext(context: string): void {
    if (!this.excludedContexts.includes(context.toUpperCase())) {
      this.excludedContexts.push(context.toUpperCase());
    }
  }
  
  /**
   * Remove a context from the exclusion list
   * @param context Context to include in logging again
   */
  static includeContext(context: string): void {
    this.excludedContexts = this.excludedContexts.filter(
      excluded => excluded.toUpperCase() !== context.toUpperCase()
    );
  }

  /**
   * Log informational message
   * @param context The context/area of the application
   * @param message The message to log
   * @param data Optional data to include
   */
  static log(context: string, message: string, data?: any): void {
    if (this.shouldExclude(context)) return;
    console.log(`[${context}] ${message}`, data ? data : '');
  }

  /**
   * Log warning message
   * @param context The context/area of the application
   * @param message The message to log
   * @param data Optional data to include
   */
  static warn(context: string, message: string, data?: any): void {
    if (this.shouldExclude(context)) return;
    console.warn(`[${context}] ${message}`, data ? data : '');
  }

  /**
   * Log error message
   * @param context The context/area of the application
   * @param message The message to log
   * @param error Optional error object or data to include
   */
  static error(context: string, message: string, error?: any): void {
    if (this.shouldExclude(context)) return;
    console.error(`[${context}] ${message}`, error ? error : '');
  }
} 