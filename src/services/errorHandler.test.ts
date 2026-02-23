import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isNetworkError,
  isServerError,
  isTimeoutError,
  getUserFriendlyMessage,
  parseError,
  withRetry,
  ERROR_TYPES,
} from './errorHandler';

describe('Error Handler Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress logger output during tests
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // isNetworkError
  // ---------------------------------------------------------------------------
  describe('isNetworkError()', () => {
    it('returns true for TypeError with "Failed to fetch" message', () => {
      const error = new TypeError('Failed to fetch');
      expect(isNetworkError(error)).toBe(true);
    });

    it('returns true for Error whose message contains "network"', () => {
      expect(isNetworkError(new Error('NetworkError when attempting to fetch'))).toBe(true);
    });

    it('returns true for ECONNREFUSED errors', () => {
      expect(isNetworkError(new Error('connect ECONNREFUSED 127.0.0.1:8080'))).toBe(true);
    });

    it('returns true for ENOTFOUND errors', () => {
      expect(isNetworkError(new Error('getaddrinfo ENOTFOUND example.com'))).toBe(true);
    });

    it('returns true for ETIMEDOUT errors', () => {
      expect(isNetworkError(new Error('connect ETIMEDOUT'))).toBe(true);
    });

    it('returns true for ECONNRESET errors', () => {
      expect(isNetworkError(new Error('read ECONNRESET'))).toBe(true);
    });

    it('returns true for "unable to connect" errors', () => {
      expect(isNetworkError(new Error('Unable to connect to host'))).toBe(true);
    });

    it('returns false for a plain 500 server error', () => {
      expect(isNetworkError(new Error('500 Internal Server Error'))).toBe(false);
    });

    it('returns false for a 404 not-found error', () => {
      expect(isNetworkError(new Error('404 Not Found'))).toBe(false);
    });

    it('returns false for a generic Error with unrelated message', () => {
      expect(isNetworkError(new Error('Something went wrong'))).toBe(false);
    });

    it('returns false for non-Error values', () => {
      expect(isNetworkError(null)).toBe(false);
      expect(isNetworkError(undefined)).toBe(false);
      expect(isNetworkError('network error string')).toBe(false);
      expect(isNetworkError(42)).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // isServerError
  // ---------------------------------------------------------------------------
  describe('isServerError()', () => {
    it('returns true for an Error message containing "500"', () => {
      expect(isServerError(new Error('500 Internal Server Error'))).toBe(true);
    });

    it('returns true for an Error message containing "502"', () => {
      expect(isServerError(new Error('502 Bad Gateway'))).toBe(true);
    });

    it('returns true for an Error message containing "503"', () => {
      expect(isServerError(new Error('503 Service Unavailable'))).toBe(true);
    });

    it('returns true for an Error message containing "504"', () => {
      expect(isServerError(new Error('504 Gateway Timeout'))).toBe(true);
    });

    it('returns true for an Error message containing "Internal Server Error"', () => {
      expect(isServerError(new Error('Internal Server Error'))).toBe(true);
    });

    it('returns true for an object with status 500', () => {
      expect(isServerError({ status: 500 })).toBe(true);
    });

    it('returns true for an object with status 503', () => {
      expect(isServerError({ status: 503 })).toBe(true);
    });

    it('returns true for an object with status 599 (upper 5xx boundary)', () => {
      expect(isServerError({ status: 599 })).toBe(true);
    });

    it('returns false for an object with status 404', () => {
      expect(isServerError({ status: 404 })).toBe(false);
    });

    it('returns false for an object with status 422', () => {
      expect(isServerError({ status: 422 })).toBe(false);
    });

    it('returns false for an object with status 400', () => {
      expect(isServerError({ status: 400 })).toBe(false);
    });

    it('returns false for a TypeError (network error)', () => {
      expect(isServerError(new TypeError('Failed to fetch'))).toBe(false);
    });

    it('returns false for non-Error, non-object values', () => {
      expect(isServerError(null)).toBe(false);
      expect(isServerError(undefined)).toBe(false);
      expect(isServerError('server error')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // isTimeoutError
  // ---------------------------------------------------------------------------
  describe('isTimeoutError()', () => {
    it('returns true when error.name is "AbortError"', () => {
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';
      expect(isTimeoutError(error)).toBe(true);
    });

    it('returns true for DOMException with name AbortError', () => {
      const error = new DOMException('Aborted', 'AbortError');
      expect(isTimeoutError(error)).toBe(true);
    });

    it('returns true for error messages containing "timeout"', () => {
      expect(isTimeoutError(new Error('Request timeout after 5000ms'))).toBe(true);
    });

    it('returns true for error messages containing "timed out"', () => {
      expect(isTimeoutError(new Error('Connection timed out'))).toBe(true);
    });

    it('returns true for mixed-case "Timeout" in message', () => {
      expect(isTimeoutError(new Error('Timeout reached'))).toBe(true);
    });

    it('returns false for a plain network error', () => {
      expect(isTimeoutError(new TypeError('Failed to fetch'))).toBe(false);
    });

    it('returns false for a 503 server error', () => {
      expect(isTimeoutError(new Error('503 Service Unavailable'))).toBe(false);
    });

    it('returns false for non-Error values', () => {
      expect(isTimeoutError(null)).toBe(false);
      expect(isTimeoutError({ name: 'AbortError' })).toBe(false);
      expect(isTimeoutError('AbortError')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // getUserFriendlyMessage
  // ---------------------------------------------------------------------------
  describe('getUserFriendlyMessage()', () => {
    it('returns the "Failed to fetch" user message for network TypeError', () => {
      const error = new TypeError('Failed to fetch');
      expect(getUserFriendlyMessage(error)).toBe(
        'Unable to connect to the server. Please check your internet connection.'
      );
    });

    it('returns a connection refused message for ECONNREFUSED', () => {
      const error = new Error('connect ECONNREFUSED 127.0.0.1:8080');
      expect(getUserFriendlyMessage(error)).toBe(
        'Unable to connect to the server. The service may be unavailable.'
      );
    });

    it('returns a 500 server error message', () => {
      const error = new Error('500 Internal Server Error');
      const msg = getUserFriendlyMessage(error);
      // The message "500" key matches first in USER_MESSAGES
      expect(msg).toBe('An unexpected server error occurred. Please try again later.');
    });

    it('returns a 503 service unavailable message', () => {
      const error = new Error('503 Service Unavailable');
      expect(getUserFriendlyMessage(error)).toBe(
        'The service is currently unavailable. Please try again later.'
      );
    });

    it('returns an auth message for 401 errors', () => {
      const error = new Error('401 Unauthorized');
      expect(getUserFriendlyMessage(error)).toBe(
        'Your session has expired. Please log in again.'
      );
    });

    it('returns an abort/timeout message for AbortError', () => {
      const error = new Error('AbortError: request was aborted');
      expect(getUserFriendlyMessage(error)).toBe('The request timed out. Please try again.');
    });

    it('returns a generic timeout message for unknown timeout errors', () => {
      const error = new Error('Connection timed out');
      const msg = getUserFriendlyMessage(error);
      // Falls through USER_MESSAGES lookup, hits ETIMEDOUT key check via "timed out" →
      // but "ETIMEDOUT" key won't match. Verify the fallback covers timeout type.
      expect(msg).toContain('timed out');
    });

    it('returns a fallback message for completely unknown errors', () => {
      const error = new Error('Something completely unknown');
      expect(getUserFriendlyMessage(error)).toBe(
        'An unexpected error occurred. Please try again.'
      );
    });

    it('returns a meaningful string (not empty) for any Error', () => {
      const errors = [
        new TypeError('Failed to fetch'),
        new Error('500 Internal Server Error'),
        new Error('401 Unauthorized'),
        new Error('Something random'),
      ];
      for (const err of errors) {
        const msg = getUserFriendlyMessage(err);
        expect(typeof msg).toBe('string');
        expect(msg.length).toBeGreaterThan(0);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // parseError
  // ---------------------------------------------------------------------------
  describe('parseError()', () => {
    it('parses an Error object and sets type, message, retryable, and originalError', () => {
      const error = new TypeError('Failed to fetch');
      const result = parseError(error);

      expect(result.type).toBe(ERROR_TYPES.NETWORK);
      expect(result.message).toBe('Failed to fetch');
      expect(result.retryable).toBe(true);
      expect(result.originalError).toBe(error);
      expect(typeof result.userMessage).toBe('string');
      expect(result.userMessage.length).toBeGreaterThan(0);
    });

    it('parses a server Error and marks it as retryable', () => {
      const error = new Error('500 Internal Server Error');
      const result = parseError(error);

      expect(result.type).toBe(ERROR_TYPES.SERVER);
      expect(result.retryable).toBe(true);
      expect(result.status).toBe(500);
    });

    it('extracts status code from an Error message', () => {
      const result = parseError(new Error('Request failed with status 502'));
      expect(result.status).toBe(502);
    });

    it('parses an HTTP-like Response object with a status field', () => {
      const fakeResponse = { status: 503, message: 'Service Unavailable' } as unknown as Error;
      const result = parseError(fakeResponse);

      expect(result.status).toBe(503);
      expect(result.type).toBe(ERROR_TYPES.SERVER);
      expect(result.retryable).toBe(true);
    });

    it('parses a 401 response object as AUTH type and non-retryable', () => {
      const fakeResponse = { status: 401 };
      const result = parseError(fakeResponse);

      expect(result.type).toBe(ERROR_TYPES.AUTH);
      expect(result.status).toBe(401);
      expect(result.retryable).toBe(false);
    });

    it('parses a 400 validation error as VALIDATION type and non-retryable', () => {
      const error = new Error('400 Bad Request');
      const result = parseError(error);

      expect(result.type).toBe(ERROR_TYPES.VALIDATION);
      expect(result.retryable).toBe(false);
    });

    it('parses a timeout error as TIMEOUT type and retryable', () => {
      const error = new Error('Request timeout');
      const result = parseError(error);

      expect(result.type).toBe(ERROR_TYPES.TIMEOUT);
      expect(result.retryable).toBe(true);
    });

    it('parses a non-Error string value', () => {
      const result = parseError('something broke');

      expect(result.message).toBe('something broke');
      expect(result.originalError).toBeUndefined();
      expect(result.type).toBe(ERROR_TYPES.UNKNOWN);
      expect(result.retryable).toBe(false);
    });

    it('sets originalError to undefined for non-Error values', () => {
      const result = parseError({ status: 500 });
      expect(result.originalError).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // withRetry
  // ---------------------------------------------------------------------------
  describe('withRetry()', () => {
    it('returns the result immediately when the function succeeds on the first try', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await withRetry(fn, { maxRetries: 3, backoff: false, initialDelayMs: 0 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries on network errors and eventually succeeds', async () => {
      const networkError = new TypeError('Failed to fetch');
      const fn = vi
        .fn()
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValue('ok');

      const result = await withRetry(fn, { maxRetries: 3, backoff: false, initialDelayMs: 0 });

      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('throws after exhausting maxRetries', async () => {
      const networkError = new TypeError('Failed to fetch');
      const fn = vi.fn().mockRejectedValue(networkError);

      await expect(
        withRetry(fn, { maxRetries: 2, backoff: false, initialDelayMs: 0 })
      ).rejects.toThrow('Failed to fetch');

      // 1 initial attempt + 2 retries = 3 total calls
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('does not retry non-retryable errors (auth errors)', async () => {
      const authError = new Error('401 Unauthorized');
      const fn = vi.fn().mockRejectedValue(authError);

      await expect(
        withRetry(fn, { maxRetries: 3, backoff: false, initialDelayMs: 0 })
      ).rejects.toThrow('401 Unauthorized');

      // Should not retry — only 1 call
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('does not retry validation errors (400)', async () => {
      const validationError = new Error('400 Bad Request');
      const fn = vi.fn().mockRejectedValue(validationError);

      await expect(
        withRetry(fn, { maxRetries: 3, backoff: false, initialDelayMs: 0 })
      ).rejects.toThrow('400 Bad Request');

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries on server errors (5xx)', async () => {
      const serverError = new Error('503 Service Unavailable');
      const fn = vi
        .fn()
        .mockRejectedValueOnce(serverError)
        .mockResolvedValue('recovered');

      const result = await withRetry(fn, { maxRetries: 2, backoff: false, initialDelayMs: 0 });

      expect(result).toBe('recovered');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('retries on timeout errors (AbortError)', async () => {
      const timeoutError = new Error('Request timeout');
      const fn = vi
        .fn()
        .mockRejectedValueOnce(timeoutError)
        .mockResolvedValue('done');

      const result = await withRetry(fn, { maxRetries: 2, backoff: false, initialDelayMs: 0 });

      expect(result).toBe('done');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('respects maxRetries: 0 (no retries at all)', async () => {
      const networkError = new TypeError('Failed to fetch');
      const fn = vi.fn().mockRejectedValue(networkError);

      await expect(
        withRetry(fn, { maxRetries: 0, backoff: false, initialDelayMs: 0 })
      ).rejects.toThrow('Failed to fetch');

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('calls onRetry callback for each retry attempt', async () => {
      const networkError = new TypeError('Failed to fetch');
      const fn = vi
        .fn()
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValue('final');

      const onRetry = vi.fn();

      await withRetry(fn, {
        maxRetries: 3,
        backoff: false,
        initialDelayMs: 0,
        onRetry,
      });

      // onRetry called once per failed attempt before the eventual success
      expect(onRetry).toHaveBeenCalledTimes(2);
      expect(onRetry).toHaveBeenNthCalledWith(1, 1, networkError, 0);
      expect(onRetry).toHaveBeenNthCalledWith(2, 2, networkError, 0);
    });

    it('only retries the specified error types when retryableErrors is customised', async () => {
      // Restrict retries to TIMEOUT only; SERVER errors should not retry
      const serverError = new Error('500 Internal Server Error');
      const fn = vi.fn().mockRejectedValue(serverError);

      await expect(
        withRetry(fn, {
          maxRetries: 3,
          backoff: false,
          initialDelayMs: 0,
          retryableErrors: [ERROR_TYPES.TIMEOUT],
        })
      ).rejects.toThrow('500 Internal Server Error');

      expect(fn).toHaveBeenCalledTimes(1);
    });
  });
});
