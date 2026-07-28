/**
 * Wi-Fi 7 projection helpers — turn raw controller radio records (ApRadio,
 * ProfileRadio) into the presentation-oriented Wifi7Radio view and derive EHT
 * capability. Kept UI-framework-free so both the AP radio editor and the
 * profile Networks tab can consume it. Schema: audit/WIFI7_MLO_AFC_FINDINGS.md.
 */
import type { ApRadio } from '../../types/configure/ap';
import type { PowerMode6, Wifi7Band, Wifi7Radio } from '../../types/wifi7';
import { POWER_MODE6 } from '../../types/wifi7';

const BAND_BY_INDEX: Record<number, Wifi7Band> = { 1: '2.4GHz', 2: '5GHz', 3: '6GHz' };

/** 802.11be capability: the controller appends `be` to the mode of EHT radios. */
export function isEht(mode: string | undefined): boolean {
  return (mode ?? '').trim().toLowerCase().endsWith('be');
}

/** Band for a radio from its slot index, falling back to the mode prefix. */
export function bandOf(radioIndex: number, mode?: string): Wifi7Band {
  const byIndex = BAND_BY_INDEX[radioIndex];
  if (byIndex) return byIndex;
  const m = (mode ?? '').toLowerCase();
  if (m.startsWith('ax6')) return '6GHz';
  if (m.startsWith('anc') || m.startsWith('a')) return '5GHz';
  return '2.4GHz';
}

function widthMhz(channelWidth: string | undefined): number | null {
  const m = /(\d+)\s*MHz/i.exec(channelWidth ?? '');
  return m ? Number(m[1]) : null;
}

/** Project a raw per-AP radio record into the Wifi7Radio presentation view. */
export function projectApRadio(r: ApRadio): Wifi7Radio {
  const band = bandOf(r.radioIndex, r.mode);
  const pwrMode6 = (r.pwrMode6 ?? 'LPI') as PowerMode6;
  const standardPower = band === '6GHz' && POWER_MODE6[pwrMode6]?.standardPower === true;
  const txMaxPower = Number(r.txMaxPower ?? 0);
  const txPower = Number(r.txPower ?? 0);
  const cb = Array.isArray(r.cb) ? r.cb : [];
  return {
    radioIndex: r.radioIndex,
    band,
    mode: r.mode ?? '',
    eht: isEht(r.mode),
    adminState: Boolean(r.adminState),
    opChannel: String(r.opChannel ?? r.channel ?? ''),
    channelWidth: r.channelwidth ?? '',
    channelWidthMhz: widthMhz(r.channelwidth),
    txMaxPower,
    txPower,
    powerCapDb: Math.max(0, txMaxPower - txPower),
    afc: Boolean(r.afc),
    pwrMode6,
    pwrMode6Ovr: Boolean(r.pwrMode6Ovr),
    standardPower,
    mloGrouped: cb.length > 0 || r.cbServiceId != null,
    cbServiceId: r.cbServiceId ?? null,
    boundSsids: (r.wlan ?? []).map((w) => w.ssid).filter(Boolean),
  };
}

/** The set of EHT-capable bands present in a group of radios (deduped, ordered). */
export function ehtBands(radios: Array<{ radioIndex: number; mode?: string }>): Wifi7Band[] {
  const order: Wifi7Band[] = ['2.4GHz', '5GHz', '6GHz'];
  const present = new Set(radios.filter((r) => isEht(r.mode)).map((r) => bandOf(r.radioIndex, r.mode)));
  return order.filter((b) => present.has(b));
}
