/**
 * Turns a committed light state + AP capabilities + policy into resolver-shaped
 * optimization descriptors. Only 'dim' and 'dark' produce actions. WLAN safety:
 * protected WLAN ids are stripped even if a dark action names them (spec §7).
 */
import { isActionAllowed } from './energyActions.js';

export function eligibleOptimizations({ state, capabilities, policy }) {
  if (state !== 'dim' && state !== 'dark') return [];
  const block = policy?.[state];
  if (!block || !Array.isArray(block.actions)) return [];
  const protectedIds = new Set(policy.protectedWlanIds ?? []);

  const out = [];
  for (const action of block.actions) {
    if (action.kind === 'disableWlan' && protectedIds.has(action.wlanId)) continue;
    if (!isActionAllowed(action, capabilities)) continue;
    out.push({ ...action, source: 'lightAware', reason: state });
  }
  return out;
}
