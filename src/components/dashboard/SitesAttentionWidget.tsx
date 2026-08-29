/**
 * SitesAttentionWidget — worst-first site health for the Network Overview.
 * Answers "which sites are affected?" using data the page already fetched:
 * the AP inventory (siteName + status per AP) and the station list. Zero new
 * endpoints; the /v3/sites report fields (activeAPs etc.) are absent on this
 * controller version, so grouping the AP rows is the trustworthy source.
 */

import { memo, useMemo } from 'react';
import { Building2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { StatusDot } from '../ui/StatusBadge';
import { Badge } from '../ui/badge';
import { formatCount } from '../../lib/units';
import {
  isAccessPointOnline,
  type AccessPoint,
  type Station,
} from '../../hooks/useDashboardData';

interface SiteHealthRow {
  name: string;
  apsTotal: number;
  apsDown: number;
  clients: number;
  status: 'healthy' | 'warning' | 'critical';
}

interface SitesAttentionWidgetProps {
  accessPoints: AccessPoint[];
  stations: Station[];
}

const SEVERITY_RANK = { critical: 0, warning: 1, healthy: 2 } as const;
const MAX_ROWS = 6;

function SitesAttentionWidgetImpl({ accessPoints, stations }: SitesAttentionWidgetProps) {
  const rows = useMemo<SiteHealthRow[]>(() => {
    const bySite = new Map<string, { total: number; down: number }>();
    for (const ap of accessPoints) {
      // The /v1/aps/query row names its site `hostSite`; older shapes use
      // siteName/location. Same fallback chain as the AP page.
      const site =
        (ap as { hostSite?: string }).hostSite ||
        ap.siteName ||
        (ap as { location?: string }).location ||
        'Unassigned';
      const entry = bySite.get(site) ?? { total: 0, down: 0 };
      entry.total++;
      if (!isAccessPointOnline(ap)) entry.down++;
      bySite.set(site, entry);
    }
    const clientsBySite = new Map<string, number>();
    for (const st of stations) {
      const site = (st as { siteName?: string }).siteName;
      if (site) clientsBySite.set(site, (clientsBySite.get(site) ?? 0) + 1);
    }
    return Array.from(bySite.entries())
      .map(([name, { total, down }]) => ({
        name,
        apsTotal: total,
        apsDown: down,
        clients: clientsBySite.get(name) ?? 0,
        status: (down === 0 ? 'healthy' : down >= total ? 'critical' : 'warning') as
          | 'healthy'
          | 'warning'
          | 'critical',
      }))
      .sort(
        (a, b) =>
          SEVERITY_RANK[a.status] - SEVERITY_RANK[b.status] ||
          b.apsDown - a.apsDown ||
          b.clients - a.clients
      );
  }, [accessPoints, stations]);

  // No AP inventory yet (loading, or none assigned to sites) — say nothing.
  if (rows.length === 0) return null;

  const needsAttention = rows.filter((r) => r.status !== 'healthy').length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <CardTitle className="text-sm font-medium">Sites</CardTitle>
            <CardDescription className="truncate text-xs">worst first</CardDescription>
          </div>
          {needsAttention > 0 ? (
            <Badge variant="warning">
              {needsAttention} {needsAttention === 1 ? 'site needs' : 'sites need'} attention
            </Badge>
          ) : (
            <Badge variant="success">All sites healthy</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-1.5">
          {rows.slice(0, MAX_ROWS).map((site) => (
            <div
              key={site.name}
              className="flex items-center gap-3 rounded-lg border border-border/40 px-3 py-2 text-sm"
            >
              <StatusDot status={site.status} />
              <span className="min-w-0 flex-1 truncate font-medium" title={site.name}>
                {site.name}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {site.apsTotal - site.apsDown}/{site.apsTotal}{' '}
                {site.apsTotal === 1 ? 'AP' : 'APs'}
              </span>
              <span className="w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {formatCount(site.clients)} {site.clients === 1 ? 'client' : 'clients'}
              </span>
            </div>
          ))}
          {rows.length > MAX_ROWS && (
            <p className="pt-1 text-xs text-muted-foreground">
              {rows.length - MAX_ROWS} more {rows.length - MAX_ROWS === 1 ? 'site' : 'sites'} —
              healthy sites are listed after those needing attention
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export const SitesAttentionWidget = memo(SitesAttentionWidgetImpl);
