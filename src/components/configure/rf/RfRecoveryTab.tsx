/**
 * RF editor · Recovery tab (SmartRf). Two sub-tabs: Neighbor (power hold time,
 * per-band power threshold -85..-55, dynamic-sample pair) and Interference
 * (noise recovery + factor, channel hold time, client threshold, per-band
 * channel-switch delta). Advanced numerics are gated on Custom sensitivity.
 */
import React, { useState } from 'react';
import { Input } from '../../ui/input';
import { Switch } from '../../ui/switch';
import { cn } from '../../ui/utils';
import { LabelRow, NumCellRaw, SubHead, type RfTabProps } from './rfControls';
import { RF_BANDS, bandOf, bandPath, getPath } from './rfModel';

export function RfRecoveryTab({ cfg, root, custom, errs, update }: RfTabProps) {
  const basic = (getPath(cfg, 'basic') ?? {}) as Record<string, unknown>;
  const nr = (getPath(cfg, 'neighbourRecovery') ?? {}) as Record<string, unknown>;
  const ir = (getPath(cfg, 'interferenceRecovery') ?? {}) as Record<string, unknown>;
  const nEnabled = !!basic.neighborRecovery;
  const iEnabled = !!basic.interferenceRecovery;
  const [sub, setSub] = useState<'Neighbor' | 'Interference'>(nEnabled ? 'Neighbor' : 'Interference');
  const cur = sub === 'Neighbor' ? (nEnabled ? 'Neighbor' : 'Interference') : iEnabled ? 'Interference' : 'Neighbor';
  const W = 240;

  const subBtn = (t: 'Neighbor' | 'Interference', en: boolean) => (
    <button
      type="button"
      disabled={!en}
      onClick={() => en && setSub(t)}
      className={cn(
        'border-b-2 px-3.5 py-2 text-xs font-semibold uppercase tracking-wide',
        t === cur ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground',
        !en && 'opacity-40'
      )}
    >
      {t} Recovery
    </button>
  );

  return (
    <div className="max-w-[760px]">
      <div className="mb-4 flex gap-1 border-b border-border">
        {subBtn('Neighbor', nEnabled)}
        {subBtn('Interference', iEnabled)}
      </div>

      {cur === 'Neighbor' ? (
        <>
          <LabelRow label="Power Hold Time [s] (0-3600)" width={W} error={errs.pht}>
            <NumCellRaw value={nr.powerHoldTime} disabled={!custom} onChange={(v) => update(`${root}.neighbourRecovery.powerHoldTime`, v)} width={140} />
          </LabelRow>
          <SubHead>Power Threshold [dBm] (-85 to -55)</SubHead>
          {RF_BANDS.map(([bandId, label]) => (
            <LabelRow key={bandId} label={label} width={W} error={errs[`pth${bandId}`]}>
              <NumCellRaw
                value={bandOf(cfg, 'neighbourRecovery', bandId).powerThreshold}
                disabled={!custom}
                onChange={(v) => update(`${bandPath(cfg, root, 'neighbourRecovery', bandId)}.powerThreshold`, v)}
                width={120}
              />
            </LabelRow>
          ))}
          <LabelRow label="Dynamic Sample" width={W}>
            <Switch
              checked={!!nr.dynamicSample}
              onCheckedChange={(v) => update(`${root}.neighbourRecovery.dynamicSample`, v)}
              aria-label="Dynamic Sample"
            />
          </LabelRow>
          {!!nr.dynamicSample && (
            <>
              <LabelRow label="Sample Retries (1-10)" width={W} error={errs.sr}>
                <NumCellRaw value={nr.sampleRetries} onChange={(v) => update(`${root}.neighbourRecovery.sampleRetries`, v)} width={120} />
              </LabelRow>
              <LabelRow label="Sample Threshold (1-30)" width={W} error={errs.sth}>
                <NumCellRaw value={nr.sampleThreshold} onChange={(v) => update(`${root}.neighbourRecovery.sampleThreshold`, v)} width={120} />
              </LabelRow>
            </>
          )}
        </>
      ) : (
        <>
          <LabelRow label="Noise Recovery" width={W}>
            <Switch
              checked={!!ir.noiseRecovery}
              onCheckedChange={(v) => update(`${root}.interferenceRecovery.noiseRecovery`, v)}
              aria-label="Noise Recovery"
            />
          </LabelRow>
          {!!ir.noiseRecovery && (
            <LabelRow label="Noise Factor (1.00-3.00)" width={W} error={errs.nf}>
              <Input
                value={ir.noiseFactor != null ? String(ir.noiseFactor) : ''}
                onChange={(e) => update(`${root}.interferenceRecovery.noiseFactor`, e.target.value)}
                className="h-8 w-[120px]"
                aria-label="Noise Factor"
              />
            </LabelRow>
          )}
          <LabelRow label="Channel Hold Time [s] (1-86400)" width={W} error={errs.cht}>
            <NumCellRaw value={ir.clientHoldTime} disabled={!custom} onChange={(v) => update(`${root}.interferenceRecovery.clientHoldTime`, v)} width={140} />
          </LabelRow>
          <LabelRow label="Client Threshold (1-255)" width={W} error={errs.cth}>
            <NumCellRaw value={ir.clientThreshold} disabled={!custom} onChange={(v) => update(`${root}.interferenceRecovery.clientThreshold`, v)} width={120} />
          </LabelRow>
          <SubHead>Channel Switch Delta [dBm] (5-35)</SubHead>
          {RF_BANDS.map(([bandId, label]) => (
            <LabelRow key={bandId} label={label} width={W} error={errs[`csd${bandId}`]}>
              <NumCellRaw
                value={bandOf(cfg, 'interferenceRecovery', bandId).chSwitchDelta}
                disabled={!custom}
                onChange={(v) => update(`${bandPath(cfg, root, 'interferenceRecovery', bandId)}.chSwitchDelta`, v)}
                width={120}
              />
            </LabelRow>
          ))}
        </>
      )}
      {!custom && (
        <p className="mt-2 text-[11.5px] text-muted-foreground">
          Threshold fields are editable when Sensitivity is Custom.
        </p>
      )}
    </div>
  );
}
