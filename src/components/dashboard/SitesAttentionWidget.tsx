/**
 * SitesAttentionWidget — worst-first site health list for the Network
 * Overview. Answers "which sites are affected?" — the single question the
 * overview previously could not: sites were fetched on every load and used
 * only for a name lookup while activeAPs/nonActiveAPs/allClients were
 * discarded.
 *
 * Zero new endpoints: getSites() already returns the per-site AP and client
 * counts this renders.
 */

import { memo, useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Skeleton } from '../ui/skeleton';
import { StatusDot } from '../ui/StatusBadge';
import { Badge } from '../ui/badge';
import { apiService } from '../../services/api';
import type { Site } from '../../types/api';
import { formatCount } from '../../lib/units';

interface SiteHealthRow {
  id: string;
  name: string;
  apsTotal: number;
  apsDown: number;
  clients: number;
  status: 'healthy' | 'warning' | 'critical';
}

function toRow(site: Site): SiteHealthRow | null {
  const active = Number(site.activeAPs);
  const inactive = Number(site.nonActiveAPs);
  const hasApCounts = Number.isFinite(active) || Number.isFinite(inactive);
  if (!hasApCounts) return null;
  const apsDown = Number.isFinite(inactive) ? inactive : 0;
  const apsTotal = (Number.isFinite(active) ? active : 0) + apsDown;
  return {
    id: site.id,
    name: site.name || site.siteName || site.id,
    apsTotal,
    apsDown,
    clients: Number.isFinite(Number(site.allClients)) ? Number(site.allClients) : 0,
    // All APs down at a site with APs is an outage; some down is degradation.
    status:
      apsDown === 0 ? 'healthy' : apsTotal > 0 && apsDown >= apsTotal ? 'critical' : 'warning',
  };
}

const SEVERITY_RANK = { critical: 0, warning: 1, healthy: 2 } as const;
const MAX_ROWS = 6;

function SitesAttentionWidgetImpl() {
  const [rows, setRows] = useState<SiteHealthRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiService
      .getSites()
      .then((sites) => {
        if (cancelled) return;
        const mapped = (sites ?? [])
          .map(toRow)
          .filter((r): r is SiteHealthRow => r !== null)
          .sort(
            (a, b) =>
              SEVERITY_RANK[a.status] - SEVERITY_RANK[b.status] ||
              b.apsDown - a.apsDown ||
              b.clients - a.clients
          );
        setRows(mapped);
      })
      .catch(() => {
        if (!cancelled) setRows(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // No per-site AP counts on this controller — say nothing rather than lie.
  if (!loading && (!rows || rows.length === 0)) return null;

  const needsAttention = rows?.filter((r) => r.status !== 'healthy').length ?? 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <CardTitle className="text-sm font-medium">Sites</CardTitle>
            <CardDescription className="truncate text-xs">worst first</CardDescription>
          </div>
          {rows && needsAttention > 0 ? (
            <Badge variant="warning">
              {needsAttention} {needsAttention === 1 ? 'site needs' : 'sites need'} attention
            </Badge>
          ) : (
            rows && <Badge variant="success">All sites healthy</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="space-y-1.5">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : (
          <div className="space-y-1.5">
            {rows!.slice(0, MAX_ROWS).map((site) => (
              <div
                key={site.id}
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
            {rows!.length > MAX_ROWS && (
              <p className="pt-1 text-xs text-muted-foreground">
                {rows!.length - MAX_ROWS} more {rows!.length - MAX_ROWS === 1 ? 'site' : 'sites'} —
                all healthy sites are listed after those needing attention
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export const SitesAttentionWidget = memo(SitesAttentionWidgetImpl);
