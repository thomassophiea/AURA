/**
 * RF editor · Select Shutdown tab (SmartRf; tab shown only when Smart
 * Monitoring is on). Toggle + 4 thresholds, all editable only under Custom
 * sensitivity (add-edit-smart-rf.html 815-930).
 */
import React from 'react';
import { Switch } from '../../ui/switch';
import { LabelRow, NumCellRaw, type RfTabProps } from './rfControls';
import { getPath } from './rfModel';

export function RfSelectShutdownTab({ cfg, root, custom, errs, update }: RfTabProps) {
  const ir = (getPath(cfg, 'interferenceRecovery') ?? {}) as Record<string, unknown>;
  const W = 280;
  const dis = !custom;

  return (
    <div className="max-w-[700px]">
      <LabelRow label="Select Shutdown" width={W}>
        <Switch
          checked={!!ir.selectShutdown}
          onCheckedChange={(v) => update(`${root}.interferenceRecovery.selectShutdown`, v)}
          aria-label="Select Shutdown"
        />
      </LabelRow>
      {!!ir.selectShutdown && (
        <>
          <LabelRow label="High Threshold [dBm] (-85 to -55)" width={W} error={errs.ssh}>
            <NumCellRaw value={ir.selectShutdownHighTh} disabled={dis} onChange={(v) => update(`${root}.interferenceRecovery.selectShutdownHighTh`, v)} width={120} />
          </LabelRow>
          <LabelRow label="Low Threshold [dBm] (-100 to -55)" width={W} error={errs.ssl}>
            <NumCellRaw value={ir.selectShutdownLowTh} disabled={dis} onChange={(v) => update(`${root}.interferenceRecovery.selectShutdownLowTh`, v)} width={120} />
          </LabelRow>
          <LabelRow label="Frequency [min] (0-3600)" width={W} error={errs.ssf}>
            <NumCellRaw value={ir.selectShutdownFreq} disabled={dis} onChange={(v) => update(`${root}.interferenceRecovery.selectShutdownFreq`, v)} width={120} />
          </LabelRow>
          <LabelRow label="Frequency Limit (1-1000)" width={W} error={errs.ssfl}>
            <NumCellRaw value={ir.selectShutdownFreqLimit} disabled={dis} onChange={(v) => update(`${root}.interferenceRecovery.selectShutdownFreqLimit`, v)} width={120} />
          </LabelRow>
          {dis && (
            <p className="text-[11.5px] text-muted-foreground" style={{ marginLeft: W + 12 }}>
              Thresholds are editable when Sensitivity is Custom.
            </p>
          )}
        </>
      )}
    </div>
  );
}
