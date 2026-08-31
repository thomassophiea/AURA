/**
 * RF editor · Auto Sensor tab (SmartRf, Gateway 10.20; tab shown only when
 * Smart Monitoring is on — the Gateway renders it ng-disabled without it, this
 * strip follows the Select Shutdown hide idiom). Writes
 * smartRf.autoSensor.{algorithm,band,trigger}. Band drops 2.4 GHz whenever
 * interferenceRecovery.selectShutdown is on (existing Band24 falls back to
 * Band5). "Start" is a runtime action performed on the Gateway — present but
 * deliberately inert here; it is not part of the saved policy.
 */
import React from 'react';
import { Button } from '../../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { LabelRow, type RfTabProps } from './rfControls';
import {
  RF_AUTO_SENSOR_ALGORITHMS,
  RF_AUTO_SENSOR_TRIGGERS,
  autoSensorBandOpts,
  autoSensorBandValue,
  getPath,
  type RfOption,
} from './rfModel';

const W = 200;

function OptSelect({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: string;
  options: RfOption[];
  onChange: (v: string) => void;
  ariaLabel: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-[200px]" aria-label={ariaLabel}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function RfAutoSensorTab({ cfg, root, update }: RfTabProps) {
  const as = (getPath(cfg, 'autoSensor') ?? {}) as Record<string, unknown>;
  const shut = !!getPath(cfg, 'interferenceRecovery.selectShutdown');
  const bandVal = autoSensorBandValue(as.band, shut);

  return (
    <div className="max-w-[700px]">
      <LabelRow label="Algorithm" width={W}>
        <OptSelect
          value={String(as.algorithm ?? 'SPARSE')}
          options={RF_AUTO_SENSOR_ALGORITHMS}
          onChange={(v) => update(`${root}.autoSensor.algorithm`, v)}
          ariaLabel="Auto Sensor algorithm"
        />
      </LabelRow>
      <LabelRow label="Band" width={W}>
        <OptSelect
          value={bandVal}
          options={autoSensorBandOpts(shut)}
          onChange={(v) => update(`${root}.autoSensor.band`, v)}
          ariaLabel="Auto Sensor band"
        />
      </LabelRow>
      {shut && (
        <p className="mb-3 text-[11.5px] text-muted-foreground" style={{ marginLeft: W + 12 }}>
          2.4 GHz is unavailable while Select Shutdown is enabled.
        </p>
      )}
      <LabelRow label="Trigger" width={W}>
        <div className="flex items-center gap-2.5">
          <OptSelect
            value={String(as.trigger ?? 'AUTO')}
            options={RF_AUTO_SENSOR_TRIGGERS}
            onChange={(v) => update(`${root}.autoSensor.trigger`, v)}
            ariaLabel="Auto Sensor trigger"
          />
          <Button type="button" variant="outline" size="sm" disabled>
            Start
          </Button>
        </div>
      </LabelRow>
      <p className="text-[11.5px] text-muted-foreground" style={{ marginLeft: W + 12 }}>
        Start runs Auto Sensor on the Gateway — a runtime action, not part of the saved policy.
      </p>
    </div>
  );
}
