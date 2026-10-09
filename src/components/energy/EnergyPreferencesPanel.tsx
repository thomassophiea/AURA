import { useEffect, useState, type Ref } from 'react';
import { ChevronDown } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/components/ui/utils';
import {
  getEmissionFactors,
  getEnergyPreferences,
  putEnergyPreferences,
  type EgridSubregion,
} from '@/services/energyService';
import type { EnergyPreferences } from '@/types/energy';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];

/** Sentinel for "enter a factor by hand" (e.g. a non-US site using an IEA factor). */
const CUSTOM = 'custom';

/** The eGRID code embedded in a saved region label ("eGRID RFCE — RFC East"). */
function presetFromRegion(region: string | null | undefined): string {
  const match = /^eGRID ([A-Z]+)\b/.exec(region ?? '');
  return match ? match[1] : CUSTOM;
}

interface EnergyPreferencesPanelProps {
  onSaved: (prefs: EnergyPreferences) => void;
  onLoaded?: (prefs: EnergyPreferences) => void;
  emissionsFactorRef?: Ref<HTMLInputElement>;
  /** Collapsed by default — a set-once form should not hold layout space. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EnergyPreferencesPanel({
  onSaved,
  onLoaded,
  emissionsFactorRef,
  open,
  onOpenChange,
}: EnergyPreferencesPanelProps) {
  const [currencyCode, setCurrencyCode] = useState('USD');
  const [rate, setRate] = useState('0.14');
  const [emissionsFactor, setEmissionsFactor] = useState('');
  const [emissionsSource, setEmissionsSource] = useState('');
  const [emissionsRegion, setEmissionsRegion] = useState('');
  const [emissionsYear, setEmissionsYear] = useState('');
  const [subregions, setSubregions] = useState<EgridSubregion[]>([]);
  const [preset, setPreset] = useState<string>(CUSTOM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getEnergyPreferences(controller.signal)
      .then((p) => {
        setCurrencyCode(p.currencyCode);
        setRate(String(p.ratePerKwh));
        setEmissionsFactor(p.emissionsFactorKgPerKwh == null ? '' : String(p.emissionsFactorKgPerKwh));
        setEmissionsSource(p.emissionsFactorSource ?? '');
        setEmissionsRegion(p.emissionsFactorRegion ?? '');
        setEmissionsYear(p.emissionsFactorYear == null ? '' : String(p.emissionsFactorYear));
        setPreset(presetFromRegion(p.emissionsFactorRegion));
        onLoaded?.(p);
      })
      .catch(() => {
        /* defaults stand if prefs cannot be loaded */
      });
    getEmissionFactors(controller.signal)
      .then((catalog) => setSubregions(catalog.subregions))
      .catch(() => {
        /* the picker is optional; manual entry still works */
      });
    return () => controller.abort();
  }, [onLoaded]);

  function choosePreset(code: string) {
    setPreset(code);
    const row = subregions.find((r) => r.code === code);
    if (!row) return;
    // Mirrors what the server will store for this preset, so the form shows it.
    setEmissionsFactor(String(row.kgCo2ePerKwh));
    setEmissionsSource('EPA eGRID2023 (Jan 2025), total output emission rate, CO2e');
    setEmissionsRegion(`eGRID ${row.code} — ${row.name}`);
    setEmissionsYear('2023');
  }

  async function save() {
    const ratePerKwh = Number(rate);
    const emissionsFactorKgPerKwh = emissionsFactor === '' ? null : Number(emissionsFactor);
    const emissionsFactorYear = emissionsYear === '' ? null : Number(emissionsYear);
    if (!Number.isFinite(ratePerKwh) || ratePerKwh <= 0) {
      setError('Enter a positive rate.');
      return;
    }
    if (
      emissionsFactorKgPerKwh !== null &&
      (!Number.isFinite(emissionsFactorKgPerKwh) || emissionsFactorKgPerKwh <= 0)
    ) {
      setError('Enter a positive emissions factor.');
      return;
    }
    if (emissionsFactorKgPerKwh !== null && !emissionsSource.trim()) {
      setError('Enter the emissions factor source.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await putEnergyPreferences({
        currencyCode,
        ratePerKwh,
        emissionsFactorPreset: preset !== CUSTOM ? preset : null,
        emissionsFactorKgPerKwh,
        emissionsFactorSource: emissionsFactorKgPerKwh === null ? null : emissionsSource.trim(),
        emissionsFactorRegion: emissionsFactorKgPerKwh === null ? null : emissionsRegion.trim() || null,
        emissionsFactorYear,
      });
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="gap-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        className={cn(
          'flex w-full items-center justify-between gap-2 px-6 pt-6 text-left',
          open ? 'pb-2' : 'pb-6'
        )}
      >
        <h3 className="text-sm font-semibold text-foreground">Electricity rate</h3>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {currencyCode} · {rate}/kWh
          <ChevronDown
            aria-hidden
            className={cn('h-4 w-4 transition-transform', open && 'rotate-180')}
          />
        </span>
      </button>
      {open ? (
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Currency</span>
            <select
              value={currencyCode}
              onChange={(e) => setCurrencyCode(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1 text-sm"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Rate per kWh</span>
            <input
              type="number"
              step="0.01"
              min="0.001"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              className="w-28 rounded-md border border-border bg-background px-2 py-1 text-sm"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="mb-1 block text-xs text-muted-foreground">
              Grid region — EPA eGRID2023 subregion (total output, CO2e)
            </span>
            <select
              value={preset}
              onChange={(e) => choosePreset(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm"
            >
              <option value={CUSTOM}>Custom / non-US (enter factor below)</option>
              {subregions.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.code} — {r.name} · {r.kgCo2ePerKwh.toFixed(3)} kg/kWh
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-muted-foreground">
              eGRID is assigned by ZIP code, not state. With nothing set, the US average
              (0.352 kg/kWh) is used and labelled as a default.
            </span>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Emissions factor (kg CO2e/kWh)</span>
            <input ref={emissionsFactorRef} type="number" step="0.001" min="0.001" value={emissionsFactor} onChange={(e) => {
                setPreset(CUSTOM);
                setEmissionsFactor(e.target.value);
              }} placeholder="Optional" className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Factor source</span>
            <input type="text" value={emissionsSource} onChange={(e) => setEmissionsSource(e.target.value)} placeholder="Required when factor is set" className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Geographic scope</span>
            <input type="text" value={emissionsRegion} onChange={(e) => setEmissionsRegion(e.target.value)} placeholder="Optional" className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Source year</span>
            <input type="number" min="1900" max="2200" value={emissionsYear} onChange={(e) => setEmissionsYear(e.target.value)} placeholder="Optional" className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm" />
          </label>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="justify-self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          {error ? <p className="text-sm text-destructive sm:col-span-2">{error}</p> : null}
        </CardContent>
      ) : null}
    </Card>
  );
}
