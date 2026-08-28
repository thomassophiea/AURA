/**
 * Cross-tree launcher for the AURA Cortex workspace.
 *
 * Pages deep in the tree (e.g. an Operational Insights alert row) want to open
 * the AI workspace pre-seeded with a question. The workspace mounts
 * conditionally (Dev mode + assistant enabled), so callers first check
 * availability and degrade to a hint when it isn't there. CustomEvents are the
 * app's established cross-component bus (aura:navigate-sentinel et al.).
 */

export const CORTEX_DIAGNOSE_EVENT = 'aura:cortex-diagnose';

let available = false;

/** Called by the workspace on mount/unmount. */
export function markCortexAvailable(value: boolean): void {
  available = value;
}

export function isCortexAvailable(): boolean {
  return available;
}

/**
 * Open the workspace and ask it `prompt`. Returns false when no workspace is
 * mounted (caller should explain how to enable it).
 */
export function launchCortexDiagnosis(prompt: string): boolean {
  if (!available) return false;
  window.dispatchEvent(new CustomEvent(CORTEX_DIAGNOSE_EVENT, { detail: { prompt } }));
  return true;
}
