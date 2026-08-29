import { describe, it, expect } from 'vitest';
import { filterDevices } from './deviceSearchRouter.js';

/** Synthetic 1,000-item AP-shaped list for exercising filter/cap/sort. */
function buildItems(count) {
  const items = [];
  for (let i = 0; i < count; i += 1) {
    items.push({
      id: `SN${i}`,
      name: `AP-${String(i).padStart(4, '0')}`,
      serialNumber: `SN${i}`,
      ipAddress: `10.0.${Math.floor(i / 255)}.${i % 255}`,
      siteName: i % 2 === 0 ? 'Building-A' : 'Building-B',
    });
  }
  // One distinctive item to search for, out of alphabetical order.
  items.push({
    id: 'SN-NEEDLE',
    name: 'Zebra-Lobby',
    serialNumber: 'FINDME123',
    ipAddress: '192.168.99.99',
    siteName: 'Remote-Site',
  });
  return items;
}

const FIELDS = ['name', 'serialNumber', 'ipAddress', 'siteName'];

describe('filterDevices', () => {
  const items = buildItems(1000);

  it('returns the first `limit` items sorted by name when q is empty, total is full count', () => {
    const result = filterDevices(items, { q: '', limit: 50, fields: FIELDS });
    expect(result.items).toHaveLength(50);
    expect(result.total).toBe(1001);
    expect(result.capped).toBe(true);
    // Sorted by name ascending.
    const names = result.items.map((item) => item.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('filters case-insensitively by name', () => {
    const result = filterDevices(items, { q: 'zebra-lobby', limit: 50, fields: FIELDS });
    expect(result.total).toBe(1);
    expect(result.items[0].id).toBe('SN-NEEDLE');
  });

  it('filters case-insensitively across serial/ip/site fields, not just name', () => {
    const bySerial = filterDevices(items, { q: 'findme123', limit: 50, fields: FIELDS });
    expect(bySerial.total).toBe(1);
    expect(bySerial.items[0].id).toBe('SN-NEEDLE');

    const byIp = filterDevices(items, { q: '192.168.99.99', limit: 50, fields: FIELDS });
    expect(byIp.total).toBe(1);
    expect(byIp.items[0].id).toBe('SN-NEEDLE');

    const bySite = filterDevices(items, { q: 'remote-site', limit: 50, fields: FIELDS });
    expect(bySite.total).toBe(1);
    expect(bySite.items[0].id).toBe('SN-NEEDLE');
  });

  it('matches a substring shared by many items and reports the full pre-cap count', () => {
    const result = filterDevices(items, { q: 'building-a', limit: 10, fields: FIELDS });
    // Half of the 1000 synthetic APs (even indices) are in Building-A.
    expect(result.total).toBe(500);
    expect(result.items).toHaveLength(10);
    expect(result.capped).toBe(true);
  });

  it('enforces the cap: items.length === limit when matches exceed limit', () => {
    const result = filterDevices(items, { q: 'ap-', limit: 25, fields: FIELDS });
    expect(result.items).toHaveLength(25);
    expect(result.capped).toBe(true);
  });

  it('capped is false when matches are under the limit', () => {
    const result = filterDevices(items, { q: 'zebra', limit: 50, fields: FIELDS });
    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.capped).toBe(false);
  });

  it('returns no items and total 0 for a query that matches nothing', () => {
    const result = filterDevices(items, { q: 'no-such-device-xyz', limit: 50, fields: FIELDS });
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.capped).toBe(false);
  });
});
