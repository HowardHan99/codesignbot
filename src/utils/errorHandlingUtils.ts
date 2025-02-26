/**
 * Utility functions for error handling and logging
 */

/**
 * Interface for structured API error responses
 */
export interface ApiError {
  code: string;
  message: string;
  statusCode: number;
  context?: any;
}

/**
 * Structured logging of errors with proper context
 * @param error The error object
 * @param context Additional context information
 * @param operationName Name of the operation that failed
 */
export const logError = (error: any, context: any = {}, operationName: string = 'Operation'): void => {
  // Check if it's an API error with status code
  const statusCode = error.status || error.statusCode || 'unknown';
  
  // Structure the error log
  const structuredError = {
    timestamp: new Date().toISOString(),
    operation: operationName,
    message: error.message || 'Unknown error',
    statusCode,
    stack: error.stack,
    context
  };
  
  // For now we're using console.error, but could be replaced with a more robust logging system
  console.error(`[ERROR] ${operationName} failed:`, structuredError);
  
  // Could add telemetry/monitoring here in the future
};

/**
 * Safely handles API requests with proper error handling
 * @param apiCall The async API call function to execute
 * @param fallbackValue Optional fallback value to return if the API call fails
 * @param operationName Name of the operation for logging
 * @param context Additional context for error logging
 * @returns The API result or fallback value
 */
export async function safeApiCall<T>(
  apiCall: () => Promise<T>,
  fallbackValue: T | null = null,
  operationName: string = 'API call',
  context: any = {}
): Promise<T | null> {
  try {
    return await apiCall();
  } catch (error) {
    logError(error, context, operationName);
    return fallbackValue;
  }
}

/**
 * Formats a user-friendly error message for display in UI
 * @param error The error object
 * @param defaultMessage Default message to show if error doesn't have a message
 * @returns User-friendly error message
 */
export const formatErrorMessage = (error: any, defaultMessage: string = 'An error occurred'): string => {
  // API error with specific message
  if (error.response?.data?.message) {
    return error.response.data.message;
  }
  
  // Standard error object with message
  if (error.message) {
    // Clean up common error patterns
    let message = error.message;
    if (message.includes('NetworkError when attempting to fetch resource')) {
      return 'Network error. Please check your internet connection.';
    }
    if (message.includes('Failed to fetch')) {
      return 'Connection failed. Please try again.';
    }
    return message;
  }
  
  // String error
  if (typeof error === 'string') {
    return error;
  }
  
  // Fallback to default
  return defaultMessage;
}; 