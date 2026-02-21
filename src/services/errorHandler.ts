/**
 * Centralized error handling service
 * Provides consistent error messages, retry logic, and logging
 */

import { logger } from './logger';

// Error type constants
export const ERROR_TYPES = {
  NETWORK: 'NETWORK_ERROR',
  AUTH: 'AUTH_ERROR',
  SERVER: 'SERVER_ERROR',
  VALIDATION: 'VALIDATION_ERROR',
  TIMEOUT: 'TIMEOUT_ERROR',
  UNKNOWN: 'UNKNOWN_ERROR',
} as const;

export type ErrorType = typeof ERROR_TYPES[keyof typeof ERROR_TYPES];

// User-friendly error messages
const USER_MESSAGES: Record<string, string> = {
  // Network errors
  'Failed to fetch': 'Unable to connect to the server. Please check your internet connection.',
  'ECONNREFUSED': 'Unable to connect to the server. The service may be unavailable.',
  'ENOTFOUND': 'Unable to reach the server. Please check your network settings.',
  'ETIMEDOUT': 'Connection timed out. Please try again.',
  'ECONNRESET': 'Connection was reset. Please try again.',
  'NetworkError': 'A network error occurred. Please check your connection.',
  'Network request failed': 'Unable to connect to the server. Please try again.',
  
  // Auth errors
  '401': 'Your session has expired. Please log in again.',
  '403': 'You do not have permission to perform this action.',
  'Unauthorized': 'Your session has expired. Please log in again.',
  'Forbidden': 'You do not have permission to access this resource.',
  'Session expired': 'Your session has expired. Please log in again.',
  'No access token': 'You are not logged in. Please log in to continue.',
  
  // Server errors
  '500': 'An unexpected server error occurred. Please try again later.',
  '502': 'The server is temporarily unavailable. Please try again later.',
  '503': 'The service is currently unavailable. Please try again later.',
  '504': 'The server took too long to respond. Please try again.',
  'Internal Server Error': 'An unexpected server error occurred. Please try again later.',
  
  // Validation errors
  '400': 'Invalid request. Please check your input and try again.',
  '422': 'The data provided is invalid. Please correct the errors and try again.',
  'Bad Request': 'Invalid request. Please check your input and try again.',
  
  // Timeout
  'AbortError': 'The request timed out. Please try again.',
  'Request timeout': 'The request took too long. Please try again.',
  'timeout': 'The request timed out. Please try again.',
};

export interface ErrorDetails {
  type: ErrorType;
  message: string;
  userMessage: string;
  status?: number;
  originalError?: Error;
  retryable: boolean;
}

/**
 * Check if the error is a network error
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError && error.message === 'Failed to fetch') {
    return true;
  }
  
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('etimedout') ||
      message.includes('econnreset') ||
      message.includes('failed to fetch') ||
      message.includes('unable to connect')
    );
  }
  
  return false;
}

/**
 * Check if the error is an authentication error (401/403)
 */
export function isAuthError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('401') ||
      message.includes('403') ||
      message.includes('unauthorized') ||
      message.includes('forbidden') ||
      message.includes('session expired') ||
      message.includes('authentication') ||
      message.includes('no access token')
    );
  }
  
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status: number }).status;
    return status === 401 || status === 403;
  }
  
  return false;
}

/**
 * Check if the error is a server error (5xx)
 */
export function isServerError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message;
    return (
      message.includes('500') ||
      message.includes('502') ||
      message.includes('503') ||
      message.includes('504') ||
      message.includes('Internal Server Error') ||
      message.includes('Bad Gateway') ||
      message.includes('Service Unavailable') ||
      message.includes('Gateway Timeout')
    );
  }
  
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status: number }).status;
    return status >= 500 && status < 600;
  }
  
  return false;
}

/**
 * Check if the error is a validation error (400/422)
 */
export function isValidationError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message;
    return (
      message.includes('400') ||
      message.includes('422') ||
      message.includes('Bad Request') ||
      message.includes('Unprocessable') ||
      message.includes('validation')
    );
  }
  
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status: number }).status;
    return status === 400 || status === 422;
  }
  
  return false;
}

/**
 * Check if the error is a timeout error
 */
export function isTimeoutError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.name === 'AbortError' ||
      error.message.toLowerCase().includes('timeout') ||
      error.message.toLowerCase().includes('timed out')
    );
  }
  
  return false;
}

/**
 * Determine the error type from an error
 */
export function getErrorType(error: unknown): ErrorType {
  if (isTimeoutError(error)) return ERROR_TYPES.TIMEOUT;
  if (isNetworkError(error)) return ERROR_TYPES.NETWORK;
  if (isAuthError(error)) return ERROR_TYPES.AUTH;
  if (isServerError(error)) return ERROR_TYPES.SERVER;
  if (isValidationError(error)) return ERROR_TYPES.VALIDATION;
  return ERROR_TYPES.UNKNOWN;
}

/**
 * Get a user-friendly error message
 */
export function getUserFriendlyMessage(error: unknown): string {
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  // Check for exact matches first
  for (const [key, message] of Object.entries(USER_MESSAGES)) {
    if (errorMessage.includes(key)) {
      return message;
    }
  }
  
  // Check error type and return generic message
  const errorType = getErrorType(error);
  switch (errorType) {
    case ERROR_TYPES.NETWORK:
      return 'Unable to connect to the server. Please check your connection.';
    case ERROR_TYPES.AUTH:
      return 'Your session has expired. Please log in again.';
    case ERROR_TYPES.SERVER:
      return 'A server error occurred. Please try again later.';
    case ERROR_TYPES.VALIDATION:
      return 'Invalid request. Please check your input.';
    case ERROR_TYPES.TIMEOUT:
      return 'The request timed out. Please try again.';
    default:
      return 'An unexpected error occurred. Please try again.';
  }
}

/**
 * Parse an error into a structured ErrorDetails object
 */
export function parseError(error: unknown): ErrorDetails {
  const type = getErrorType(error);
  const message = error instanceof Error ? error.message : String(error);
  const userMessage = getUserFriendlyMessage(error);
  
  // Extract status code if available
  let status: number | undefined;
  if (typeof error === 'object' && error !== null && 'status' in error) {
    status = (error as { status: number }).status;
  } else {
    // Try to extract from message
    const statusMatch = message.match(/\b([45]\d{2})\b/);
    if (statusMatch) {
      status = parseInt(statusMatch[1], 10);
    }
  }
  
  // Determine if error is retryable
  const retryable = type === ERROR_TYPES.NETWORK || 
                    type === ERROR_TYPES.SERVER || 
                    type === ERROR_TYPES.TIMEOUT;
  
  return {
    type,
    message,
    userMessage,
    status,
    originalError: error instanceof Error ? error : undefined,
    retryable,
  };
}

// Retry options
export interface RetryOptions {
  maxRetries?: number;
  backoff?: boolean;
  initialDelayMs?: number;
  maxDelayMs?: number;
  retryableErrors?: ErrorType[];
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
}

const DEFAULT_RETRY_OPTIONS: Required<Omit<RetryOptions, 'onRetry'>> & { onRetry?: RetryOptions['onRetry'] } = {
  maxRetries: 3,
  backoff: true,
  initialDelayMs: 1000,
  maxDelayMs: 8000,
  retryableErrors: [ERROR_TYPES.NETWORK, ERROR_TYPES.SERVER, ERROR_TYPES.TIMEOUT],
  onRetry: undefined,
};

/**
 * Calculate delay for exponential backoff
 */
function calculateBackoffDelay(
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number
): number {
  // Exponential backoff: 1s, 2s, 4s, 8s, ...
  const delay = initialDelayMs * Math.pow(2, attempt - 1);
  // Add jitter (±10%)
  const jitter = delay * 0.1 * (Math.random() * 2 - 1);
  return Math.min(delay + jitter, maxDelayMs);
}

/**
 * Sleep for a given duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic
 * 
 * @example
 * ```typescript
 * const result = await withRetry(
 *   () => api.fetchData(),
 *   { maxRetries: 3, backoff: true }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: unknown;
  
  for (let attempt = 1; attempt <= opts.maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const errorType = getErrorType(error);
      
      // Check if this error type is retryable
      const isRetryable = opts.retryableErrors.includes(errorType);
      
      // If not retryable or we've exhausted retries, throw
      if (!isRetryable || attempt > opts.maxRetries) {
        throw error;
      }
      
      // Calculate delay
      const delayMs = opts.backoff
        ? calculateBackoffDelay(attempt, opts.initialDelayMs, opts.maxDelayMs)
        : opts.initialDelayMs;
      
      // Log retry attempt
      logger.warn(
        `[Retry] Attempt ${attempt}/${opts.maxRetries} failed (${errorType}). ` +
        `Retrying in ${Math.round(delayMs)}ms...`
      );
      
      // Call onRetry callback if provided
      if (opts.onRetry) {
        opts.onRetry(attempt, error, delayMs);
      }
      
      // Wait before retrying
      await sleep(delayMs);
    }
  }
  
  // This should never be reached, but TypeScript needs it
  throw lastError;
}

/**
 * Wrap an async operation with error handling
 * Returns a tuple of [result, error] for easier handling
 * 
 * @example
 * ```typescript
 * const [data, error] = await safeAsync(() => api.fetchData());
 * if (error) {
 *   console.log(error.userMessage);
 * } else {
 *   console.log(data);
 * }
 * ```
 */
export async function safeAsync<T>(
  fn: () => Promise<T>
): Promise<[T, null] | [null, ErrorDetails]> {
  try {
    const result = await fn();
    return [result, null];
  } catch (error) {
    const errorDetails = parseError(error);
    logger.error('[SafeAsync] Error:', errorDetails.message);
    return [null, errorDetails];
  }
}

/**
 * Wrap an async operation with error handling and retry logic
 * 
 * @example
 * ```typescript
 * const [data, error] = await safeAsyncWithRetry(
 *   () => api.fetchData(),
 *   { maxRetries: 2 }
 * );
 * ```
 */
export async function safeAsyncWithRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<[T, null] | [null, ErrorDetails]> {
  try {
    const result = await withRetry(fn, options);
    return [result, null];
  } catch (error) {
    const errorDetails = parseError(error);
    logger.error('[SafeAsyncWithRetry] Error after retries:', errorDetails.message);
    return [null, errorDetails];
  }
}

/**
 * Create a wrapped function that automatically handles errors
 */
export function createErrorHandler<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options?: {
    retry?: RetryOptions;
    onError?: (error: ErrorDetails) => void;
  }
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    try {
      if (options?.retry) {
        return await withRetry(() => fn(...args), options.retry);
      }
      return await fn(...args);
    } catch (error) {
      const errorDetails = parseError(error);
      if (options?.onError) {
        options.onError(errorDetails);
      }
      throw error;
    }
  };
}

// Export a singleton error handler for convenience
export const errorHandler = {
  isNetworkError,
  isAuthError,
  isServerError,
  isValidationError,
  isTimeoutError,
  getErrorType,
  getUserFriendlyMessage,
  parseError,
  withRetry,
  safeAsync,
  safeAsyncWithRetry,
  createErrorHandler,
  ERROR_TYPES,
};

export default errorHandler;
