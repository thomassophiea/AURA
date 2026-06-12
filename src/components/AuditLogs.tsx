/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Audit Logs (Operations) — unified audit log view across OS-ONE and XIQ.
 *
 * Uses the shared source-aware site selector: pick an OS-ONE site to see the
 * controller's audit logs, or an XIQ site to see the XIQ account audit logs.
 * Both sources normalize into one row shape and render in the same table.
 */

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { ScrollArea } from './ui/scroll-area';
import { Input } from './ui/input';
import { RefreshCw, Clock, ScrollText, Search } from 'lucide-react';
import { apiService } from '../services/api';
import { useAppContext } from '@/contexts/AppContext';
import { useSourceSites } from '../hooks/useSourceSites';
import { SourceSiteSelector } from './SourceSiteSelector';
import { parseXiqSiteValue } from '../services/siteContextService';
import {
  loadXiqAuditLogs,
  normalizeControllerAuditLog,
  type NormalizedAuditLog,
} from '../services/xiqInsights';

const RANGE_MS: Record<string, number> = {
  '24h': 86_400_000,
  '7d': 604_800_000,
  '30d': 2_592_000_000,
};

export function AuditLogs() {
  const { navigationScope, siteGroups } = useAppContext();
  const { sites, xiqSites } = useSourceSites();
  const [selectedSite, setSelectedSite] = useState<string>('all');
  const [timeRange, setTimeRange] = useState<string>('7d');
  const [logs, setLogs] = useState<NormalizedAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const xiqSel = parseXiqSiteValue(selectedSite);
  const isXiq = !!xiqSel;
  const source: 'OS-ONE' | 'XIQ' = isXiq ? 'XIQ' : 'OS-ONE';

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const end = Date.now();
      const start = end - (RANGE_MS[timeRange] ?? RANGE_MS['7d']);
      try {
        let rows: NormalizedAuditLog[] = [];
        if (xiqSel) {
          rows = await loadXiqAuditLogs(xiqSel.siteGroupId, start, end);
        } else if (navigationScope === 'global' && siteGroups.length > 0) {
          // Org scope: aggregate controller audit logs across every controller.
          const original = apiService.getBaseUrl();
          const collected: any[] = [];
          for (const sg of siteGroups) {
            if (!sg.controller_url) continue;
            try {
              apiService.setBaseUrl(`${sg.controller_url}/management`);
              const r = await apiService.getAuditLogs(start, end);
              collected.push(...(Array.isArray(r) ? r : []));
            } catch {
              /* skip this controller */
            }
          }
          apiService.setBaseUrl(original === '/api/management' ? null : original);
          rows = collected.map(normalizeControllerAuditLog);
        } else {
          const r = await apiService.getAuditLogs(start, end);
          rows = (Array.isArray(r) ? r : []).map(normalizeControllerAuditLog);
        }
        rows.sort((a, b) => b.timestamp - a.timestamp);
        if (!cancelled) {
          setLogs(rows);
          setLastUpdate(new Date());
        }
      } catch {
        if (!cancelled) setLogs([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSite, timeRange, navigationScope, siteGroups]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter((l) =>
      [l.user, l.action, l.category, l.description].some((f) => f?.toLowerCase().includes(q))
    );
  }, [logs, query]);

  const fmtTime = (ts: number) => (ts ? new Date(ts).toLocaleString() : '—');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-3xl tracking-tight">Audit Logs</h2>
          <p className="text-muted-foreground text-sm">
            User and system activity from the selected source
            {lastUpdate && <span className="ml-2">- Updated {lastUpdate.toLocaleTimeString()}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SourceSiteSelector
            value={selectedSite}
            onValueChange={setSelectedSite}
            sites={sites}
            xiqSites={xiqSites}
            triggerClassName="w-[180px] h-9"
          />
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-40 h-9">
              <Clock className="h-4 w-4 mr-2 flex-shrink-0" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24 Hours</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => setSelectedSite((s) => s)}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <ScrollText className="h-4 w-4 text-primary" />
            Audit Logs
            <Badge
              variant="outline"
              className={
                source === 'XIQ'
                  ? 'border-cyan-500/40 text-cyan-500'
                  : 'border-violet-500/40 text-violet-500'
              }
            >
              {source}
            </Badge>
            <Badge variant="secondary">{filtered.length}</Badge>
          </CardTitle>
          <div className="relative w-64 max-w-[40vw]">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search user, action, description…"
              className="pl-8 h-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <RefreshCw className="h-4 w-4 animate-spin" /> Loading audit logs…
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
              <ScrollText className="h-10 w-10 opacity-40 mb-3" />
              <p className="text-sm">No audit logs for this source and time range.</p>
            </div>
          ) : (
            <ScrollArea className="h-[560px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-44">Time</TableHead>
                    <TableHead className="w-44">User</TableHead>
                    <TableHead className="w-32">Action</TableHead>
                    <TableHead className="w-32">Category</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-xs tabular-nums text-muted-foreground">
                        {fmtTime(l.timestamp)}
                      </TableCell>
                      <TableCell className="text-xs">{l.user || '—'}</TableCell>
                      <TableCell className="text-xs">
                        {l.action ? <Badge variant="outline">{l.action}</Badge> : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {l.category || '—'}
                      </TableCell>
                      <TableCell className="text-xs">{l.description || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
