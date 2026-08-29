/**
 * EstateOverview — every registered controller's health in one strip,
 * worst first. Data comes from /api/estate/summary, which probes each
 * monitored source with its own credentials in parallel. With a single
 * controller this is a one-row health banner; with a fleet it is the
 * platform's top-level answer.
 */

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Badge } from '../ui/badge';
import { Server, Wifi, Users, Building2, RefreshCw } from 'lucide-react';
import { apiService, getDynamicControllerUrl } from '../../services/api';

interface EstateController {
  sourceId: string;
  name: string;
  baseUrl: string;
  reachable: boolean;
  error?: string;
  aps?: { total: number; inService: number };
  clients?: number | null;
  sites?: number | null;
}

export function EstateOverview() {
  const [controllers, setControllers] = useState<EstateController[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const headers: Record<string, string> = {};
    const token = apiService.getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const controllerUrl = getDynamicControllerUrl();
    if (controllerUrl) headers['X-Controller-URL'] = controllerUrl;

    fetch('/api/estate/summary', { credentials: 'include', headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (!cancelled) setControllers(body?.controllers ?? null);
      })
      .catch(() => {
        if (!cancelled) setControllers(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Nothing registered (or the registry is unavailable) — say nothing.
  if (!loading && (!controllers || controllers.length === 0)) return null;

  /**
   * The registry names an unnamed default source after its env var
   * ("Default controller (CAMPUS_CONTROLLER_URL)"). Users get the product
   * word, never the env plumbing.
   */
  const displayName = (name: string) =>
    name
      .replace(/\s*\(([A-Z0-9_]+)\)\s*$/, '')
      .replace(/\bcontroller\b/gi, 'gateway')
      .replace(/^gateway$/i, 'Gateway') || 'Gateway';

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-muted-foreground" aria-hidden />
          <CardTitle className="text-sm font-medium">Gateways</CardTitle>
          <CardDescription className="text-xs">
            {controllers
              ? `${controllers.length} ${controllers.length === 1 ? 'gateway' : 'gateways'} · worst first`
              : ''}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Checking gateways...
          </div>
        ) : (
          <div className="space-y-1.5">
            {controllers?.map((c) => {
              const apsDown = (c.aps?.total ?? 0) - (c.aps?.inService ?? 0);
              return (
                <div
                  key={c.sourceId}
                  className="flex items-center gap-3 rounded-lg border border-border/40 px-3 py-2 text-sm"
                >
                  <span
                    className={`h-2 w-2 rounded-full shrink-0 ${
                      !c.reachable
                        ? 'bg-[color:var(--status-error)]'
                        : apsDown > 0
                          ? 'bg-[color:var(--status-warning)]'
                          : 'bg-[color:var(--status-success)]'
                    }`}
                    aria-hidden
                  />
                  {/* Both spans must be flex items for truncate to clamp — on
                      inline children of a block parent it is a silent no-op. */}
                  <div className="flex min-w-0 flex-1 items-baseline gap-2">
                    <span className="truncate font-medium" title={displayName(c.name)}>
                      {displayName(c.name)}
                    </span>
                    <span
                      className="truncate font-mono text-xs text-muted-foreground"
                      title={c.baseUrl}
                    >
                      {c.baseUrl.replace(/^https?:\/\//, '')}
                    </span>
                  </div>
                  {c.reachable ? (
                    <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Wifi className="h-3.5 w-3.5" aria-hidden />
                        <span className="tabular-nums">
                          {c.aps?.inService ?? 0}/{c.aps?.total ?? 0}
                        </span>{' '}
                        APs
                      </span>
                      {c.clients !== null && (
                        <span className="flex items-center gap-1" title="Connected clients">
                          <Users className="h-3.5 w-3.5" aria-hidden />
                          <span className="tabular-nums">{c.clients}</span>
                        </span>
                      )}
                      {c.sites !== null && (
                        <span className="flex items-center gap-1" title="Sites">
                          <Building2 className="h-3.5 w-3.5" aria-hidden />
                          <span className="tabular-nums">{c.sites}</span>
                        </span>
                      )}
                    </div>
                  ) : (
                    <Badge variant="critical" className="shrink-0 text-[10px]">
                      {c.error ?? 'Unreachable'}
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
