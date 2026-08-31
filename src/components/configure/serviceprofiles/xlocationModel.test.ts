/**
 * ExtremeLocation profile model tests — the spec-documented Report Frequency
 * range (1–60 s), the negative-dBm Minimum RSS, and the create seed.
 */
import { describe, expect, it } from 'vitest';
import type { XLocationProfile } from '../../../services/configure/xlocationService';
import { seedXLocation, xlocationErrors } from './xlocationModel';

/** The live /v3/xlocation/default template (lab pair, 2026-08). */
const DEF = {
  custId: null,
  id: null,
  canDelete: null,
  canEdit: null,
  name: null,
  svrAddr: null,
  minRss: -70,
  reportFreq: 10,
  tenantId: null,
} as unknown as XLocationProfile;

const base: XLocationProfile = {
  id: 'x1',
  name: 'HQ Location',
  svrAddr: 'feeds1.extremelocation.com',
  minRss: -70,
  reportFreq: 10,
  tenantId: 'tenant-1',
};

describe('xlocationErrors', () => {
  const rows = [{ id: 'other', name: 'Existing' }];

  it('accepts a valid record', () => {
    const errs = xlocationErrors(rows, base);
    expect(Object.values(errs).every((e) => !e)).toBe(true);
  });

  it('requires name and server address', () => {
    expect(xlocationErrors(rows, { ...base, name: ' ' }).name).toBeTruthy();
    expect(xlocationErrors(rows, { ...base, svrAddr: '' }).svrAddr).toBeTruthy();
    expect(xlocationErrors(rows, { ...base, svrAddr: 'bad host!' }).svrAddr).toBeTruthy();
    expect(xlocationErrors(rows, { ...base, svrAddr: '10.1.1.1' }).svrAddr).toBeNull();
  });

  it('bounds report frequency to the spec range 1-60 s', () => {
    expect(xlocationErrors(rows, { ...base, reportFreq: 0 }).reportFreq).toBeTruthy();
    expect(xlocationErrors(rows, { ...base, reportFreq: 61 }).reportFreq).toBeTruthy();
    expect(xlocationErrors(rows, { ...base, reportFreq: 10.5 }).reportFreq).toBeTruthy();
    expect(xlocationErrors(rows, { ...base, reportFreq: NaN }).reportFreq).toBeTruthy();
    expect(xlocationErrors(rows, { ...base, reportFreq: 1 }).reportFreq).toBeNull();
    expect(xlocationErrors(rows, { ...base, reportFreq: 60 }).reportFreq).toBeNull();
  });

  it('requires a whole-dBm Minimum RSS and accepts negative values', () => {
    expect(xlocationErrors(rows, { ...base, minRss: NaN }).minRss).toBeTruthy();
    expect(xlocationErrors(rows, { ...base, minRss: -70.5 }).minRss).toBeTruthy();
    expect(xlocationErrors(rows, { ...base, minRss: -100 }).minRss).toBeNull();
    expect(xlocationErrors(rows, { ...base, minRss: 0 }).minRss).toBeNull();
  });

  it('rejects duplicate profile names', () => {
    expect(xlocationErrors(rows, { ...base, name: 'Existing' }).name).toBeTruthy();
  });
});

describe('seedXLocation', () => {
  it('turns the live null-heavy default template into a create scaffold', () => {
    const s = seedXLocation(DEF);
    expect(s.name).toBe('');
    expect(s.svrAddr).toBe('');
    expect(s.tenantId).toBe('');
    expect(s.minRss).toBe(-70);
    expect(s.reportFreq).toBe(10);
    expect(s.canEdit).toBe(true);
    expect(s.canDelete).toBe(true);
  });
});
