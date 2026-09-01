import { describe, expect, it } from 'vitest';

import { insightsErrorMessage } from './insightsError';

describe('insightsErrorMessage', () => {
  it('translates the analytics timeout without leaking the endpoint', () => {
    const msg = insightsErrorMessage(
      new Error(
        'SUPPRESSED_ANALYTICS_ERROR: Request timeout for /v1/report/stations/A6%3AE1%3AF9%3AFB%3AE3%3A05?noCache=1788296101664&duration=24H'
      )
    );
    expect(msg).toContain('took too long');
    expect(msg).not.toContain('/v1/report');
    expect(msg).not.toContain('SUPPRESSED');
  });

  it('translates auth failures into a session hint', () => {
    const msg = insightsErrorMessage(
      new Error('SUPPRESSED_ANALYTICS_ERROR: Authentication required for /v1/report/aps/X')
    );
    expect(msg).toContain('session');
    expect(msg).not.toContain('/v1/report');
  });

  it('translates rate limiting', () => {
    expect(insightsErrorMessage(new Error('RATE_LIMITED: Controller is rate-limiting requests'))).toContain(
      'rate-limiting'
    );
  });

  it('keeps a generic suppressed error generic but human', () => {
    const msg = insightsErrorMessage(new Error('SUPPRESSED_ANALYTICS_ERROR: /v1/report/aps/X'));
    expect(msg).toContain('could not build this report');
    expect(msg).not.toContain('SUPPRESSED');
  });

  it('keeps unrecognized failure text verbatim', () => {
    expect(insightsErrorMessage(new Error('Failed to fetch Client insights: 502 Bad Gateway'))).toBe(
      'Failed to fetch Client insights: 502 Bad Gateway'
    );
  });

  it('falls back for non-errors', () => {
    expect(insightsErrorMessage(undefined, 'Failed to load client insights.')).toBe(
      'Failed to load client insights.'
    );
  });
});
