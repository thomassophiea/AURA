/**
 * MLO (Multi-Link Operation) tab. Shows real 802.11be link capability per AP
 * (which bands are EHT-capable and can participate in an MLO link), the current
 * MLO service grouping (mloServiceIDs), and client 11be readiness. Writes the
 * grouping back with read-back verification.
 *
 * The controller API does not expose runtime per-link MLO telemetry (no MLD MAC
 * / affiliated-link RSSI), so this surface is capability + config oriented and
 * says so explicitly rather than fabricating link metrics.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Info, Link2, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '../ui/sheet';
import type { Wifi7Ap, Wifi7ServiceRef, Wifi7WriteResult } from '../../types/wifi7';
import { updateApMlo } from '../../services/wifi7Service';
import { BandBadge, ClientProtocolBars, EhtRadioMatrix } from './wifi7Viz';
import type { ClientProtocolStat } from '../../types/wifi7';

/** Compact SVG: AP/MLD node linked to each EHT-capable band radio. */
function MloLinkTopology({ ap }: { ap: Wifi7Ap }) {
  const ehtRadios = ap.radios.filter((r) => r.eht);
  const grouped = ap.mloServiceIDs.length > 0;
  const w = 260;
  const h = 120;
  const cx = 46;
  const cy = h / 2;
  const rightX = w - 90;
  const step = ehtRadios.length > 1 ? (h - 36) / (ehtRadios.length - 1) : 0;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label={`MLO link topology for ${ap.apName}`}>
      {ehtRadios.map((r, i) => {
        const y = ehtRadios.length > 1 ? 18 + i * step : cy;
        const stroke =
          r.band === '6GHz' ? '#6366f1' : r.band === '5GHz' ? '#0ea5e9' : '#f59e0b';
        return (
          <g key={r.radioIndex}>
            <line
              x1={cx}
              y1={cy}
              x2={rightX}
              y2={y}
              stroke={stroke}
              strokeWidth={grouped ? 2.5 : 1.2}
              strokeDasharray={grouped ? undefined : '4 3'}
              opacity={grouped ? 0.9 : 0.5}
            />
            <circle cx={rightX} cy={y} r={6} fill={stroke} />
            <text x={rightX + 12} y={y + 4} className="fill-current text-[10px] text-muted-foreground">
              {r.band}
            </text>
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={16} className="fill-background" stroke="#6366f1" strokeWidth={2} />
      <text x={cx} y={cy + 4} textAnchor="middle" className="fill-current text-[10px] font-semibold">
        MLD
      </text>
    </svg>
  );
}

export function MloPanel({
  aps,
  services,
  clientProtocols,
  onRefresh,
}: {
  aps: Wifi7Ap[];
  services: Wifi7ServiceRef[];
  clientProtocols: ClientProtocolStat[];
  onRefresh: () => void;
}) {
  const [edit, setEdit] = useState<Wifi7Ap | null>(null);
  const ehtAps = useMemo(() => aps.filter((a) => a.ehtCapable), [aps]);
  const serviceName = useCallback(
    (id: string) => services.find((s) => s.id === id)?.name ?? id.slice(0, 8),
    [services]
  );

  return (
    <div className="space-y-4">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>MLO is shown as link capability and configuration</AlertTitle>
        <AlertDescription>
          The controller reports which radios are 802.11be (EHT) capable and which services are
          grouped for Multi-Link Operation. Per-link runtime metrics (MLD affiliated-link RSSI /
          throughput) are not exposed by this controller API.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">802.11be capability matrix</CardTitle>
            <CardDescription>EHT-capable radios per AP and band (live from the controller).</CardDescription>
          </CardHeader>
          <CardContent>
            <EhtRadioMatrix aps={aps} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Client Wi-Fi 7 readiness</CardTitle>
            <CardDescription>Associated client protocols (indigo = 802.11be).</CardDescription>
          </CardHeader>
          <CardContent>
            <ClientProtocolBars stats={clientProtocols} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {ehtAps.map((ap) => (
          <Card key={ap.serialNumber}>
            <CardHeader className="pb-1">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{ap.apName}</CardTitle>
                  <CardDescription>{ap.model}</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => setEdit(ap)}>
                  <Link2 className="mr-1 h-3.5 w-3.5" /> Group
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <MloLinkTopology ap={ap} />
              <div className="mt-2">
                {ap.mloServiceIDs.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {ap.mloServiceIDs.map((id) => (
                      <span
                        key={id}
                        className="rounded bg-indigo-500/10 px-1.5 py-0.5 text-xs text-indigo-600 ring-1 ring-inset ring-indigo-500/30 dark:text-indigo-400"
                      >
                        {serviceName(id)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No services grouped for MLO — dashed links show available EHT bands.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {ehtAps.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No 802.11be (Wi-Fi 7) capable APs on this controller.
        </p>
      )}

      {edit && (
        <MloEditorSheet
          ap={edit}
          services={services}
          onClose={() => setEdit(null)}
          onSaved={() => {
            setEdit(null);
            onRefresh();
          }}
        />
      )}
    </div>
  );
}

function MloEditorSheet({
  ap,
  services,
  onClose,
  onSaved,
}: {
  ap: Wifi7Ap;
  services: Wifi7ServiceRef[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(ap.mloServiceIDs));
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<Wifi7WriteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ehtBands = ap.radios.filter((r) => r.eht).map((r) => r.band);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    setResult(null);
    try {
      const res = await updateApMlo(ap.serialNumber, [...selected]);
      setResult(res);
      if (res.ok) setTimeout(onSaved, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Write failed');
    } finally {
      setSaving(false);
    }
  }, [ap.serialNumber, selected, onSaved]);

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>MLO grouping · {ap.apName}</SheetTitle>
          <SheetDescription>
            Select services to bind across this AP&apos;s EHT links. Applied via a verified write.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 py-2">
          <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            EHT links available:
            {ehtBands.map((b) => (
              <BandBadge key={b} band={b} eht />
            ))}
          </div>

          <div className="space-y-2">
            {services.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-md border p-2">
                <Label htmlFor={`mlo-${s.id}`} className="cursor-pointer text-sm">
                  {s.name}
                </Label>
                <Switch
                  id={`mlo-${s.id}`}
                  checked={selected.has(s.id)}
                  onCheckedChange={() => toggle(s.id)}
                />
              </div>
            ))}
            {services.length === 0 && (
              <p className="text-sm text-muted-foreground">No services available to group.</p>
            )}
          </div>

          {result && (
            <Alert variant={result.ok ? 'default' : 'destructive'}>
              {result.ok ? <ShieldCheck className="h-4 w-4" /> : <TriangleAlert className="h-4 w-4" />}
              <AlertTitle>{result.ok ? 'Verified on controller' : 'Not persisted'}</AlertTitle>
              <AlertDescription>{result.detail}</AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive">
              <TriangleAlert className="h-4 w-4" />
              <AlertTitle>Write failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Close
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? 'Writing…' : 'Apply & verify'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export default MloPanel;
