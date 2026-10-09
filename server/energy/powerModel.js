/**
 * The single power resolver. Every optimization — from a What-if toggle or a
 * Light-Aware policy — resolves here into ONE optimized-watts number so the same
 * resource can never be counted twice (spec §9). Additive share removal per
 * resource (each band/chain/profile/WLAN counted once), then the deepest single
 * Tx-power reduction applied to the radio draw that remains.
 *
 * WHERE THE NUMBERS COME FROM
 * ---------------------------
 * Measured, AP5022 S/N WF062626W-50095, 10.21.1.0-003R, FCC, 5 Gbps on an
 * X465-24MU, idle (no clients, no traffic), 10 samples per case, 2026-10-08:
 *
 *   all radios on   16.39 / 16.78 / 16.82 W   (three channel plans)
 *   all radios off  10.89 / 10.92 / 10.91 W
 *   saved           5.50 / 5.86 / 5.91 W  =  33.5 / 34.9 / 35.1 %
 *
 * So everything the radios can give back is ~34.5 % of the AP's draw; the rest
 * (~10.9 W) is platform and does not move whatever is done to the radios.
 *
 * Measured, AP5020, 10.20.1.0-020R, 2026-09-11: 6 GHz radio off alone
 * 14.112 W -> 11.868 W = 15.9 %.
 *
 * Derived: the remaining 18.6 % is split between 2.4 and 5 GHz using the lab's
 * band comparison — the same radio idles 0.39 W (2.4 % of draw) higher on
 * 5 GHz/80 MHz/16 dBm than on 2.4 GHz/20 MHz/18 dBm (t≈7). Band and channel
 * width moved together in that comparison, so the split is the least certain
 * of the three. 5 vs 6 GHz idle draw was indistinguishable (0.04 W, noise).
 *
 * NOT measured, still modeled: chains, low-power profile, per-WLAN and Tx
 * power. Note the lab Gateway does not apply Tx-power writes at all (PUT
 * returns 200, txPower unchanged), so a Tx saving is not deliverable there.
 */

/** Share of AP draw recoverable by turning every radio off (measured, AP5022). */
export const ALL_RADIOS_OFF_SHARE = 0.345;

export const BAND_SHARE = Object.freeze({
  // Derived from the measured total and the measured 2.4-vs-5 GHz delta.
  '2.4': 0.081,
  '5': 0.105,
  // Measured (AP5020, 6 GHz off alone).
  '6': 0.159,
});

// Modeled, not measured — see header.
export const CHAIN_SHARE = 0.1;
export const WLAN_SHARE = 0.05;
export const PROFILE_SHARE = 0.15;
export const DEFAULT_TX_PERCENT = 20;

/**
 * Nothing done to the radios can save more than switching them all off: the
 * platform draw remains. This ceiling is what keeps stacked modeled shares
 * (bands + chains + profile + WLANs) from claiming an impossible saving.
 */
export const MAX_REMOVED_SHARE = ALL_RADIOS_OFF_SHARE;

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

  // Tx power only acts on radios that are still on, never on the platform.
  const clampedTx = Math.max(0, Math.min(txPercent, 100));
  const radioRemaining = Math.max(0, ALL_RADIOS_OFF_SHARE - removed);
  return baselineWatts * (1 - removed - radioRemaining * (clampedTx / 100));
}
