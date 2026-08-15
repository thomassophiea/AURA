/**
 * Last-known dataset per view, so navigating back paints immediately.
 *
 * AURA has no URL router — `App.tsx` swaps pages by state, which unmounts the
 * old page and mounts the new one. A page that keeps its rows in component state
 * therefore starts empty every single time it is opened, and a page that renders
 * `if (isLoading) return <Skeleton/>` replaces content the user was looking at
 * one second ago with a full-page skeleton. That is the "everything disappears
 * and reloads" feeling when clicking between Devices and a device detail.
 *
 * A snapshot is *not* a data cache and must never be the only thing a view
 * shows. The contract is:
 *
 *   1. On mount, paint the snapshot instantly if one exists.
 *   2. Always kick off a real fetch anyway.
 *   3. Replace the snapshot with whatever the fetch returns.
 *
 * Because step 2 is unconditional, a snapshot can only ever change *when* the
 * user sees content, never *what* they eventually see. `MAX_AGE_MS` is a
 * backstop for the case where a fetch never completes — past that age it is
 * better to show a skeleton than something misleadingly old.
 */

interface Snapshot {
  data: unknown;
  at: number;
}

const snapshots = new Map<string, Snapshot>();

/** Beyond this, prefer a skeleton over a possibly-misleading stale paint. */
const MAX_AGE_MS = 5 * 60 * 1000;

/** Read a snapshot, or null if absent or too old. */
export function readSnapshot<T>(key: string, maxAgeMs: number = MAX_AGE_MS): T | null {
  const entry = snapshots.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > maxAgeMs) {
    snapshots.delete(key);
    return null;
  }
  return entry.data as T;
}

/** Record the dataset a view is currently showing. */
export function writeSnapshot<T>(key: string, data: T): void {
  snapshots.set(key, { data, at: Date.now() });
}

/** How old the snapshot is, in ms, or null if there isn't one. */
export function snapshotAge(key: string): number | null {
  const entry = snapshots.get(key);
  return entry ? Date.now() - entry.at : null;
}

/**
 * Drop every snapshot.
 *
 * Called on logout and on controller/site-group switch: one session's — or one
 * controller's — rows must never paint into another's view, however briefly.
 */
export function clearSnapshots(): void {
  snapshots.clear();
}

/** Snapshot keys. Centralized so a view and its invalidation cannot drift apart. */
export const SNAPSHOT_KEYS = {
  accessPoints: 'access-points:list',
} as const;
