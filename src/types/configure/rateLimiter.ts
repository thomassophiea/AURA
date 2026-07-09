/**
 * Rate limiter (`/v1/ratelimiters`) — derived from the /default template
 * (the lab controller's live list was empty).
 */
import type { ResourceBase } from './common';

export interface RateLimiter extends ResourceBase {
  name: string;
  /** Committed information rate in Kbps. */
  cirKbps: number;
}
