/**
 * RF editor · ACS Interference Recovery tab. Occupancy / noise / update-period
 * are per-band columns (2.4 + 5 GHz); wait time + the 5 interferer-detect
 * toggles are 2.4 GHz ONLY, bound by bandId (never positional index) per
 * add-edit-acs.html (gaps 4/5).
 */
import React from 'react';
import { Checkbox } from '../../ui/checkbox';
import { LabelRow, NumCellRaw, SubHead, type RfTabProps } from './rfControls';
import { bandOf, bandPath } from './rfModel';

const COLS: ReadonlyArray<readonly [string, string]> = [
  ['Band24', '2.4 GHz'],
  ['Band5', '5 GHz'],
];
const ROWS: ReadonlyArray<readonly [string, string, string]> = [
  ['channelOccupancyThreshold', 'Channel Occupancy Threshold [%] (10-100)', 'occ'],
  ['noiseThreshold', 'Noise Threshold [dBm] (-95 to -50)', 'noi'],
  ['updatePeriod', 'Update Period [min] (0-15)', 'upd'],
];
const DETECTS: ReadonlyArray<readonly [string, string]> = [
  ['detectBluetooth', 'Detect Bluetooth'],
  ['detectMicrowave', 'Detect Microwave'],
  ['detectCordlessPhone', 'Detect Cordless Phone'],
  ['detectConstantWave', 'Detect Constant Wave'],
  ['detectVideoBridge', 'Detect Video Bridge'],
];

export function RfAcsInterferenceTab({ cfg, root, errs, update }: RfTabProps) {
  const b24 = bandOf(cfg, 'interferenceRecovery', 'Band24');
  const bk24 = bandPath(cfg, root, 'interferenceRecovery', 'Band24');

  return (
    <div className="max-w-[760px]">
      <div
        className="grid items-start gap-x-4 gap-y-2.5"
        style={{ gridTemplateColumns: '320px repeat(2, 1fr)' }}
      >
        <div />
        {COLS.map(([, label]) => (
          <div key={label} className="text-center text-[12.5px] font-semibold">
            {label}
          </div>
        ))}
        {ROWS.map(([key, label, ek]) => (
          <React.Fragment key={key}>
            <div className="pt-2 text-right text-[13.5px] text-muted-foreground">{label}</div>
            {COLS.map(([bandId]) => (
              <div key={bandId} className="flex justify-center">
                <NumCellRaw
                  value={bandOf(cfg, 'interferenceRecovery', bandId)[key]}
                  onChange={(v) => update(`${bandPath(cfg, root, 'interferenceRecovery', bandId)}.${key}`, v)}
                  error={errs[`${ek}${bandId}`]}
                  width={110}
                />
              </div>
            ))}
          </React.Fragment>
        ))}
      </div>

      <SubHead>2.4 GHz Only</SubHead>
      <LabelRow label="Wait Time [s] (10-120)" width={300} error={errs.wait}>
        <NumCellRaw value={b24.waitTime} onChange={(v) => update(`${bk24}.waitTime`, v)} width={120} />
      </LabelRow>
      {DETECTS.map(([key, label]) => (
        <LabelRow key={key} label={label} width={300}>
          <Checkbox
            checked={!!b24[key]}
            onCheckedChange={(v) => update(`${bk24}.${key}`, v === true)}
            aria-label={label}
          />
        </LabelRow>
      ))}
    </div>
  );
}
