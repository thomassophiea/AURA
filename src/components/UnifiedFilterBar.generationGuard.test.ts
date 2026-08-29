import { describe, it, expect } from 'vitest';
import { isStaleRequest } from './UnifiedFilterBar';

describe('isStaleRequest (typeahead generation guard)', () => {
  it('is not stale when the request id matches the latest', () => {
    expect(isStaleRequest(1, 1)).toBe(false);
  });

  it('is stale when a newer request has since been issued', () => {
    // e.g. request #1 (AP tab) is still in flight when the search box
    // changes and fires request #2 — #1's late response must be dropped.
    expect(isStaleRequest(1, 2)).toBe(true);
  });

  it('is stale when an older request resolves after being superseded by a tab switch', () => {
    // request #1 was for the Access Point tab; switching to Client fires
    // request #2 before #1 resolves.
    expect(isStaleRequest(1, 2)).toBe(true);
    expect(isStaleRequest(2, 2)).toBe(false);
  });
});
