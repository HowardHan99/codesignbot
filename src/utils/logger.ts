/**
 * Simple logging utility for consistent logging throughout the application
 */
export class Logger {
  /**
   * Log informational message
   * @param context The context/area of the application
   * @param message The message to log
   * @param data Optional data to include
   */
  static log(context: string, message: string, data?: any): void {
    console.log(`[${context}] ${message}`, data ? data : '');
  }

  /**
   * Log warning message
   * @param context The context/area of the application
   * @param message The message to log
   * @param data Optional data to include
   */
  static warn(context: string, message: string, data?: any): void {
    console.warn(`[${context}] ${message}`, data ? data : '');
  }

  /**
   * Log error message
   * @param context The context/area of the application
   * @param message The message to log
   * @param error Optional error object or data to include
   */
  static error(context: string, message: string, error?: any): void {
    console.error(`[${context}] ${message}`, error ? error : '');
  }
} 