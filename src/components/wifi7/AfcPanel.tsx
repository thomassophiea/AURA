/**
 * AFC (Automated Frequency Coordination) tab. Reflects real per-radio 6 GHz
 * power-coordination state and writes changes back with read-back verification.
 * AFC state is per-radio on /v1/aps/{serial} (there is no /v1/afc/plans on OS ONE).
 */
import React, { useCallback, useMemo, useState } from 'react';
import { MapPin, RadioTower, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '../ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import type { PowerMode6, Wifi7Ap, Wifi7Radio, Wifi7WriteResult } from '../../types/wifi7';
import { POWER_MODE6, POWER_MODE6_VALUES } from '../../types/wifi7';
import { updateApGeo, updateRadioAfc } from '../../services/wifi7Service';
import { AfcPowerBar, EirpChart, PowerModeBadge } from './wifi7Viz';

interface EditTarget {
  ap: Wifi7Ap;
  radio: Wifi7Radio;
}

export function AfcPanel({ aps, onRefresh }: { aps: Wifi7Ap[]; onRefresh: () => void }) {
  const [edit, setEdit] = useState<EditTarget | null>(null);

  const sixGhzRadios = useMemo(
    () =>
      aps
        .flatMap((ap) => ap.radios.filter((r) => r.band === '6GHz').map((r) => ({ ...r, apName: ap.apName })))
        .sort((a, b) => b.powerCapDb - a.powerCapDb),
    [aps]
  );
  const apsWith6 = useMemo(() => aps.filter((ap) => ap.radios.some((r) => r.band === '6GHz')), [aps]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">6 GHz EIRP &amp; AFC power cap</CardTitle>
          <CardDescription>
            Filled = actual tx power; amber = power surrendered to the AFC/SmartRF cap. Indigo bars
            are Standard-Power radios.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EirpChart radios={sixGhzRadios} />
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        {apsWith6.map((ap) => {
          const r = ap.radios.find((x) => x.band === '6GHz')!;
          return (
            <Card key={ap.serialNumber}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <RadioTower className="h-4 w-4 text-indigo-500" />
                      {ap.apName}
                    </CardTitle>
                    <CardDescription>
                      {ap.model} · 6 GHz {r.mode || '—'} · ch {r.opChannel || '—'}
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setEdit({ ap, radio: r })}>
                    Configure
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <PowerModeBadge mode={r.pwrMode6} />
                  {r.afc ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-xs font-medium text-amber-600 ring-1 ring-inset ring-amber-500/30 dark:text-amber-400">
                      <ShieldCheck className="h-3 w-3" /> AFC enabled
                    </span>
                  ) : (
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      AFC off
                    </span>
                  )}
                  {r.pwrMode6Ovr && (
                    <span className="rounded bg-blue-500/10 px-1 text-xs text-blue-600 dark:text-blue-400">
                      override
                    </span>
                  )}
                </div>
                <AfcPowerBar radio={r} />
                {r.standardPower && !ap.geo && (
                  <p className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                    <MapPin className="h-3 w-3" /> Standard Power set but no geolocation — AFC needs
                    AP coordinates.
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {apsWith6.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No 6 GHz radios present on this controller.
        </p>
      )}

      {edit && (
        <AfcEditorSheet
          target={edit}
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

function AfcEditorSheet({
  target,
  onClose,
  onSaved,
}: {
  target: EditTarget;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { ap, radio } = target;
  const [afc, setAfc] = useState(radio.afc);
  const [pwrMode6, setPwrMode6] = useState<PowerMode6>((radio.pwrMode6 as PowerMode6) ?? 'LPI');
  const [lat, setLat] = useState(ap.geo?.latitude?.toString() ?? '');
  const [lon, setLon] = useState(ap.geo?.longitude?.toString() ?? '');
  const [alt, setAlt] = useState(ap.geo?.altitude?.toString() ?? '');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<Wifi7WriteResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const standardPower = POWER_MODE6[pwrMode6]?.standardPower === true;

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    setResult(null);
    try {
      const geoDirty = lat !== '' && lon !== '';
      if (geoDirty) {
        await updateApGeo(ap.serialNumber, {
          latitude: Number(lat),
          longitude: Number(lon),
          altitude: Number(alt || 0),
        });
      }
      const res = await updateRadioAfc(ap.serialNumber, radio.radioIndex, { afc, pwrMode6 });
      setResult(res);
      if (res.ok) setTimeout(onSaved, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Write failed');
    } finally {
      setSaving(false);
    }
  }, [afc, pwrMode6, lat, lon, alt, ap.serialNumber, radio.radioIndex, onSaved]);

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>AFC · {ap.apName} · 6 GHz</SheetTitle>
          <SheetDescription>
            Writes to the controller and re-reads to confirm the change persisted.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 py-2">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="afc-switch">AFC coordination</Label>
              <p className="text-xs text-muted-foreground">Query the AFC system for allowed power.</p>
            </div>
            <Switch id="afc-switch" checked={afc} onCheckedChange={setAfc} />
          </div>

          <div className="space-y-1.5">
            <Label>6 GHz power mode</Label>
            <Select value={pwrMode6} onValueChange={(v) => setPwrMode6(v as PowerMode6)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POWER_MODE6_VALUES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {POWER_MODE6[m].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {standardPower && (
            <div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
              <p className="flex items-center gap-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                <MapPin className="h-3 w-3" /> Standard Power requires AP geolocation for AFC.
              </p>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">Latitude</Label>
                  <Input value={lat} onChange={(e) => setLat(e.target.value)} placeholder="0.0000" />
                </div>
                <div>
                  <Label className="text-xs">Longitude</Label>
                  <Input value={lon} onChange={(e) => setLon(e.target.value)} placeholder="0.0000" />
                </div>
                <div>
                  <Label className="text-xs">Height (m)</Label>
                  <Input value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="0" />
                </div>
              </div>
            </div>
          )}

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

export default AfcPanel;
