/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * SLE Site Scoreboard — per-site service levels, worst first.
 *
 * With "All Sites" selected the honeycomb shows one estate-wide aggregate; this
 * table breaks the same already-loaded data down by site using the same pure
 * SLE calculators (stations carry siteId; APs carry the site name in hostSite),
 * so no extra controller round-trips are made. Clicking a row scopes the whole
 * page to that site.
 */

import { useMemo } from 'react';
import { ChevronRight, Building2 } from 'lucide-react';
import { computeAllWirelessSLEs } from '../../services/sleCalculationEngine';
import { SLE_STATUS_COLORS, getSLEStatus } from '../../types/sle';

interface SiteRef {
  id: string;
  name?: string;
  siteName?: string;
}

interface SLESiteScoreboardProps {
  sites: SiteRef[];
  stations: any[];
  aps: any[];
  onSelectSite: (siteId: string) => void;
}

interface SiteRow {
  siteId: string;
  siteName: string;
  overall: number | null;
  worstMetric: string | null;
  worstScore: number | null;
  clients: number;
  apCount: number;
}

function siteDisplayName(site: SiteRef): string {
  return site.siteName ?? site.name ?? site.id;
}

export function SLESiteScoreboard({ sites, stations, aps, onSelectSite }: SLESiteScoreboardProps) {
  const rows = useMemo<SiteRow[]>(() => {
    const result: SiteRow[] = [];
    for (const site of sites) {
      const name = siteDisplayName(site);
      const siteStations = stations.filter((s) => s.siteId === site.id || s.siteName === name);
      const siteAps = aps.filter((ap) => ap.hostSite === name);
      if (siteStations.length === 0 && siteAps.length === 0) continue;

      // Same calculators as the honeycomb, on this site's subset. The local
      // trend buffer is estate-wide, so it is deliberately not passed here.
      const sles = computeAllWirelessSLEs(siteStations, siteAps, []);
      const measured = sles.filter((s) => s.hasData !== false);
      const overall =
        measured.length > 0
          ? measured.reduce((sum, s) => sum + s.successRate, 0) / measured.length
          : null;
      const worst = measured.length
        ? measured.reduce((min, s) => (s.successRate < min.successRate ? s : min))
        : null;

      result.push({
        siteId: site.id,
        siteName: name,
        overall,
        worstMetric: worst && worst.successRate < 100 ? worst.name : null,
        worstScore: worst && worst.successRate < 100 ? worst.successRate : null,
        clients: siteStations.length,
        apCount: siteAps.length,
      });
    }
    // Worst first; sites with nothing measurable sink to the bottom.
    return result.sort((a, b) => (a.overall ?? 101) - (b.overall ?? 101));
  }, [sites, stations, aps]);

  if (rows.length < 2) return null;

  return (
    <div className="rounded-lg border border-border/50 overflow-hidden">
      <div className="flex items-center gap-2 bg-muted/30 px-4 py-2.5">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Service Levels by Site</span>
        <span className="text-xs text-muted-foreground">worst first</span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/20 text-muted-foreground text-xs">
            <th className="text-left px-4 py-2 font-medium">Site</th>
            <th className="text-left px-4 py-2 font-medium w-48">Overall</th>
            <th className="text-left px-4 py-2 font-medium">Weakest Metric</th>
            <th className="text-center px-4 py-2 font-medium">Clients</th>
            <th className="text-center px-4 py-2 font-medium">APs</th>
            <th className="w-8" aria-hidden />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const status = row.overall !== null ? getSLEStatus(row.overall) : null;
            const color = status ? SLE_STATUS_COLORS[status].hex : 'var(--muted-foreground)';
            return (
              <tr
                key={row.siteId}
                className="border-t border-border/30 hover:bg-muted/20 cursor-pointer transition-colors"
                onClick={() => onSelectSite(row.siteId)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectSite(row.siteId);
                  }
                }}
                aria-label={`Scope the page to site ${row.siteName}`}
              >
                <td className="px-4 py-2.5 font-medium">{row.siteName}</td>
                <td className="px-4 py-2.5">
                  {row.overall !== null ? (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${row.overall}%`, backgroundColor: color }}
                        />
                      </div>
                      <span className="text-xs font-bold" style={{ color }}>
                        {row.overall.toFixed(1)}%
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">No data</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">
                  {row.worstMetric ? (
                    <>
                      {row.worstMetric}{' '}
                      <span className="font-medium">{row.worstScore?.toFixed(1)}%</span>
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-4 py-2.5 text-center">{row.clients}</td>
                <td className="px-4 py-2.5 text-center">{row.apCount}</td>
                <td className="px-2 py-2.5 text-muted-foreground">
                  <ChevronRight className="h-4 w-4" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
