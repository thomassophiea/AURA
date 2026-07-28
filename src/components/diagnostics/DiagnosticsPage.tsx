/**
 * System Health / Diagnostics page — mirrors the Extreme controller's Tools →
 * Diagnostics area (DASHBOARD · UTILITIES · AP SERVICE · RADIUS SERVERS · AFC
 * SERVER). The Dashboard tab pairs the computed System Health check lists with
 * the Network Health tallies. Every status is derived from live controller data
 * (there is no health REST endpoint); runtime-only items are labelled, never
 * fabricated. Schema: audit/SYSTEM_HEALTH_DIAGNOSTICS_FINDINGS.md.
 */
import React from 'react';
import { RefreshCw, Stethoscope } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { overallSeverity, type Severity } from './diagnosticsEngine';
import { useSystemHealth } from './useSystemHealth';
import { SystemHealthPanel } from './SystemHealthPanel';
import { NetworkHealthPanel } from './NetworkHealthPanel';
import { RadiusServersTab } from './RadiusServersTab';
import { AfcServerTab } from './AfcServerTab';
import { ApServiceTab, UtilitiesTab } from './DiagnosticsToolsTabs';

const SEVERITY_BADGE: Record<Severity, { variant: 'success' | 'warning' | 'destructive'; label: string }> = {
  ok: { variant: 'success', label: 'Healthy' },
  warn: { variant: 'warning', label: 'Warnings' },
  alert: { variant: 'destructive', label: 'Alerts' },
};

export function DiagnosticsPage() {
  const { result, aps, aaaPolicies, loading, refresh } = useSystemHealth();
  const severity = result ? overallSeverity(result.checks) : 'ok';
  const badge = SEVERITY_BADGE[severity];

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Stethoscope className="h-8 w-8 text-primary" />
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-medium">System Health &amp; Diagnostics</h1>
              {!loading && result && <Badge variant={badge.variant}>{badge.label}</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">
              Controller health checks computed from live configuration (/v1/aps, /v3/profiles,
              /v1/aps/query, /v1/switches, /v1/aaapolicy). No health endpoint exists — every status
              is derived, and runtime-only items are labelled.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList className="h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="dashboard" className="flex-none">
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="utilities" className="flex-none">
            Utilities
          </TabsTrigger>
          <TabsTrigger value="apservice" className="flex-none">
            AP Service
          </TabsTrigger>
          <TabsTrigger value="radius" className="flex-none">
            RADIUS Servers
          </TabsTrigger>
          <TabsTrigger value="afc" className="flex-none">
            AFC Server
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="pt-4">
          {loading || !result ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Skeleton className="h-96 w-full" />
              <Skeleton className="h-96 w-full" />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <SystemHealthPanel checks={result.checks} />
              <NetworkHealthPanel health={result.networkHealth} />
            </div>
          )}
        </TabsContent>

        <TabsContent value="utilities" className="pt-4">
          <UtilitiesTab />
        </TabsContent>
        <TabsContent value="apservice" className="pt-4">
          <ApServiceTab />
        </TabsContent>
        <TabsContent value="radius" className="pt-4">
          {loading ? <Skeleton className="h-64 w-full" /> : <RadiusServersTab aaaPolicies={aaaPolicies} />}
        </TabsContent>
        <TabsContent value="afc" className="pt-4">
          {loading ? <Skeleton className="h-64 w-full" /> : <AfcServerTab aps={aps} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default DiagnosticsPage;
