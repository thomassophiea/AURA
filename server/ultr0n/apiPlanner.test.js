import { describe, it, expect } from 'vitest';
import { planApiCalls } from './apiPlanner.js';

const resolved = {
  mac: 'aa:bb:cc:dd:ee:ff',
  stationId: 'sta-1',
  apSerialNumber: 'AP001',
  siteId: 'site-1',
  serviceId: 'svc-1',
  startTime: '2026-01-01T00:00:00Z',
  endTime: '2026-01-02T00:00:00Z',
};

describe('planApiCalls', () => {
  it('returns array for client-disconnect intent', () => {
    const plan = planApiCalls('client-disconnect', resolved);
    expect(Array.isArray(plan)).toBe(true);
    expect(plan.length).toBeGreaterThan(0);
  });

  it('client-disconnect plan includes station events call', () => {
    const plan = planApiCalls('client-disconnect', resolved);
    expect(plan.some(c => c.path.includes('events'))).toBe(true);
  });

  it('client-disconnect plan includes AP state call', () => {
    const plan = planApiCalls('client-disconnect', resolved);
    expect(plan.some(c => c.path.includes('state/aps'))).toBe(true);
  });

  it('action-reboot-ap plan has a disruptive call', () => {
    const plan = planApiCalls('action-reboot-ap', resolved);
    expect(plan.some(c => c.disruptive)).toBe(true);
  });

  it('unknown intent returns empty array', () => {
    const plan = planApiCalls('unknown', resolved);
    expect(plan).toEqual([]);
  });

  it('each plan call has method, path, disruptive', () => {
    const plan = planApiCalls('client-poor-wifi', resolved);
    for (const call of plan) {
      expect(typeof call.method).toBe('string');
      expect(typeof call.path).toBe('string');
      expect(typeof call.disruptive).toBe('boolean');
    }
  });

  it('plan resolves mac address into path', () => {
    const plan = planApiCalls('client-disconnect', resolved);
    const eventsCall = plan.find(c => c.path.includes('events'));
    expect(eventsCall.path).toContain('aa%3Abb%3Acc%3Add%3Aee%3Aff');
  });
});
