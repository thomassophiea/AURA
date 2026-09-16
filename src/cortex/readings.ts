/**
 * Pull the client readings out of the evidence ledger.
 *
 * The runtime digests every tool result (`digestToolResult` in
 * `server/cortex/evidenceGraph.js`) and the digest travels to the UI on the
 * ledger. That is where the numbers come from — NOT from parsing the prose.
 * The same rule the scope pill and the impact counter already follow: what the
 * runtime measured is rendered from the runtime's own record, so the UI cannot
 * be talked out of it by a fluent paragraph, and a value the answer forgot to
 * mention still reaches the reader.
 */
import type { CortexLedgerEntry } from '@/services/cortexApiClient';
import type { CortexKeyReadings } from './components/CortexReadings';

/** Tools whose digest can carry client readings, best first. */
const READING_TOOLS = ['diagnoseClient', 'compareClientToPeers', 'findClient'];

export function keyReadingsFromLedger(
  ledger: CortexLedgerEntry[] | undefined | null
): CortexKeyReadings | null {
  if (!Array.isArray(ledger) || ledger.length === 0) return null;

  for (const tool of READING_TOOLS) {
    // A FAILED call carries no readings, and using one would present the
    // absence of a measurement as a measurement of absence.
    const entry = ledger.find(
      (l) => l.tool === tool && l.ok && (l as { digest?: { keyReadings?: unknown } }).digest?.keyReadings
    );
    if (!entry) continue;
    const r = (entry as { digest: { keyReadings: Partial<CortexKeyReadings> } }).digest.keyReadings;
    const readings: CortexKeyReadings = {
      rss: numberOrNull(r.rss),
      snr: numberOrNull(r.snr),
      rfqi: numberOrNull(r.rfqi),
      downlinkLossRatio: numberOrNull(r.downlinkLossRatio),
      wirelessRttMs: numberOrNull(r.wirelessRttMs),
      networkRttMs: numberOrNull(r.networkRttMs),
      dnsRttMs: numberOrNull(r.dnsRttMs),
      hasIpv4: typeof r.hasIpv4 === 'boolean' ? r.hasIpv4 : null,
    };
    // Every field null and no address verdict means there is nothing to show;
    // an empty tile row is worse than none.
    const anything =
      readings.hasIpv4 !== null ||
      ([
        readings.rss,
        readings.snr,
        readings.rfqi,
        readings.downlinkLossRatio,
        readings.wirelessRttMs,
        readings.networkRttMs,
        readings.dnsRttMs,
      ].some((v) => v !== null));
    return anything ? readings : null;
  }
  return null;
}

function numberOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
