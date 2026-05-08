import { memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { AnimatedValue } from '../ui/animated-value';
import { Activity, Radio, Signal, Users, Wifi } from 'lucide-react';

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

/**
 * OrgSiteHealthOverview — comprehensive RF intelligence card. KPI quartet
 * (RFQI / Avg RSSI / Avg SNR / Clients) over a 2-up grid of band + SNR
 * distribution bars.
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
  const rfqiAvg =
    rfqiData.length > 0
      ? Math.round(
          rfqiData.reduce((acc, d) => acc + (d.rfqi > 5 ? d.rfqi : d.rfqi * 20), 0) /
            rfqiData.length
        )
      : null;
  const snrTotal = snrDistribution.reduce((acc, s) => acc + s.count, 0);

  return (
    <Card className="relative overflow-hidden border-slate-700/50 bg-gradient-to-br from-background via-background to-slate-900/50">
      <CardHeader className="pb-2 relative z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Radio className="h-6 w-6 text-[color:var(--status-info)] animate-pulse" />
              <div className="absolute inset-0 h-6 w-6 bg-cyan-400/30 blur-md animate-pulse" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold text-foreground">
                {siteScope === 'all' ? 'Org' : 'Site'} Health Overview
              </CardTitle>
              <p className="text-xs text-muted-foreground">Real-time RF Quality Intelligence</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-cyan-400 animate-ping" />
            <span className="text-sm font-medium text-[color:var(--status-info)]">LIVE</span>
            <span className="text-xs text-muted-foreground border-l border-border pl-2 ml-1">
              24h
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="relative z-10 space-y-4">
        {/* Top Row: Key RF Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500/10 to-purple-600/5 border border-purple-500/20">
            <div className="flex items-center gap-2 mb-1">
              <Signal className="h-4 w-4 text-purple-400" />
              <span className="text-xs font-medium text-muted-foreground">RFQI Score</span>
            </div>
            <AnimatedValue
              value={rfqiAvg !== null ? `${rfqiAvg}%` : '--'}
              className="text-2xl font-bold text-purple-400 tabular-nums"
              pulseColor="bg-purple-500/30"
            />
          </div>

          <div className="p-3 rounded-xl bg-gradient-to-br from-cyan-500/10 to-cyan-600/5 border border-[color:var(--status-info)]/20">
            <div className="flex items-center gap-2 mb-1">
              <Wifi className="h-4 w-4 text-[color:var(--status-info)]" />
              <span className="text-xs font-medium text-muted-foreground">Avg RSSI</span>
            </div>
            <AnimatedValue
              value={avgRssi !== 0 ? `${avgRssi} dBm` : '--'}
              className="text-2xl font-bold text-[color:var(--status-info)] tabular-nums"
              pulseColor="bg-[color:var(--status-info-bg)]"
            />
          </div>

          <div className="p-3 rounded-xl bg-[color:var(--status-success-bg)] border border-[color:var(--status-success)]/20">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="h-4 w-4 text-[color:var(--status-success)]" />
              <span className="text-xs font-medium text-muted-foreground">Avg SNR</span>
            </div>
            <AnimatedValue
              value={avgSnr > 0 ? `${avgSnr} dB` : '--'}
              className="text-2xl font-bold text-[color:var(--status-success)] tabular-nums"
              pulseColor="bg-[color:var(--status-success-bg)]"
            />
          </div>

          <div className="p-3 rounded-xl bg-[color:var(--status-warning-bg)] border border-[color:var(--status-warning)]/20">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-[color:var(--status-warning)]" />
              <span className="text-xs font-medium text-muted-foreground">Connected</span>
            </div>
            <AnimatedValue
              value={totalClients}
              className="text-2xl font-bold text-[color:var(--status-warning)] tabular-nums"
              pulseColor="bg-[color:var(--status-warning-bg)]"
            />
          </div>
        </div>

        {/* Middle Row: Band Distribution & SNR Quality */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-muted/50 border border-border">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Radio className="h-4 w-4 text-[color:var(--status-info)]" />
                <span className="text-sm font-semibold text-foreground">
                  Client Distribution by Band
                </span>
              </div>
              <span className="text-xs text-muted-foreground">{totalClients} total</span>
            </div>
            {bandDistribution.length > 0 ? (
              <div className="space-y-2">
                {bandDistribution.map((band) => {
                  const percentage = totalClients > 0 ? (band.count / totalClients) * 100 : 0;
                  return (
                    <div key={band.band} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-foreground font-medium">{band.band}</span>
                        <span className="tabular-nums" style={{ color: band.color }}>
                          {band.count} ({Math.round(percentage)}%)
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${percentage}%`, backgroundColor: band.color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center justify-center h-16 text-muted-foreground text-sm">
                No band data available
              </div>
            )}
          </div>

          <div className="p-4 rounded-xl bg-muted/50 border border-border">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-[color:var(--status-success)]" />
                <span className="text-sm font-semibold text-foreground">Signal Quality (SNR)</span>
              </div>
              <span className="text-xs text-muted-foreground">{snrTotal} clients</span>
            </div>
            {snrDistribution.length > 0 ? (
              <div className="space-y-2">
                {snrDistribution.map((snr) => {
                  const percentage = snrTotal > 0 ? (snr.count / snrTotal) * 100 : 0;
                  return (
                    <div key={snr.category} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-foreground font-medium">{snr.category}</span>
                        <span className="tabular-nums" style={{ color: snr.color }}>
                          {snr.count} ({Math.round(percentage)}%)
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${percentage}%`, backgroundColor: snr.color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center justify-center h-16 text-muted-foreground text-sm">
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
