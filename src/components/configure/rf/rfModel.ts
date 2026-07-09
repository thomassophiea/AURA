/**
 * RF Management editor model (EPB-125 · rfmgmt-parity.md). Band/plan/width
 * option lists (controller ExolEnums / APTypes), immutable-path helpers, the
 * create scaffold cloned from the /default record, and the full controller
 * validation set (ranges + required + name uniqueness). Field truth:
 * api/defaults/rfmgmt.json + controller-spec-v2 "Smart RF (add/edit)".
 */
import type { RfMgmtPolicy } from '../../../types/configure';

export interface RfOption {
  id: string;
  label: string;
}

/** Editor band order (2.4 / 5 / 6); band lookups are ALWAYS by bandId (gap 4). */
export const RF_BANDS: ReadonlyArray<readonly [string, string]> = [
  ['Band24', '2.4 GHz'],
  ['Band5', '5 GHz'],
  ['Band6', '6 GHz'],
];

/** Per-band channel plans (ChannelPlansRadio24/5/6). */
export const RF_PLANS_BY_BAND: Record<string, RfOption[]> = {
  Band24: [
    { id: 'ChannelPlan3', label: '3-Channel Plan' },
    { id: 'ChannelPlan4', label: '4-Channel Plan' },
    { id: 'ChannelPlanAuto', label: 'Auto' },
    { id: 'ChannelPlanCustom', label: 'Custom' },
  ],
  Band5: [
    { id: 'ChannelPlanAll', label: 'All Channels' },
    { id: 'ChannelPlanAllWithWeather', label: 'Extended Channel with Weather' },
    { id: 'ChannelPlanAllNonDFS', label: 'All Non-DFS Channels' },
    { id: 'ChannelPlanCustom', label: 'Custom' },
  ],
  Band6: [
    { id: 'ChannelPlanAll', label: 'All Channels' },
    { id: 'ChannelPlanPSC', label: 'PSC Channel' },
    { id: 'ChannelPlanCustom', label: 'Custom' },
  ],
};

/** Per-band channel widths (APTypes.channelWidthsSmartRF / channelWidthsAcs; 320 MHz is 6-GHz/EHT-only, gap 17). */
export const RF_WIDTHS_BY_TYPE: Record<string, Record<string, RfOption[]>> = {
  SmartRf: {
    Band24: [{ id: 'Ch1Width_20MHz', label: '20 MHz' }],
    Band5: [20, 40, 80, 160].map((n) => ({ id: `Ch1Width_${n}MHz`, label: `${n} MHz` })),
    Band6: [20, 40, 80, 160, 320].map((n) => ({ id: `Ch1Width_${n}MHz`, label: `${n} MHz` })),
  },
  Acs: {
    Band24: [{ id: 'Ch1Width_20MHz', label: '20 MHz' }],
    Band5: [
      { id: 'Ch1Width_20MHz', label: '20 MHz' },
      { id: 'Ch1Width_Auto', label: 'Auto' },
    ],
    Band6: [
      { id: 'Ch1Width_20MHz', label: '20 MHz' },
      { id: 'Ch1Width_Auto', label: 'Auto' },
    ],
  },
};

/** Custom-plan channel picker: weather + DFS EXCLUDED, stored by centre FREQUENCY (gap 14). */
export const RF_CUSTOM_CH: Record<string, ReadonlyArray<{ ch: number; freq: number }>> = {
  Band24: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((ch) => ({ ch, freq: 2407 + 5 * ch })),
  Band5: [36, 40, 44, 48, 149, 153, 157, 161, 165].map((ch) => ({ ch, freq: 5000 + 5 * ch })),
  Band6: Array.from({ length: 59 }, (_, i) => 1 + 4 * i).map((ch) => ({ ch, freq: 5950 + 5 * ch })),
};

/** Plan-contents tooltip text (ChannelsByPlan, gap 18). */
export const RF_PLAN_CHANNELS: Record<string, string> = {
  ChannelPlan3: '1, 6, 11',
  ChannelPlan4: '1, 5, 9, 13',
  ChannelPlanAuto: 'Automatic selection',
  ChannelPlanAll: 'All regulatory channels (incl. DFS)',
  ChannelPlanAllWithWeather: 'All channels incl. weather radar (120-128)',
  ChannelPlanAllNonDFS: '36-48, 149-165',
  ChannelPlanPSC: 'PSC: 5, 21, 37, 53, ..., 229',
  ChannelPlanCustom: 'Custom selection',
};

export const RF_SENSITIVITY: RfOption[] = [
  { id: 'LOW', label: 'Low' },
  { id: 'MEDIUM', label: 'Medium' },
  { id: 'HIGH', label: 'High' },
  { id: 'CUSTOM', label: 'Custom' },
];

export const RF_POWER_SAVE: RfOption[] = [
  { id: 'DYNAMIC', label: 'Dynamic' },
  { id: 'ENABLED', label: 'Enabled' },
  { id: 'DISABLED', label: 'Disabled' },
];

export const RF_TABS_SMART = [
  'Basic',
  'Power & Channel',
  'Scanning',
  'Recovery',
  'Select Shutdown',
] as const;
export const RF_TABS_ACS = ['Basic', 'Power & Channel', 'Interference Recovery'] as const;

// --- immutable nested-path helpers (dot path, numeric segments index arrays) ---
type Dict = Record<string, unknown>;

export function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((cur, key) => {
    if (cur && typeof cur === 'object') return (cur as Dict)[key];
    return undefined;
  }, obj);
}

export function setPath<T>(obj: T, path: string, value: unknown): T {
  const next = structuredClone(obj);
  const keys = path.split('.');
  let cur = next as unknown as Dict;
  for (let i = 0; i < keys.length - 1; i += 1) {
    cur = cur[keys[i]] as Dict;
  }
  cur[keys[keys.length - 1]] = value;
  return next;
}

interface BandSetting {
  bandId: string;
  [key: string]: unknown;
}

function bandSettings(cfg: unknown, section: string): BandSetting[] {
  const s = getPath(cfg, `${section}.bandSettings`);
  return Array.isArray(s) ? (s as BandSetting[]) : [];
}

/** The band-setting record for a section, keyed by bandId (never positional). */
export function bandOf(cfg: unknown, section: string, bandId: string): BandSetting {
  return bandSettings(cfg, section).find((b) => b.bandId === bandId) ?? { bandId };
}

/** Dot-path to a band's setting object within `root` (smartRf|acs). */
export function bandPath(cfg: unknown, root: string, section: string, bandId: string): string {
  const arr = bandSettings(cfg, section);
  const i = arr.findIndex((b) => b.bandId === bandId);
  return `${root}.${section}.bandSettings.${i < 0 ? arr.length : i}`;
}

function num(v: unknown): number {
  return typeof v === 'number' ? v : Number(v);
}

export function inRange(v: unknown, lo: number, hi: number): boolean {
  if (v === '' || v == null) return false;
  const n = num(v);
  return Number.isFinite(n) && n >= lo && n <= hi;
}

/** Build the create scaffold from the controller /default record (gaps 10/11). */
export function seedFromDefault(def: RfMgmtPolicy, type: 'SmartRf' | 'Acs'): RfMgmtPolicy {
  const seed = structuredClone(def);
  seed.name = '';
  seed.type = type;
  seed.canDelete = true;
  seed.canEdit = true;
  return seed;
}

/** Null out the branch not chosen so a saved record carries exactly one (gap 12). */
export function toRfPayload(form: RfMgmtPolicy): RfMgmtPolicy {
  const out = structuredClone(form);
  if (out.type === 'Acs') out.smartRf = null;
  else out.acs = null;
  return out;
}

export interface RfValidationCtx {
  existingNames: Array<{ id: string; name: string }>;
}

/** Full controller validation set (gap 13); returns a field->message map. */
export function validateRf(
  form: RfMgmtPolicy,
  ctx: RfValidationCtx
): Record<string, string> {
  const errs: Record<string, string> = {};
  const name = String(form.name ?? '').trim();
  if (!name) errs.name = 'Name is required';
  else if (name.length > 64) errs.name = 'Maximum 64 characters';
  else if (ctx.existingNames.some((r) => r.name === form.name && r.id !== form.id))
    errs.name = 'A policy with this name already exists';

  const isAcs = form.type === 'Acs';
  const cfg = isAcs ? form.acs : form.smartRf;
  if (!cfg) return errs;
  const basic = (getPath(cfg, 'basic') ?? {}) as Dict;
  const scan = (getPath(cfg, 'scanning') ?? {}) as Dict;
  const ir = (getPath(cfg, 'interferenceRecovery') ?? {}) as Dict;
  const nr = (getPath(cfg, 'neighbourRecovery') ?? {}) as Dict;
  const custom = !isAcs && basic.sensitivity === 'CUSTOM';

  RF_BANDS.forEach(([bandId]) => {
    if (isAcs && bandId === 'Band6') return;
    const b = bandOf(cfg, 'powerAndChannel', bandId);
    if (!inRange(b.txMinPower, 1, 20)) errs[`txMin${bandId}`] = 'Valid range 1 to 20';
    if (!inRange(b.txMaxPower, 1, 20)) errs[`txMax${bandId}`] = 'Valid range 1 to 20';
    if (
      b.txMinPower != null &&
      b.txMaxPower != null &&
      num(b.txMinPower) > num(b.txMaxPower)
    )
      errs[`power${bandId}`] = 'Max Power is below Min Power';
  });

  if (!isAcs) {
    if (scan.ocsMonitoringAwareness && !inRange(scan.ocsMonitoringAwarenessThreshold, 10, 10000))
      errs.ocsTh = 'Valid range 10 to 10000';
    RF_BANDS.forEach(([bandId]) => {
      const b = bandOf(cfg, 'scanning', bandId);
      if (!inRange(b.duration, 20, 150)) errs[`dur${bandId}`] = 'Valid range 20 to 150';
      if (custom && !inRange(b.freq, 1, 120)) errs[`freq${bandId}`] = 'Valid range 1 to 120';
      if (custom && !inRange(b.extFreq, 0, 50)) errs[`extFreq${bandId}`] = 'Valid range 0 to 50';
      if (!inRange(b.sampleCount, 1, 15)) errs[`sc${bandId}`] = 'Valid range 1 to 15';
      if (b.clientAware && !inRange(b.clientCount, 1, 255)) errs[`cc${bandId}`] = 'Valid range 1 to 255';
      if (b.txLoadAware && !inRange(b.txLoadAwarePercent, 1, 100))
        errs[`tl${bandId}`] = 'Valid range 1 to 100';
      if (custom && !inRange(bandOf(cfg, 'neighbourRecovery', bandId).powerThreshold, -85, -55))
        errs[`pth${bandId}`] = 'Valid range -85 to -55';
      if (custom && !inRange(bandOf(cfg, 'interferenceRecovery', bandId).chSwitchDelta, 5, 35))
        errs[`csd${bandId}`] = 'Valid range 5 to 35';
    });
    if (custom && !inRange(nr.powerHoldTime, 0, 3600)) errs.pht = 'Valid range 0 to 3600';
    if (nr.dynamicSample) {
      if (!inRange(nr.sampleRetries, 1, 10)) errs.sr = 'Valid range 1 to 10';
      if (!inRange(nr.sampleThreshold, 1, 30)) errs.sth = 'Valid range 1 to 30';
    }
    if (ir.noiseRecovery) {
      const nf = num(ir.noiseFactor);
      if (!/^\d+(\.\d{1,2})?$/.test(String(ir.noiseFactor)) || !(nf >= 1 && nf <= 3))
        errs.nf = 'Valid range 1.00 to 3.00';
    }
    if (custom && !inRange(ir.clientHoldTime, 1, 86400)) errs.cht = 'Valid range 1 to 86400';
    if (custom && !inRange(ir.clientThreshold, 1, 255)) errs.cth = 'Valid range 1 to 255';
    if (ir.selectShutdown && custom) {
      if (!inRange(ir.selectShutdownHighTh, -85, -55)) errs.ssh = 'Valid range -85 to -55';
      if (!inRange(ir.selectShutdownLowTh, -100, -55)) errs.ssl = 'Valid range -100 to -55';
      if (!inRange(ir.selectShutdownFreq, 0, 3600)) errs.ssf = 'Valid range 0 to 3600';
      if (!inRange(ir.selectShutdownFreqLimit, 1, 1000)) errs.ssfl = 'Valid range 1 to 1000';
    }
  } else {
    ['Band24', 'Band5'].forEach((bandId) => {
      const b = bandOf(cfg, 'interferenceRecovery', bandId);
      if (!inRange(b.channelOccupancyThreshold, 10, 100)) errs[`occ${bandId}`] = 'Valid range 10 to 100';
      if (!inRange(b.noiseThreshold, -95, -50)) errs[`noi${bandId}`] = 'Valid range -95 to -50';
      if (!inRange(b.updatePeriod, 0, 15)) errs[`upd${bandId}`] = 'Valid range 0 to 15';
    });
    if (!inRange(bandOf(cfg, 'interferenceRecovery', 'Band24').waitTime, 10, 120))
      errs.wait = 'Valid range 10 to 120';
  }
  return errs;
}
