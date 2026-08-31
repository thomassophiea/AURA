/**
 * Cross-page tab deep-linking for the Configure surface. Catalog cards that
 * land on a multi-tab page stash the target tab here before navigating; the
 * destination page consumes it once on mount. A plain module-level cell (not
 * context) because navigation is a one-shot handoff, not shared state.
 */
let pendingTab: string | null = null;

export function setConfigureTabHint(tab: string): void {
  pendingTab = tab;
}

/**
 * Return the pending tab hint if it names one of `allowed`. The hint is
 * cleared on the next microtask rather than synchronously so React StrictMode
 * double-invoked initializers both observe the same value; it still can never
 * leak into a later navigation.
 */
export function consumeConfigureTabHint(allowed: readonly string[]): string | null {
  const tab = pendingTab;
  if (tab !== null) {
    queueMicrotask(() => {
      if (pendingTab === tab) pendingTab = null;
    });
  }
  return tab !== null && allowed.includes(tab) ? tab : null;
}
