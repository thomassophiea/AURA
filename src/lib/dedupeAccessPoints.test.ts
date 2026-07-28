import { describe, it, expect } from 'vitest';
import { dedupeAccessPointsBySerial } from './dedupeAccessPoints';

describe('dedupeAccessPointsBySerial', () => {
  it('collapses APs fetched once per site group back to the real fleet (6 dupes -> 6)', () => {
    const fleet = [
      { serialNumber: 'CV012408S-C0102' },
      { serialNumber: 'CV012408S-C0044' },
      { serialNumber: 'CV012408S-C0078' },
      { serialNumber: 'WF022448S-C0023' },
      { serialNumber: 'WM012243W-30032' },
      { serialNumber: 'WM042233W-30032' },
    ];
    // Two site groups resolving to the same controller each return the full fleet.
    const doubled = [...fleet, ...fleet];
    const result = dedupeAccessPointsBySerial(doubled);
    expect(result).toHaveLength(6);
    expect(result.map((ap) => ap.serialNumber)).toEqual(fleet.map((ap) => ap.serialNumber));
  });

  it('keeps the first occurrence of each serial (tags preserved, order stable)', () => {
    const input = [
      { serialNumber: 'A', _siteGroupName: 'PrimarySite' },
      { serialNumber: 'B', _siteGroupName: 'PrimarySite' },
      { serialNumber: 'A', _siteGroupName: 'AFC LAB' },
    ];
    const result = dedupeAccessPointsBySerial(input);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ serialNumber: 'A', _siteGroupName: 'PrimarySite' });
    expect(result[1]).toEqual({ serialNumber: 'B', _siteGroupName: 'PrimarySite' });
  });

  it('drops records without a serialNumber so no blank/placeholder rows survive', () => {
    const input = [
      { serialNumber: 'A' },
      { serialNumber: '' },
      { serialNumber: undefined },
      {},
    ] as Array<{ serialNumber?: string }>;
    const result = dedupeAccessPointsBySerial(input);
    expect(result).toEqual([{ serialNumber: 'A' }]);
  });

  it('is a no-op for an already-unique list', () => {
    const input = [{ serialNumber: 'A' }, { serialNumber: 'B' }, { serialNumber: 'C' }];
    expect(dedupeAccessPointsBySerial(input)).toEqual(input);
  });
});
