/**
 * The readings a client answer turns on, shown as VALUES.
 *
 * WHY THIS EXISTS
 * ---------------
 * A client answer used to read as a paragraph of prose in which the decisive
 * numbers were sentences: "Signal strength (RSS) is -61 dBm, in line with its
 * own baseline median of -59 dBm". The reader has to parse a claim to find a
 * measurement. Worse, the same paragraph then spent four lines cataloguing what
 * was NOT measured, so the things Cortex actually knew were outnumbered by the
 * things it did not.
 *
 * So: measured values first, as tiles, with RFQI given its own emphasis —
 * because RFQI is half of every coverage-versus-contention call. Healthy signal
 * with low RFQI is contention; weak signal with low RFQI is coverage; and the
 * two remedies work against each other. An answer that hides RFQI has hidden
 * the most decisive number it holds.
 *
 * Unmeasured readings are NOT given equal billing. They collapse into a single
 * muted line, because "we could not measure this" is a caveat, not a finding.
 */
import React from 'react';
import { cn } from '@/components/ui/utils';

export interface CortexKeyReadings {
  rss: number | null;
  snr: number | null;
  rfqi: number | null;
  downlinkLossRatio: number | null;
  wirelessRttMs: number | null;
  networkRttMs: number | null;
  dnsRttMs: number | null;
  hasIpv4: boolean | null;
}

type Band = 'good' | 'warn' | 'bad' | 'neutral';

const BAND_STYLE: Record<Band, string> = {
  good: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  warn: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
  bad: 'border-rose-400/30 bg-rose-400/10 text-rose-200',
  neutral: 'border-white/10 bg-white/5 text-white/80',
};

/**
 * Thresholds are the ones the findings engine already scores against, so a tile
 * cannot disagree with the verdict beside it.
 */
function bandRss(v: number): Band {
  if (v >= -67) return 'good';
  if (v >= -75) return 'warn';
  return 'bad';
}
function bandSnr(v: number): Band {
  if (v >= 25) return 'good';
  if (v >= 18) return 'warn';
  return 'bad';
}
/** RFQI is 0-5 on this platform, 5 being clean. */
function bandRfqi(v: number): Band {
  if (v >= 4) return 'good';
  if (v >= 3) return 'warn';
  return 'bad';
}
function bandLoss(v: number): Band {
  if (v <= 0.01) return 'good';
  if (v <= 0.05) return 'warn';
  return 'bad';
}
function bandRtt(v: number): Band {
  if (v <= 30) return 'good';
  if (v <= 100) return 'warn';
  return 'bad';
}

interface Tile {
  label: string;
  gloss: string;
  value: string;
  band: Band;
  emphasis?: boolean;
}

function buildTiles(r: CortexKeyReadings): { measured: Tile[]; absent: string[] } {
  const measured: Tile[] = [];
  const absent: string[] = [];

  const add = (
    label: string,
    gloss: string,
    raw: number | null,
    fmt: (n: number) => string,
    band: (n: number) => Band,
    emphasis = false
  ) => {
    if (raw === null || raw === undefined || !Number.isFinite(raw)) {
      absent.push(label);
      return;
    }
    measured.push({ label, gloss, value: fmt(raw), band: band(raw), emphasis });
  };

  add('Signal', 'how loud', r.rss, (n) => `${n} dBm`, bandRss);
  add('SNR', 'signal vs noise', r.snr, (n) => `${n} dB`, bandSnr);
  // Emphasised: the discriminator.
  add('RFQI', 'link quality', r.rfqi, (n) => `${n} / 5`, bandRfqi, true);
  add('Downlink loss', 'packets lost', r.downlinkLossRatio, (n) => `${(n * 100).toFixed(2)}%`, bandLoss);
  add('Air latency', 'over the air', r.wirelessRttMs, (n) => `${Math.round(n)} ms`, bandRtt);
  add('Network latency', 'past the AP', r.networkRttMs, (n) => `${Math.round(n)} ms`, bandRtt);
  add('DNS latency', 'name lookups', r.dnsRttMs, (n) => `${Math.round(n)} ms`, bandRtt);

  if (r.hasIpv4 === true) {
    measured.push({ label: 'Address', gloss: 'has an IP', value: 'Assigned', band: 'good' });
  } else if (r.hasIpv4 === false) {
    measured.push({ label: 'Address', gloss: 'no IP', value: 'None', band: 'bad' });
  }

  return { measured, absent };
}

export const CortexReadings: React.FC<{ readings: CortexKeyReadings }> = ({ readings }) => {
  const { measured, absent } = buildTiles(readings);
  // Nothing measured means nothing to show. Rendering only the absences —
  // "Not measured: Signal, SNR, RFQI, loss, latency…" — is precisely the noise
  // this component exists to remove: a list of things we do not know, presented
  // as if it were a result. The prose says the read failed; that is enough.
  if (!measured.length) return null;

  return (
    <div className="space-y-2">
      {measured.length > 0 && (
        <>
          <p className="text-[10px] uppercase tracking-wider text-white/35 font-medium">Measured</p>
          <div className="flex flex-wrap gap-1.5">
            {measured.map((t) => (
              <div
                key={t.label}
                className={cn(
                  'rounded-lg border px-2.5 py-1.5 min-w-[84px]',
                  BAND_STYLE[t.band],
                  // RFQI carries a ring so the eye lands on it first.
                  t.emphasis && 'ring-1 ring-inset ring-current/40'
                )}
              >
                <div className="flex items-baseline gap-1">
                  <span className="text-[10px] uppercase tracking-wide opacity-70">{t.label}</span>
                  {t.emphasis && (
                    <span className="text-[9px] opacity-60" title="Tells contention from coverage">
                      key
                    </span>
                  )}
                </div>
                <div className="text-sm font-semibold tabular-nums leading-tight">{t.value}</div>
                <div className="text-[9px] opacity-55 leading-tight">{t.gloss}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/*
        One line, muted, last. An earlier version of this answer listed every
        absent reading as a bullet, which made a healthy client look
        under-investigated and pushed the actual findings off the screen.
      */}
      {absent.length > 0 && (
        <p className="text-[11px] text-white/30">
          Not measured on this read: {absent.join(', ')}.
        </p>
      )}
    </div>
  );
};
