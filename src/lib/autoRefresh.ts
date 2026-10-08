/**
 * Whether AURA refreshes data on a timer while you are simply looking at a page.
 *
 * It does not, by default. Data is loaded when a page opens and when the user
 * asks for it with a Refresh control — nothing else.
 *
 * This is a deliberate product decision, not a performance workaround. Timer
 * refreshes were rewriting tables, dashboards and widgets underneath an idle
 * viewer: rows reordered, charts redrew and counts moved while nobody had
 * touched anything. During a demo that reads as instability, and it is precisely
 * the moment when the screen most needs to hold still. A stale figure the
 * presenter can refresh on purpose is far better than a correct figure that
 * repaints mid-sentence.
 *
 * What still runs on a timer, deliberately:
 *   - background collection into Postgres for the 7-day history, which is
 *     invisible and is the whole point of that store
 *   - operations the user explicitly started and is watching, such as an active
 *     packet capture
 *   - session/auth checks
 *
 * Live mode can be re-enabled per browser without a rebuild:
 *
 *     localStorage.setItem('aura.autoRefresh', 'on')   // then reload
 *
 * The `aura:auto-refresh-changed` event fires on change so anything holding the
 * value in state can react without a reload.
 */

const STORAGE_KEY = 'aura.autoRefresh';

/** Timer-driven refresh is opt-in. See the module comment for why. */
const DEFAULT_ENABLED = false;

export function isAutoRefreshEnabled(): boolean {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'on') return true;
    if (stored === 'off') return false;
  } catch {
    // Private browsing or disabled storage — fall through to the default.
  }
  return DEFAULT_ENABLED;
}

export function setAutoRefreshEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  } catch {
    // Non-fatal: the setting simply does not persist.
  }
  window.dispatchEvent(new CustomEvent('aura:auto-refresh-changed', { detail: { enabled } }));
}

/**
 * Guard a timer-driven refresh.
 *
 * Returns a wrapped callback that runs only when timer refresh is enabled *and*
 * the page is visible. Wrapping the callback rather than removing the interval
 * keeps every caller's existing mount-time load, dependencies and teardown
 * exactly as they were — the initial load and the Refresh button do not go
 * through here and are never suppressed.
 */
export function whenAutoRefresh<T extends (...args: never[]) => unknown>(
  callback: T
): (...args: Parameters<T>) => ReturnType<T> | undefined {
  return (...args: Parameters<T>) => {
    if (!isAutoRefreshEnabled()) return undefined;
    if (typeof document !== 'undefined' && document.hidden) return undefined;
    return callback(...args) as ReturnType<T>;
  };
}

/** How long a tab must have been hidden before returning to it refreshes the data. */
export const RETURN_REFRESH_MIN_HIDDEN_MS = 60_000;

/**
 * Run `callback` when the viewer comes back to a tab that has been hidden for
 * at least `minHiddenMs`.
 *
 * This is deliberately NOT gated on `isAutoRefreshEnabled()`. The policy above
 * forbids repainting under an idle viewer; a viewer switching back to the tab
 * after a minute or more away is the opposite of idle — they are arriving, and
 * a page still showing figures from before they left is the stale-data bug.
 * A brief switch away (shorter than the threshold) does nothing, so flicking
 * between windows mid-demo never reloads the page.
 *
 * Returns an unsubscribe function, suitable as a `useEffect` cleanup.
 */
export function onReturnAfterHidden(
  callback: () => void,
  minHiddenMs: number = RETURN_REFRESH_MIN_HIDDEN_MS
): () => void {
  if (typeof document === 'undefined') return () => undefined;

  let hiddenAt: number | null = document.hidden ? Date.now() : null;

  const handleVisibilityChange = () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      return;
    }
    const wasHiddenFor = hiddenAt === null ? 0 : Date.now() - hiddenAt;
    hiddenAt = null;
    if (wasHiddenFor >= minHiddenMs) callback();
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
}
