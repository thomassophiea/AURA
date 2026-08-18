import { useState } from 'react';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatKwh, formatPercent, formatCurrency } from '@/lib/energyCalc';
import { postEnergyScenario } from '@/services/energyService';
import { useGlobalFilters } from '@/hooks/useGlobalFilters';
import type { EnergyScenarioPolicy, EnergyScenarioResult } from '@/types/energy';

const OVERNIGHT_HOURS = [0, 1, 2, 3, 4, 5];

export function EnergyScenarioBuilder() {
  const { site } = useGlobalFilters();
  const [disable6Ghz, setDisable6Ghz] = useState(true);
  const [disableLowUtil, setDisableLowUtil] = useState(false);
  const [reduceTxPower, setReduceTxPower] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EnergyScenarioResult | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    const policy: EnergyScenarioPolicy = {};
    if (disable6Ghz) policy.disable6GhzHours = OVERNIGHT_HOURS;
    if (disableLowUtil) {
      policy.disableLowUtilRadios = true;
      policy.lowUtilThresholdPercent = 5;
    }
    if (reduceTxPower) {
      policy.reduceTxPower = true;
      policy.afterHoursStart = 22;
      policy.afterHoursEnd = 6;
      policy.reducePercent = 20;
    }
    try {
      const res = await postEnergyScenario({
        name: 'Interactive scenario',
        policy,
        siteId: site === 'all' ? undefined : site,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scenario failed');
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">What-if scenario</h3>
          <Badge variant="outline">Modeled estimate</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={disable6Ghz} onChange={(e) => setDisable6Ghz(e.target.checked)} />
            Disable 6 GHz radios overnight (00:00–06:00)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={disableLowUtil} onChange={(e) => setDisableLowUtil(e.target.checked)} />
            Disable radios under 5% utilization
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={reduceTxPower} onChange={(e) => setReduceTxPower(e.target.checked)} />
            Reduce Tx power 20% after hours (22:00–06:00)
          </label>
        </div>

        <button
          type="button"
          onClick={run}
          disabled={running}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {running ? 'Running…' : 'Run scenario'}
        </button>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {result ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">Current</p>
              <p className="text-lg font-semibold">{formatKwh(result.baseline.annualProjected)}/yr</p>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(result.baseline.estimatedAnnualCost, '$')}
              </p>
            </div>
            <div className="rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">Optimized</p>
              <p className="text-lg font-semibold">{formatKwh(result.simulated.annualProjected)}/yr</p>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(result.simulated.estimatedAnnualCost, '$')}
              </p>
            </div>
            <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3">
              <p className="text-xs text-muted-foreground">Savings</p>
              <p className="text-lg font-semibold text-emerald-600">
                {formatPercent(result.savings.percent)}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(result.savings.annualCost, '$')}/yr
              </p>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
