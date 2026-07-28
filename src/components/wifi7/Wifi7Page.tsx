/**
 * Wi-Fi 7 (MLO + AFC) page. Live read of per-radio EHT / AFC / MLO state from
 * the controller with verified write-back editors. Wired as the
 * `configure-wifi7` route in App.tsx.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Info, RefreshCw, Sparkles, TriangleAlert, Waypoints } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import type { Wifi7Snapshot } from '../../types/wifi7';
import { getWifi7Snapshot } from '../../services/wifi7Service';
import { EhtRadioMatrix } from './wifi7Viz';
import { AfcPanel } from './AfcPanel';
import { MloPanel } from './MloPanel';

interface StatTileProps {
  label: string;
  value: number | string;
  sub?: string;
  accent?: string;
}
function StatTile({ label, value, sub, accent = 'text-foreground' }: StatTileProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`mt-1 text-2xl font-semibold tabular-nums ${accent}`}>{value}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export function Wifi7Page() {
  const [snapshot, setSnapshot] = useState<Wifi7Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      setSnapshot(await getWifi7Snapshot());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load Wi-Fi 7 data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
  }, [load]);

  const s = snapshot?.summary;
  const tiles = useMemo(() => {
    if (!s) return [];
    return [
      { label: 'Wi-Fi 7 APs', value: s.ehtAps, sub: `of ${s.totalAps} total`, accent: 'text-indigo-500' },
      { label: 'EHT radios', value: s.ehtRadios, sub: '802.11be capable' },
      { label: 'AFC radios', value: s.afcRadios, sub: 'coordination on', accent: 'text-amber-500' },
      { label: 'Standard Power', value: s.standardPowerRadios, sub: '6 GHz SP radios', accent: 'text-indigo-500' },
      { label: 'MLO groups', value: s.mloConfiguredAps, sub: 'APs configured' },
      { label: 'Wi-Fi 7 clients', value: s.ehtClients, sub: `of ${s.totalClients} associated` },
    ];
  }, [s]);

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <TriangleAlert className="h-4 w-4" />
          <AlertTitle>Could not load Wi-Fi 7 data</AlertTitle>
          <AlertDescription>
            {error}
            <div className="mt-3">
              <Button size="sm" variant="outline" onClick={() => void load(true)}>
                Retry
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!snapshot) return null;

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Waypoints className="h-5 w-5 text-indigo-500" />
          <div>
            <h1 className="flex items-center gap-2 text-lg font-semibold">
              Wi-Fi 7 · MLO &amp; AFC <Sparkles className="h-4 w-4 text-indigo-400" />
            </h1>
            <p className="text-xs text-muted-foreground">
              Multi-Link Operation &amp; Automated Frequency Coordination — live controller state
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load(false)} disabled={refreshing}>
          <RefreshCw className={`mr-1 h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((t) => (
          <StatTile key={t.label} {...t} />
        ))}
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="mlo">MLO</TabsTrigger>
          <TabsTrigger value="afc">AFC</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {snapshot.notes.map((note, i) => (
            <Alert key={i}>
              <Info className="h-4 w-4" />
              <AlertDescription>{note}</AlertDescription>
            </Alert>
          ))}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Fleet 802.11be / AFC matrix</CardTitle>
            </CardHeader>
            <CardContent>
              <EhtRadioMatrix aps={snapshot.aps} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mlo">
          <MloPanel
            aps={snapshot.aps}
            services={snapshot.services}
            clientProtocols={snapshot.clientProtocols}
            onRefresh={() => void load(false)}
          />
        </TabsContent>

        <TabsContent value="afc">
          <AfcPanel aps={snapshot.aps} onRefresh={() => void load(false)} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default Wifi7Page;
