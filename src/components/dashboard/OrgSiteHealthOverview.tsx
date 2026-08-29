import { memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { AnimatedValue } from '../ui/animated-value';
import { Activity, Radio, Signal, Users, Wifi } from 'lucide-react';
import { usePaletteTheme } from '../../hooks/usePaletteTheme';
import {
  isDarkSurface,
  resolveBandColor,
  resolveStatusColor,
  SNR_QUALITY_COLORS,
  type PaletteTheme,
} from '../../config/colorPalette';

interface RfqiSample {
  timestamp: number;
  healthy: number;
  needsAttention: number;
  rfqi: number;
}

interface BandSlice {
  band: string;
  count: number;
  color: string;
}

interface SnrSlice {
  category: string;
  count: number;
  color: string;
}

interface OrgSiteHealthOverviewProps {
  /** "all" | site-id; controls "Org" vs "Site" in the title. */
  siteScope: string;
  rfqiData: RfqiSample[];
  avgRssi: number;
  avgSnr: number;
  totalClients: number;
  bandDistribution: BandSlice[];
  snrDistribution: SnrSlice[];
}

/** Theme-correct color per band label. Falls back to the precomputed color. */
function bandColor(band: string, theme: PaletteTheme, fallback: string): string {
  if (band.startsWith('2.4')) return resolveBandColor('2.4', theme);
  if (band.startsWith('5')) return resolveBandColor('5', theme);
  if (band.startsWith('6')) return resolveBandColor('6', theme);
  return fallback;
}

/** Theme-correct color per SNR quality bucket. */
function snrColor(category: string, theme: PaletteTheme, fallback: string): string {
  if (isDarkSurface(theme)) {
    const key = category.toLowerCase() as keyof typeof SNR_QUALITY_COLORS;
    return SNR_QUALITY_COLORS[key] ?? fallback;
  }
  switch (category.toLowerCase()) {
    case 'excellent':
      return resolveStatusColor('success', theme);
    case 'good':
      return resolveStatusColor('info', theme);
    case 'fair':
      return resolveStatusColor('warning', theme);
    case 'poor':
      return resolveStatusColor('critical', theme);
    default:
      return fallback;
  }
}

/**
 * OrgSiteHealthOverview — RF health card. KPI quartet (RFQI / Avg RSSI /
 * Avg SNR / Clients) over a 2-up grid of band + SNR distribution bars.
 */
function OrgSiteHealthOverviewImpl({
  siteScope,
  rfqiData,
  avgRssi,
  avgSnr,
  totalClients,
  bandDistribution,
  snrDistribution,
}: OrgSiteHealthOverviewProps) {
  const theme = usePaletteTheme();
  const rfqiAvg =
    rfqiData.length > 0
      ? Math.round(
          rfqiData.reduce((acc, d) => acc + (d.rfqi > 5 ? d.rfqi : d.rfqi * 20), 0) /
            rfqiData.length
        )
      : null;
  const snrTotal = snrDistribution.reduce((acc, s) => acc + s.count, 0);

  const kpis = [
    {
      key: 'rfqi',
      label: 'RFQI',
      icon: Signal,
      value: rfqiAvg !== null ? `${rfqiAvg}%` : '--',
      degraded: rfqiAvg !== null && rfqiAvg < 70,
    },
    {
      key: 'rssi',
      label: 'Avg RSSI',
      icon: Wifi,
      value: avgRssi !== 0 ? `${avgRssi} dBm` : '--',
      degraded: false,
    },
    {
      key: 'snr',
      label: 'Avg SNR',
      icon: Activity,
      value: avgSnr > 0 ? `${avgSnr} dB` : '--',
      degraded: avgSnr > 0 && avgSnr < 15,
    },
    {
      key: 'clients',
      label: 'Connected clients',
      icon: Users,
      value: String(totalClients),
      degraded: false,
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Radio className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <CardTitle className="truncate text-base">
              {siteScope === 'all' ? 'RF Health' : 'Site RF Health'}
            </CardTitle>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">Last 24h</span>
        </div>
        <p className="text-xs text-muted-foreground">RF quality and client signal distribution</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Top Row: Key RF Metrics */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {kpis.map(({ key, label, icon: Icon, value, degraded }) => (
            <div key={key} className="rounded-lg border border-border bg-muted/50 p-3">
              <div className="mb-1 flex items-center gap-2">
                <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                <span className="truncate text-xs font-medium text-muted-foreground">{label}</span>
              </div>
              <AnimatedValue
                value={value}
                className={`text-2xl font-semibold tabular-nums ${
                  degraded ? 'text-[color:var(--status-warning)]' : 'text-foreground'
                }`}
                pulseColor="bg-muted"
              />
            </div>
          ))}
        </div>

        {/* Middle Row: Band Distribution & SNR Quality */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-border bg-muted/50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Radio className="h-4 w-4 text-muted-foreground" aria-hidden />
                <span className="text-sm font-semibold text-foreground">Clients by band</span>
              </div>
              <span className="text-xs text-muted-foreground">{totalClients} total</span>
            </div>
            {bandDistribution.length > 0 ? (
              <div className="space-y-2">
                {bandDistribution.map((band) => {
                  const percentage = totalClients > 0 ? (band.count / totalClients) * 100 : 0;
                  const color = bandColor(band.band, theme, band.color);
                  return (
                    <div key={band.band} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-foreground">{band.band}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {band.count} ({Math.round(percentage)}%)
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${percentage}%`, backgroundColor: color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-16 items-center justify-center text-sm text-muted-foreground">
                No band data available
              </div>
            )}
          </div>

          <div className="rounded-lg border border-border bg-muted/50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" aria-hidden />
                <span className="text-sm font-semibold text-foreground">Signal quality (SNR)</span>
              </div>
              <span className="text-xs text-muted-foreground">{snrTotal} clients</span>
            </div>
            {snrDistribution.length > 0 ? (
              <div className="space-y-2">
                {snrDistribution.map((snr) => {
                  const percentage = snrTotal > 0 ? (snr.count / snrTotal) * 100 : 0;
                  const color = snrColor(snr.category, theme, snr.color);
                  return (
                    <div key={snr.category} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-foreground">{snr.category}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {snr.count} ({Math.round(percentage)}%)
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${percentage}%`, backgroundColor: color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-16 items-center justify-center text-sm text-muted-foreground">
                No SNR data available
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export const OrgSiteHealthOverview = memo(OrgSiteHealthOverviewImpl);
