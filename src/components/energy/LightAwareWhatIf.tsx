import { memo, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { formatKwh, formatCurrency } from '@/lib/energyCalc';
import { projectLightAwareSavings } from '@/lib/lightSensor';

/** Modeled power avoided per state (from the light-aware policy defaults:
 *  dark disables 6 GHz + cuts Tx, dim cuts Tx). Surfaced as visible assumptions. */
const DARK_FACTOR = 0.35;
const DIM_FACTOR = 0.15;

interface LightAwareWhatIfProps {
  /** Sensor-capable APs with their current power draw (watts). */
  aps: { watts: number }[];
  /** Total APs reporting power in range, for the "N / M" context. */
  reportingCount: number;
  ratePerKwh: number;
  currencySymbol: string;
}

interface SliderRowProps {
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
}

function SliderRow({ label, value, max, onChange }: SliderRowProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium text-foreground">
          {value} h<span className="text-muted-foreground">/day</span>
        </span>
      </div>
      <Slider
        aria-label={label}
        value={[value]}
        min={0}
        max={max}
        step={1}
        onValueChange={([v]) => onChange(v)}
      />
    </div>
  );
}

function LightAwareWhatIfComponent({
  aps,
  reportingCount,
  ratePerKwh,
  currencySymbol,
}: LightAwareWhatIfProps) {
  const [darkHours, setDarkHours] = useState(10);
  const [dimHours, setDimHours] = useState(4);

  const savings = useMemo(
    () =>
      projectLightAwareSavings(aps, {
        darkHours,
        dimHours,
        darkFactor: DARK_FACTOR,
        dimFactor: DIM_FACTOR,
        ratePerKwh,
      }),
    [aps, darkHours, dimHours, ratePerKwh]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Sensor-capable APs</span>
        <span className="text-sm font-semibold text-foreground">
          {aps.length} / {reportingCount}
        </span>
      </div>

      <Badge variant="secondary">Modeled · live telemetry pending</Badge>

      <div className="space-y-3">
        <SliderRow
          label="Modeled dark hours/day"
          value={darkHours}
          max={14}
          onChange={setDarkHours}
        />
        <SliderRow label="Modeled dim hours/day" value={dimHours} max={8} onChange={setDimHours} />
      </div>

      <div className="flex items-center justify-between border-t border-border/50 pt-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Projected annual savings</span>
          <Badge variant="info">What-if</Badge>
        </div>
        <div className="text-right">
          <div data-testid="whatif-annual-cost" className="text-sm font-semibold text-foreground">
            {formatCurrency(savings.cost, currencySymbol)}
          </div>
          <div className="text-xs text-muted-foreground">{formatKwh(savings.kwh)}</div>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Projected from modeled ambient-light hours across {aps.length} sensor-capable AP
        {aps.length === 1 ? '' : 's'} (dark −{Math.round(DARK_FACTOR * 100)}%, dim −
        {Math.round(DIM_FACTOR * 100)}% power). Live sensor telemetry will replace these assumptions
        when available.
      </p>
    </div>
  );
}

export const LightAwareWhatIf = memo(LightAwareWhatIfComponent);
