/**
 * ExtremeLocation profile validation (EPB-125 · /v3/xlocation). The one
 * documented constraint is the spec's own field description: "Report
 * Frequency 1~60 seconds and default is 10 seconds". minRss carries no
 * documented range (it is a negative dBm threshold) so only whole-number-ness
 * is enforced; svrAddr gets the same hostname check its ESL/ADSP siblings use.
 */
import type { XLocationProfile } from '../../../services/configure/xlocationService';
import { RE_HOST, intIn, isInt, nameError, type NamedRecord } from './profileModel';

export type XLocationErrors = Record<'name' | 'svrAddr' | 'reportFreq' | 'minRss', string | null>;

export function xlocationErrors(rows: NamedRecord[], form: XLocationProfile): XLocationErrors {
  return {
    name: nameError(rows, form),
    svrAddr: !form.svrAddr
      ? 'Server address is required'
      : RE_HOST.test(form.svrAddr)
        ? null
        : 'Enter a valid hostname or IP address',
    reportFreq: intIn(form.reportFreq, 1, 60)
      ? null
      : 'Report frequency must be a whole number between 1 and 60 seconds',
    minRss: isInt(form.minRss) ? null : 'Minimum RSS is required (whole dBm)',
  };
}

/** Adjust the /default template into a fresh create scaffold. */
export function seedXLocation(def: XLocationProfile): XLocationProfile {
  const s = structuredClone(def);
  s.name = '';
  s.svrAddr = s.svrAddr ?? '';
  s.tenantId = s.tenantId ?? '';
  s.minRss = typeof s.minRss === 'number' ? s.minRss : -70;
  s.reportFreq = typeof s.reportFreq === 'number' ? s.reportFreq : 10;
  s.canEdit = true;
  s.canDelete = true;
  return s;
}
