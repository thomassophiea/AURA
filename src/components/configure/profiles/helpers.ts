/**
 * Pure helpers for the Device Profiles editor: range checks, deep-path set,
 * typed array accessors over the wire `unknown[]` fields, derived grid values
 * and profile-form validation.
 */
import type { ApProfile, ProfileRadio, ProfileWiredPort } from '../../../types/configure';
import { ADV_RADIO_FIELDS, ADV_RANGES, RADIO_MODE_LABEL } from './constants';
import type { IfEntry, MeshIfEntry, ProfileMesh } from './types';

/** Numeric range check tolerant of string inputs (matches controller inRange). */
export const inRange = (v: unknown, min: number, max: number): boolean =>
  v !== '' && v != null && !Number.isNaN(Number(v)) && Number(v) >= min && Number(v) <= max;

/** Immutably set a dotted path (e.g. 'smartPoll.deadline', 'bandSettings.0.pathMin'). */
export function setIn<T>(obj: T, path: string, value: unknown): T {
  const keys = path.split('.');
  const clone: unknown = structuredClone(obj);
  let cursor = clone as Record<string, unknown>;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const key = keys[i];
    const next = cursor[key];
    cursor[key] = typeof next === 'object' && next != null ? next : {};
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[keys[keys.length - 1]] = value;
  return clone as T;
}

/** Read a dotted path, returning undefined for any missing segment. */
export function getIn(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

/** Parse a comma-separated channel list into numbers (non-numeric kept as strings). */
export const parseChannelList = (raw: string): Array<number | string> =>
  raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (Number.isNaN(Number(s)) ? s : Number(s)));

// Typed views over ApProfile's `unknown[]` fields (shapes proven by fixtures).
export const radioIfOf = (p: ApProfile): IfEntry[] => (p.radioIfList as IfEntry[]) ?? [];
export const wiredIfOf = (p: ApProfile): IfEntry[] => (p.wiredIfList as IfEntry[]) ?? [];
export const meshIfOf = (p: ApProfile): MeshIfEntry[] => (p.meshpointIfList as MeshIfEntry[]) ?? [];
export const meshpointsOf = (p: ApProfile): ProfileMesh[] => (p.meshpoints as ProfileMesh[]) ?? [];
export const strArr = (v: unknown): string[] => (Array.isArray(v) ? (v as unknown[]).map(String) : []);

/** Band label for a radio from its name or index. */
export const bandOf = (r: ProfileRadio): string => {
  const m = /(2\.4|5|6)\s*GHz/i.exec(r.radioName || '');
  if (m) return `${m[1]} GHz`;
  return ['2.4 GHz', '5 GHz', '6 GHz'][r.radioIndex - 1] || '';
};

/** Grid "Operational Mode" derived from the profile's radios. */
export function deriveOperationalMode(p: ApProfile): string {
  const radios = p.radios ?? [];
  if (!radios.length) return '—';
  const active = radios.filter((r) => r.adminState && r.mode !== 'off');
  const hasSensor = radios.some((r) => r.mode === 'sensor');
  const bands = active.filter((r) => r.mode !== 'sensor').map(bandOf).filter(Boolean);
  const service = bands.length ? bands.join(' / ') : '';
  if (hasSensor && service) return `Sensor + ${service}`;
  if (hasSensor) return 'Sensor';
  return service || 'Off';
}

/** Distinct networks bound across all radios (radioIfList serviceIds). */
export const networkCount = (p: ApProfile): number =>
  new Set(radioIfOf(p).map((e) => e.serviceId)).size;

export const radioModeLabel = (mode: string): string => RADIO_MODE_LABEL[mode] ?? mode;

/** Out-of-range per-radio advanced fields, formatted "RadioName: Label". */
export function radioRangeErrors(radios: ProfileRadio[], F: (t: string) => boolean): string[] {
  const errs: string[] = [];
  radios.forEach((r) => {
    if (r.mode === 'sensor') return;
    ADV_RADIO_FIELDS.forEach((field) => {
      if (field.type !== 'num' || !field.show(r, F)) return;
      const rg = ADV_RANGES[field.key];
      const value = (r as unknown as Record<string, unknown>)[field.key];
      if (rg && !inRange(value, rg[0], rg[1])) errs.push(`${r.radioName}: ${field.label}`);
    });
  });
  return errs;
}

/** camera-only platforms are filtered out of the create picker. */
export function platformCatalog(all: ApProfile[]): string[] {
  const camera = (plat: string) =>
    all.some((p) => p.apPlatform === plat && (p.features ?? []).indexOf('CAMERA') >= 0);
  return Array.from(new Set(all.map((p) => p.apPlatform)))
    .filter((pl) => pl && !camera(pl))
    .sort();
}

/** Wired-port tab visibility parity: >1 port or single-wired feature, and config feature on. */
export const wiredPortsVisible = (ports: ProfileWiredPort[], F: (t: string) => boolean): boolean =>
  (ports.length > 1 || F('AP-SINGLE-INF-WIRED-CLIENT')) && F('WIRED-PORTS-CONFIG');

/** True when any device-level Advanced Settings field is out of range / incomplete. */
export function hasDeviceAdvErrors(form: ApProfile, F: (t: string) => boolean): boolean {
  const mtuMax = F('JUMBO-FRAMES') ? 1800 : 1500;
  if (form.mtu != null && !inRange(form.mtu, 600, mtuMax)) return true;
  if (F('POLL-TIMEOUT') && !inRange(form.pollTimeout, 3, 600)) return true;
  if (form.cbRssThreshold != null && !inRange(form.cbRssThreshold, -128, -40)) return true;
  const sp = form.smartPoll;
  if (F('SMART-POLL') && sp?.enabled) {
    if (!inRange(sp.deadline, 1, Number(sp.interval) || 300)) return true;
    if ((sp.targets ?? []).length > 10) return true;
  }
  if (getIn(form, 'peapUsername.selection') === 'Custom' && !getIn(form, 'peapUsername.custom')) return true;
  if (getIn(form, 'peapPassword.selection') === 'Custom' && !getIn(form, 'peapPassword.custom')) return true;
  return false;
}
