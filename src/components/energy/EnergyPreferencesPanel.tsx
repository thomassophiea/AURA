import { useEffect, useState, type Ref } from 'react';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { getEnergyPreferences, putEnergyPreferences } from '@/services/energyService';
import type { EnergyPreferences } from '@/types/energy';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];

interface EnergyPreferencesPanelProps {
  onSaved: (prefs: EnergyPreferences) => void;
  onLoaded?: (prefs: EnergyPreferences) => void;
  emissionsFactorRef?: Ref<HTMLInputElement>;
}

export function EnergyPreferencesPanel({
  onSaved,
  onLoaded,
  emissionsFactorRef,
}: EnergyPreferencesPanelProps) {
  const [currencyCode, setCurrencyCode] = useState('USD');
  const [rate, setRate] = useState('0.14');
  const [emissionsFactor, setEmissionsFactor] = useState('');
  const [emissionsSource, setEmissionsSource] = useState('');
  const [emissionsRegion, setEmissionsRegion] = useState('');
  const [emissionsYear, setEmissionsYear] = useState('');
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
        onLoaded?.(p);
      })
      .catch(() => {
        /* defaults stand if prefs cannot be loaded */
      });
    return () => controller.abort();
  }, [onLoaded]);

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
    <Card>
      <CardHeader className="pb-2">
        <h3 className="text-sm font-semibold text-foreground">Electricity rate</h3>
      </CardHeader>
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
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">Emissions factor (kg CO2e/kWh)</span>
          <input ref={emissionsFactorRef} type="number" step="0.001" min="0.001" value={emissionsFactor} onChange={(e) => setEmissionsFactor(e.target.value)} placeholder="Optional" className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm" />
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
    </Card>
  );
}
