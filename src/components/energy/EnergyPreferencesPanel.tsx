import { useEffect, useState } from 'react';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { getEnergyPreferences, putEnergyPreferences } from '@/services/energyService';
import type { EnergyPreferences } from '@/types/energy';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];

interface EnergyPreferencesPanelProps {
  onSaved: (prefs: EnergyPreferences) => void;
}

export function EnergyPreferencesPanel({ onSaved }: EnergyPreferencesPanelProps) {
  const [currencyCode, setCurrencyCode] = useState('USD');
  const [rate, setRate] = useState('0.14');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getEnergyPreferences(controller.signal)
      .then((p) => {
        setCurrencyCode(p.currencyCode);
        setRate(String(p.ratePerKwh));
      })
      .catch(() => {
        /* defaults stand if prefs cannot be loaded */
      });
    return () => controller.abort();
  }, []);

  async function save() {
    const ratePerKwh = Number(rate);
    if (!Number.isFinite(ratePerKwh) || ratePerKwh <= 0) {
      setError('Enter a positive rate.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await putEnergyPreferences({ currencyCode, ratePerKwh });
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
      <CardContent className="flex flex-wrap items-end gap-3">
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
            min="0"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            className="w-28 rounded-md border border-border bg-background px-2 py-1 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {error ? <p className="w-full text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
