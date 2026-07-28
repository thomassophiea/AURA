/**
 * Network Health panel — the controller's AP / switch tallies. AP active vs
 * inactive is computed from `/v1/aps/query` status (InService = active); the
 * raw status breakdown is shown so nothing is hidden. Switch counts come from
 * `/v1/switches` (empty on controllers with no switches). Synchronization /
 * mobility / availability are runtime status not in the config API and are
 * labelled as such rather than fabricated.
 */
import React from 'react';
import { Server, Wifi } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import type { NetworkHealth } from './diagnosticsEngine';

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'success' | 'error' | 'muted';
}) {
  const toneClass =
    tone === 'success'
      ? 'text-[var(--status-success,#2E7D32)]'
      : tone === 'error'
        ? 'text-[var(--status-error,#C62828)]'
        : 'text-foreground';
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <p className={`text-2xl font-semibold ${toneClass}`}>{value}</p>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

export function NetworkHealthPanel({ health }: { health: NetworkHealth }) {
  const breakdown = Object.entries(health.apStatusBreakdown).sort((a, b) => b[1] - a[1]);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Network Health</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Wifi className="h-4 w-4 text-muted-foreground" />
            Access Points
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Total" value={health.totalAps} />
            <Stat label="Active" value={health.activeAps} tone="success" />
            <Stat
              label="Inactive"
              value={health.inactiveAps}
              tone={health.inactiveAps > 0 ? 'error' : 'muted'}
            />
          </div>
          {breakdown.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {breakdown.map(([status, count]) => (
                <span key={status}>
                  <span className="font-medium text-foreground">{count}</span> {status}
                </span>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Server className="h-4 w-4 text-muted-foreground" />
            Switches
          </div>
          {health.totalSwitches === 0 ? (
            <p className="text-sm text-muted-foreground">No switches managed by this controller.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Active" value={health.activeSwitches} tone="success" />
              <Stat label="Inactive" value={health.inactiveSwitches} tone="muted" />
              <Stat
                label="Trouble"
                value={health.troubleSwitches}
                tone={health.troubleSwitches > 0 ? 'error' : 'muted'}
              />
            </div>
          )}
        </div>

        <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            Synchronization · Mobility · Availability
          </span>{' '}
          are live cluster status and are not exposed by the controller config API — check the
          controller directly.
        </div>
      </CardContent>
    </Card>
  );
}

export default NetworkHealthPanel;
