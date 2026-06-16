/**
 * In-memory identity of the controller backing the active Site Group.
 * Sourced live from /system/info; never persisted.
 */
export interface ControllerIdentity {
  /** Controller hostname (parsed from /system/info, falls back to URL host). */
  hostname: string;
  /** Locking ID parsed from manufacturing info; empty string if unavailable. */
  lockingId: string;
  /** ISO timestamp of when this identity was fetched. */
  fetchedAt: string;
  /** 'ok' when /system/info responded; 'unreachable' on fetch failure. */
  status: 'ok' | 'unreachable';
}
