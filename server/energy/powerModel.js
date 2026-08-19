/**
 * The single power resolver. Every optimization — from a What-if toggle or a
 * Light-Aware policy — resolves here into ONE optimized-watts number so the same
 * resource can never be counted twice (spec §9). Additive share removal per
 * resource (each band/chain/profile/WLAN counted once), then the deepest single
 * Tx-power reduction applied to the remaining draw.
 */

export const BAND_SHARE = { '2.4': 0.15, '5': 0.3, '6': 0.25 };
export const CHAIN_SHARE = 0.1;
export const WLAN_SHARE = 0.05;
export const PROFILE_SHARE = 0.15;
export const DEFAULT_TX_PERCENT = 20;
export const MAX_REMOVED_SHARE = 0.9;

export function resolveApState(baselineWatts, optimizations = []) {
  if (!Number.isFinite(baselineWatts) || baselineWatts <= 0) return 0;

  const bands = new Set();
  const wlanIds = new Set();
  let chains = false;
  let profile = false;
  let txPercent = 0;

  for (const opt of optimizations) {
    switch (opt?.kind) {
      case 'disableRadio':
        if (opt.band && BAND_SHARE[opt.band] != null) bands.add(opt.band);
        break;
      case 'reduceChains':
        chains = true;
        break;
      case 'lowPowerProfile':
        profile = true;
        break;
      case 'disableWlan':
        if (opt.wlanId != null) wlanIds.add(opt.wlanId);
        break;
      case 'reduceTxPower': {
        const pct = Number.isFinite(opt.reducePercent) ? opt.reducePercent : DEFAULT_TX_PERCENT;
        if (pct > txPercent) txPercent = pct;
        break;
      }
      default:
        break;
    }
  }

  let removed = 0;
  for (const b of bands) removed += BAND_SHARE[b];
  if (chains) removed += CHAIN_SHARE;
  if (profile) removed += PROFILE_SHARE;
  removed += wlanIds.size * WLAN_SHARE;
  removed = Math.min(removed, MAX_REMOVED_SHARE);

  const clampedTx = Math.max(0, Math.min(txPercent, 100));
  return baselineWatts * (1 - removed) * (1 - clampedTx / 100);
}
