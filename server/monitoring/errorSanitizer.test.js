import { describe, it, expect } from 'vitest';

import {
  sanitizeUrl,
  sanitizeMessage,
  classifyError,
  sanitizeError,
  ERROR_CLASS_LABELS,
} from './errorSanitizer.js';

describe('sanitizeUrl', () => {
  it('redacts a token in the query string', () => {
    const result = sanitizeUrl('https://ctrl.example.com/management/v1/aps?token=abc123&x=1');
    expect(result).not.toContain('abc123');
    expect(result).toContain('x=1');
  });

  it('redacts basic-auth credentials embedded in the URL', () => {
    const result = sanitizeUrl('https://admin:hunter2@ctrl.example.com/management/v1/aps');
    expect(result).not.toContain('hunter2');
    expect(result).not.toContain('admin:');
  });

  it('redacts every known secret parameter name', () => {
    const result = sanitizeUrl(
      'https://c.example.com/x?access_token=a&refresh_token=b&api_key=c&password=d'
    );
    for (const secret of ['=a', '=b', '=c', '=d']) {
      expect(result).not.toContain(secret);
    }
  });

  it('leaves a clean URL intact', () => {
    const url = 'https://ctrl.example.com/management/v1/aps?duration=3H';
    expect(sanitizeUrl(url)).toContain('duration=3H');
  });

  it('handles a bare path without throwing', () => {
    expect(sanitizeUrl('/v1/report/aps/ABC?token=xyz')).not.toContain('xyz');
  });

  it('returns null for no input', () => {
    expect(sanitizeUrl(null)).toBeNull();
  });
});

describe('sanitizeMessage', () => {
  it('redacts a bearer token', () => {
    const result = sanitizeMessage('401 from GET /v1/aps (Authorization: Bearer eyJhbGciOi.abc)');
    expect(result).not.toContain('eyJhbGciOi.abc');
    expect(result).toContain('Bearer [redacted]');
  });

  it('redacts a password field in a JSON body echo', () => {
    const result = sanitizeMessage('body was {"userId":"admin","password":"hunter2"}');
    expect(result).not.toContain('hunter2');
  });

  it('redacts credentials in an embedded connection string', () => {
    const result = sanitizeMessage('connect failed: postgres://user:hunter2@db.internal:5432/aura');
    expect(result).not.toContain('hunter2');
  });

  it('truncates a very long message so a whole payload cannot be stored', () => {
    const result = sanitizeMessage('x'.repeat(5000));
    expect(result.length).toBeLessThanOrEqual(301);
  });

  it('returns null for no input', () => {
    expect(sanitizeMessage(null)).toBeNull();
  });
});

describe('classifyError', () => {
  it('classifies 401 and 403 as auth', () => {
    expect(classifyError(new Error('nope'), { status: 401 })).toBe('auth');
    expect(classifyError(new Error('nope'), { status: 403 })).toBe('auth');
  });

  it('classifies 5xx as an upstream server error', () => {
    expect(classifyError(new Error('boom'), { status: 500 })).toBe('upstream_server_error');
  });

  it('classifies an aborted request as a timeout', () => {
    const error = new Error('The operation was aborted');
    error.name = 'AbortError';
    expect(classifyError(error)).toBe('timeout');
  });

  it('classifies a refused connection as a network failure', () => {
    const error = new Error('connect ECONNREFUSED 10.0.0.1:443');
    error.code = 'ECONNREFUSED';
    expect(classifyError(error)).toBe('network');
  });

  it('classifies DNS failure as a network failure', () => {
    const error = new Error('getaddrinfo ENOTFOUND ctrl.example.com');
    error.code = 'ENOTFOUND';
    expect(classifyError(error)).toBe('network');
  });

  it('classifies a JSON parse failure as malformed', () => {
    const error = new SyntaxError('Unexpected token < in JSON at position 0');
    expect(classifyError(error)).toBe('malformed');
  });

  it('falls back to unknown rather than guessing', () => {
    expect(classifyError(new Error('something odd'))).toBe('unknown');
  });

  it('prefers an explicit status over message heuristics', () => {
    const error = new Error('connect ECONNREFUSED');
    error.code = 'ECONNREFUSED';
    expect(classifyError(error, { status: 401 })).toBe('auth');
  });
});

describe('sanitizeError', () => {
  it('returns a class, a sanitized summary, and a sanitized endpoint', () => {
    const result = sanitizeError(new Error('401 Authorization: Bearer abc.def'), {
      status: 401,
      endpoint: 'https://c.example.com/v1/aps?token=secret',
    });
    expect(result.errorClass).toBe('auth');
    expect(result.summary).not.toContain('abc.def');
    expect(result.endpoint).not.toContain('secret');
  });

  it('never returns a stack trace', () => {
    const error = new Error('boom');
    const result = sanitizeError(error);
    expect(JSON.stringify(result)).not.toContain('at ');
    expect(result).not.toHaveProperty('stack');
  });

  it('has a human label for every class it can emit', () => {
    const classes = [
      'auth',
      'timeout',
      'network',
      'upstream_client_error',
      'upstream_server_error',
      'malformed',
      'database',
      'unknown',
    ];
    for (const cls of classes) {
      expect(ERROR_CLASS_LABELS[cls]).toBeTruthy();
    }
  });
});
