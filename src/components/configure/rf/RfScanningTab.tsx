/**
 * RF editor · Scanning tab (SmartRf only). OCS monitoring awareness toggle +
 * threshold, then a per-band grid over scanning.bandSettings. freq/extFreq are
 * gated on Custom sensitivity; client count / load% gated on their toggles.
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
import { Checkbox } from '../../ui/checkbox';
import { GridHead, LabelRow, NumCellRaw, type RfTabProps } from './rfControls';
import { RF_BANDS, RF_POWER_SAVE, bandOf, bandPath, getPath } from './rfModel';

const TEMPLATE = '78px repeat(9, 1fr)';
const HEAD = [
  'Band',
  'Duration [ms]',
  'Freq [s]',
  'Ext Freq',
  'Samples',
  'Client Aware',
  'Clients',
  'Power Save',
  'TX Load',
  'Load %',
];

export function RfScanningTab({ cfg, root, custom, errs, update }: RfTabProps) {
  const scan = (getPath(cfg, 'scanning') ?? {}) as Record<string, unknown>;

  return (
    <div className="max-w-[1080px]">
      <LabelRow label="OCS Monitoring Awareness" width={210}>
        <Switch
          checked={!!scan.ocsMonitoringAwareness}
          onCheckedChange={(v) => update(`${root}.scanning.ocsMonitoringAwareness`, v)}
          aria-label="OCS Monitoring Awareness"
        />
      </LabelRow>
      {!!scan.ocsMonitoringAwareness && (
        <LabelRow label="OCS Awareness Threshold" width={210} error={errs.ocsTh}>
          <NumCellRaw
            value={scan.ocsMonitoringAwarenessThreshold}
            onChange={(v) => update(`${root}.scanning.ocsMonitoringAwarenessThreshold`, v)}
            width={140}
          />
        </LabelRow>
      )}

      <div className="mt-2 overflow-hidden rounded-md border border-border">
        <GridHead template={TEMPLATE} cols={HEAD} />
        {RF_BANDS.map(([bandId, label]) => {
          const b = bandOf(cfg, 'scanning', bandId);
          const bk = bandPath(cfg, root, 'scanning', bandId);
          return (
            <div
              key={bandId}
              className="grid items-start gap-2 border-t border-border px-3 py-2.5"
              style={{ gridTemplateColumns: TEMPLATE }}
            >
              <div className="pt-1.5 text-[13px]">{label}</div>
              <NumCellRaw value={b.duration} onChange={(v) => update(`${bk}.duration`, v)} error={errs[`dur${bandId}`]} width={72} />
              <NumCellRaw value={b.freq} disabled={!custom} onChange={(v) => update(`${bk}.freq`, v)} error={errs[`freq${bandId}`]} width={72} />
              <NumCellRaw value={b.extFreq} disabled={!custom} onChange={(v) => update(`${bk}.extFreq`, v)} error={errs[`extFreq${bandId}`]} width={72} />
              <NumCellRaw value={b.sampleCount} onChange={(v) => update(`${bk}.sampleCount`, v)} error={errs[`sc${bandId}`]} width={72} />
              <div className="pt-1.5">
                <Checkbox
                  checked={!!b.clientAware}
                  onCheckedChange={(v) => update(`${bk}.clientAware`, v === true)}
                  aria-label={`${label} client aware`}
                />
              </div>
              <NumCellRaw value={b.clientCount} disabled={!b.clientAware} onChange={(v) => update(`${bk}.clientCount`, v)} error={errs[`cc${bandId}`]} width={72} />
              <Select
                value={String(b.powerSaveAware ?? 'DYNAMIC')}
                onValueChange={(v) => update(`${bk}.powerSaveAware`, v)}
              >
                <SelectTrigger className="h-8" aria-label={`${label} power save`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RF_POWER_SAVE.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="pt-1.5">
                <Checkbox
                  checked={!!b.txLoadAware}
                  onCheckedChange={(v) => update(`${bk}.txLoadAware`, v === true)}
                  aria-label={`${label} TX load aware`}
                />
              </div>
              <NumCellRaw value={b.txLoadAwarePercent} disabled={!b.txLoadAware} onChange={(v) => update(`${bk}.txLoadAwarePercent`, v)} error={errs[`tl${bandId}`]} width={72} />
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11.5px] text-muted-foreground">
        Duration 20-150 ms · Freq 1-120 s · Ext Freq 0-50 · Samples 1-15 · Clients 1-255 · Load
        1-100% · greyed fields require Custom sensitivity
      </p>
    </div>
  );
}
