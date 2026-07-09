/**
 * RF editor · Basic tab. Smart Monitoring (SmartRf) gates the sensitivity /
 * interference / neighbor rows; ACS shows only interference + neighbor (no
 * sensitivity, no coverage hole). Mirrors add-edit-smart-rf.html / acs.html.
 */
import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { Switch } from '../../ui/switch';
import { LabelRow, type RfTabProps } from './rfControls';
import { RF_SENSITIVITY, getPath } from './rfModel';

export function RfBasicTab({ cfg, root, isAcs, update }: RfTabProps) {
  const basic = (getPath(cfg, 'basic') ?? {}) as Record<string, unknown>;
  const smartMon = !isAcs && !!getPath(cfg, 'scanning.smartMonitoring');
  const showCore = isAcs || smartMon;

  return (
    <div className="max-w-[640px] space-y-1">
      {!isAcs && (
        <LabelRow label="Smart Monitoring">
          <Switch
            checked={!!getPath(cfg, 'scanning.smartMonitoring')}
            onCheckedChange={(v) => update(`${root}.scanning.smartMonitoring`, v)}
            aria-label="Smart Monitoring"
          />
        </LabelRow>
      )}

      {showCore && (
        <>
          {!isAcs && (
            <LabelRow label="Sensitivity">
              <Select
                value={String(basic.sensitivity ?? 'MEDIUM')}
                onValueChange={(v) => update(`${root}.basic.sensitivity`, v)}
              >
                <SelectTrigger className="w-[200px]" aria-label="Sensitivity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RF_SENSITIVITY.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </LabelRow>
          )}
          <LabelRow label="Interference Recovery">
            <Switch
              checked={!!basic.interferenceRecovery}
              onCheckedChange={(v) => update(`${root}.basic.interferenceRecovery`, v)}
              aria-label="Interference Recovery"
            />
          </LabelRow>
          <LabelRow label="Neighbor Recovery">
            <Switch
              checked={!!basic.neighborRecovery}
              onCheckedChange={(v) => update(`${root}.basic.neighborRecovery`, v)}
              aria-label="Neighbor Recovery"
            />
          </LabelRow>
        </>
      )}

      {!isAcs && (
        <LabelRow label="Coverage Hole Recovery">
          <Switch
            checked={!!basic.coverageHoleRecovery}
            onCheckedChange={(v) => update(`${root}.basic.coverageHoleRecovery`, v)}
            aria-label="Coverage Hole Recovery"
          />
        </LabelRow>
      )}
    </div>
  );
}
