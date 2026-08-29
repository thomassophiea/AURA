/**
 * Config History — configuration snapshots, point-in-time diffs, and the
 * compliance score trend.
 *
 * Snapshots are taken nightly by the server (plus on demand here) through the
 * platform service account. Selecting two snapshots shows exactly which WLANs,
 * networks, policies, profiles, and sites were added, removed, or changed
 * between them. Export downloads the full snapshot JSON.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import {
  Camera,
  Download,
  GitCompareArrows,
  RefreshCw,
  ShieldCheck,
  Plus,
  Minus,
  Pencil,
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import { apiService, getDynamicControllerUrl } from '../services/api';
import { useAuraSession } from '../hooks/useAuraSession';
import { toast } from 'sonner';

interface SnapshotMeta {
  id: number;
  sourceBaseUrl: string;
  takenAt: string;
  kind: string;
  takenBy: string | null;
  sectionHashes: Record<string, string>;
}

interface DiffSection {
  section: string;
  label: string;
  added: string[];
  removed: string[];
  changed: string[];
  unchanged: number;
}

interface CompliancePoint {
  at: string;
  good: number;
  warning: number;
  error: number;
  score: number;
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = apiService.getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const controllerUrl = getDynamicControllerUrl();
  if (controllerUrl) headers['X-Controller-URL'] = controllerUrl;
  return headers;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(path, { credentials: 'include', ...init, headers: authHeaders() });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${resp.status}`);
  }
  return resp.json() as Promise<T>;
}

export default function ConfigHistory() {
  const { canOperate } = useAuraSession();
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);
  const [compliance, setCompliance] = useState<CompliancePoint[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [diff, setDiff] = useState<{
    from: { id: number; takenAt: string };
    to: { id: number; takenAt: string };
    sections: DiffSection[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [snaps, comp] = await Promise.all([
        api<{ snapshots: SnapshotMeta[] }>('/api/config/snapshots?limit=30'),
        api<{ history: CompliancePoint[] }>('/api/config/compliance/history?days=90'),
      ]);
      setSnapshots(snaps.snapshots);
      setCompliance(comp.history);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Load the diff whenever exactly two snapshots are selected.
  useEffect(() => {
    if (selected.length !== 2) {
      setDiff(null);
      return;
    }
    const [a, b] = [...selected].sort((x, y) => x - y);
    let cancelled = false;
    api<typeof diff>(`/api/config/diff?from=${a}&to=${b}`)
      .then((d) => {
        if (!cancelled) setDiff(d);
      })
      .catch((err) => toast.error(`Diff failed: ${(err as Error).message}`));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      // Keep at most two: the newest click replaces the older selection.
      return prev.length >= 2 ? [prev[1], id] : [...prev, id];
    });
  };

  const captureNow = async () => {
    setCapturing(true);
    try {
      await api('/api/config/snapshots', { method: 'POST' });
      toast.success('Configuration snapshot captured');
      reload();
    } catch (err) {
      toast.error(`Snapshot failed: ${(err as Error).message}`);
    } finally {
      setCapturing(false);
    }
  };

  const exportSnapshot = async (id: number) => {
    try {
      const { snapshot } = await api<{ snapshot: unknown }>(`/api/config/snapshots/${id}`);
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aura-config-snapshot-${id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(`Export failed: ${(err as Error).message}`);
    }
  };

  const latestScore = compliance.length > 0 ? compliance[compliance.length - 1] : null;
  const complianceChart = useMemo(
    () =>
      compliance.map((p) => ({
        ...p,
        label: new Date(p.at).toLocaleDateString([], { month: 'short', day: 'numeric' }),
      })),
    [compliance]
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin" /> Loading configuration history...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">
          Nightly configuration snapshots with point-in-time diffs. Select any two snapshots to
          see exactly what changed.
        </p>
        <Button size="sm" onClick={captureNow} disabled={capturing || !canOperate}>
          {capturing ? (
            <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Camera className="mr-1.5 h-3.5 w-3.5" />
          )}
          Capture Snapshot Now
        </Button>
      </div>

      {error && (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Configuration history unavailable: {error}
          </CardContent>
        </Card>
      )}

      {/* Compliance trend */}
      {complianceChart.length >= 2 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-base">Compliance Score</CardTitle>
                  <CardDescription>Best Practices posture over time</CardDescription>
                </div>
              </div>
              {latestScore && (
                <div className="text-right">
                  <div className="text-2xl font-bold text-primary">{latestScore.score}%</div>
                  <div className="text-xs text-muted-foreground">
                    {latestScore.good} good · {latestScore.warning} warn · {latestScore.error} err
                  </div>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={complianceChart} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={40}
                  />
                  <YAxis
                    domain={[0, 100]}
                    width={30}
                    tick={{ fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="score"
                    stroke="var(--primary)"
                    fill="var(--primary)"
                    fillOpacity={0.15}
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Snapshot list */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Snapshots</CardTitle>
          <CardDescription>
            {snapshots.length === 0
              ? 'No snapshots yet — the first nightly capture runs automatically, or capture one now.'
              : `${snapshots.length} snapshots retained. Select two to compare.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
            {snapshots.map((snap) => {
              const isSelected = selected.includes(snap.id);
              return (
                <div
                  key={snap.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleSelect(snap.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleSelect(snap.id);
                    }
                  }}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                    isSelected
                      ? 'border-primary/60 bg-primary/5'
                      : 'border-border/40 hover:border-primary/30'
                  }`}
                >
                  <GitCompareArrows
                    className={`h-4 w-4 shrink-0 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">
                      #{snap.id} — {new Date(snap.takenAt).toLocaleString()}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {snap.kind}
                      {snap.takenBy ? ` by ${snap.takenBy}` : ''}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 shrink-0"
                    title="Export snapshot JSON"
                    onClick={(e) => {
                      e.stopPropagation();
                      exportSnapshot(snap.id);
                    }}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Diff */}
      {diff && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Changes: #{diff.from.id} ({new Date(diff.from.takenAt).toLocaleString()}) → #
              {diff.to.id} ({new Date(diff.to.takenAt).toLocaleString()})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {diff.sections.every(
              (s) => s.added.length === 0 && s.removed.length === 0 && s.changed.length === 0
            ) ? (
              <p className="text-sm text-emerald-500">
                No configuration changes between these snapshots.
              </p>
            ) : (
              diff.sections
                .filter((s) => s.added.length + s.removed.length + s.changed.length > 0)
                .map((section) => (
                  <div key={section.section} className="rounded-lg border border-border/40 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-medium">{section.label}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {section.unchanged} unchanged
                      </Badge>
                    </div>
                    <div className="space-y-1 text-xs">
                      {section.added.map((name) => (
                        <div key={`a-${name}`} className="flex items-center gap-1.5 text-emerald-500">
                          <Plus className="h-3 w-3" /> {name}
                        </div>
                      ))}
                      {section.removed.map((name) => (
                        <div key={`r-${name}`} className="flex items-center gap-1.5 text-red-500">
                          <Minus className="h-3 w-3" /> {name}
                        </div>
                      ))}
                      {section.changed.map((name) => (
                        <div key={`c-${name}`} className="flex items-center gap-1.5 text-amber-500">
                          <Pencil className="h-3 w-3" /> {name}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
