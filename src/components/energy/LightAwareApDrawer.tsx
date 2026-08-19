import { useMemo, useState } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatWatts } from '@/lib/energyCalc';
import { useLightAwareAps } from '@/hooks/useEnergyData';
import type { LightAwareApRow, LightState } from '@/types/energy';

interface LightAwareApDrawerProps {
  open: boolean;
  onOpenChange: (value: boolean) => void;
}

const STATE_FILTERS: (LightState | 'all')[] = ['all', 'bright', 'dim', 'dark', 'unknown'];
const SENSOR_FILTERS = ['all', 'capable', 'unavailable'] as const;

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function stateVariant(state: LightState): 'success' | 'warning' | 'secondary' | 'info' {
  if (state === 'bright') return 'success';
  if (state === 'dim') return 'warning';
  if (state === 'dark') return 'info';
  return 'secondary';
}

export function LightAwareApDrawer({ open, onOpenChange }: LightAwareApDrawerProps) {
  // Only fetch while the drawer is open.
  const { data, loading } = useLightAwareAps(open);
  const [stateFilter, setStateFilter] = useState<(typeof STATE_FILTERS)[number]>('all');
  const [sensorFilter, setSensorFilter] = useState<(typeof SENSOR_FILTERS)[number]>('all');

  const rows = useMemo<LightAwareApRow[]>(() => {
    const all = data ?? [];
    return all.filter((r) => {
      if (stateFilter !== 'all' && r.lightState !== stateFilter) return false;
      if (sensorFilter === 'capable' && !r.sensorCapable) return false;
      if (sensorFilter === 'unavailable' && r.sensorCapable) return false;
      return true;
    });
  }, [data, stateFilter, sensorFilter]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Light-Aware APs</DialogTitle>
          <DialogDescription>
            Per-AP ambient-light state and modeled power. Values are modeled estimates, not
            measured.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <Select value={stateFilter} onValueChange={(v) => setStateFilter(v as typeof stateFilter)}>
            <SelectTrigger className="h-8 w-36">
              <SelectValue placeholder="Light state" />
            </SelectTrigger>
            <SelectContent>
              {STATE_FILTERS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s === 'all' ? 'All states' : s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={sensorFilter}
            onValueChange={(v) => setSensorFilter(v as typeof sensorFilter)}
          >
            <SelectTrigger className="h-8 w-40">
              <SelectValue placeholder="Sensor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All APs</SelectItem>
              <SelectItem value="capable">Sensor capable</SelectItem>
              <SelectItem value="unavailable">Sensor unavailable</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No APs match the current filters.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 font-medium">AP</th>
                  <th className="py-2 font-medium">Site</th>
                  <th className="py-2 font-medium">Model</th>
                  <th className="py-2 font-medium">Sensor</th>
                  <th className="py-2 font-medium">Light</th>
                  <th className="py-2 font-medium">Duration</th>
                  <th className="py-2 font-medium">Policy</th>
                  <th className="py-2 text-right font-medium">Current</th>
                  <th className="py-2 text-right font-medium">Optimized</th>
                  <th className="py-2 text-right font-medium">Savings</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.serial} className="border-b border-border/50">
                    <td className="py-2 font-medium text-foreground">{r.apName}</td>
                    <td className="py-2 text-muted-foreground">{r.siteId ?? '—'}</td>
                    <td className="py-2 text-muted-foreground">{r.model}</td>
                    <td className="py-2">
                      <Badge variant={r.sensorCapable ? 'success' : 'secondary'}>
                        {r.sensorCapable ? 'Yes' : 'No'}
                      </Badge>
                    </td>
                    <td className="py-2">
                      <Badge variant={stateVariant(r.lightState)}>{r.lightState}</Badge>
                    </td>
                    <td className="py-2 text-muted-foreground">{formatDuration(r.dwellSeconds)}</td>
                    <td className="py-2 text-muted-foreground">
                      {r.policyEnabled ? 'On' : 'Off'}
                    </td>
                    <td className="py-2 text-right text-foreground">{formatWatts(r.currentWatts)}</td>
                    <td className="py-2 text-right text-foreground">
                      {formatWatts(r.optimizedWatts)}
                    </td>
                    <td className="py-2 text-right text-foreground">
                      {formatWatts(r.savingsWatts)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
