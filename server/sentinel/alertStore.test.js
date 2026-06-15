import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AlertStore } from './alertStore.js';

describe('AlertStore', () => {
  let store;

  beforeEach(() => {
    store = new AlertStore();
  });

  afterEach(() => {
    store.destroy();
  });

  it('upserts a new alert', () => {
    const alert = store.upsert({
      id: 'test:1',
      severity: 'critical',
      checkName: 'radius_reachability',
      message: 'RADIUS down',
      target: '10.0.0.1:1812',
      context: { host: '10.0.0.1' },
    });

    expect(alert.id).toBe('test:1');
    expect(alert.occurrences).toBe(1);
    expect(alert.resolvedAt).toBeNull();
    expect(store.getActive()).toHaveLength(1);
  });

  it('bumps occurrences on repeat upsert', () => {
    store.upsert({ id: 'test:1', severity: 'warning', checkName: 'x', message: 'm', target: 't' });
    store.upsert({ id: 'test:1', severity: 'warning', checkName: 'x', message: 'm', target: 't' });
    store.upsert({ id: 'test:1', severity: 'warning', checkName: 'x', message: 'm', target: 't' });

    const alerts = store.getActive();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].occurrences).toBe(3);
  });

  it('resolveAbsent marks missing alerts as resolved', () => {
    store.upsert({ id: 'a:1', severity: 'warning', checkName: 'check_a', message: 'm1', target: 't1' });
    store.upsert({ id: 'a:2', severity: 'warning', checkName: 'check_a', message: 'm2', target: 't2' });
    store.upsert({ id: 'b:1', severity: 'warning', checkName: 'check_b', message: 'm3', target: 't3' });

    // Only a:1 still active for check_a
    store.resolveAbsent('check_a', new Set(['a:1']));

    const active = store.getActive();
    expect(active).toHaveLength(2); // a:1 + b:1
    expect(active.map((a) => a.id).sort()).toEqual(['a:1', 'b:1']);
  });

  it('reopens a resolved alert on re-upsert', () => {
    store.upsert({ id: 'x:1', severity: 'critical', checkName: 'c', message: 'm', target: 't' });
    store.resolveAbsent('c', new Set());
    expect(store.getActive()).toHaveLength(0);

    store.upsert({ id: 'x:1', severity: 'critical', checkName: 'c', message: 'm', target: 't' });
    expect(store.getActive()).toHaveLength(1);
    expect(store.getActive()[0].resolvedAt).toBeNull();
  });

  it('enforces max 500 active alerts', () => {
    for (let i = 0; i < 510; i++) {
      store.upsert({ id: `flood:${i}`, severity: 'info', checkName: 'test', message: `m${i}`, target: `t${i}` });
    }
    expect(store.getActive().length).toBeLessThanOrEqual(500);
  });

  it('getAll includes resolved alerts', () => {
    store.upsert({ id: 'r:1', severity: 'warning', checkName: 'c', message: 'm', target: 't' });
    store.resolveAbsent('c', new Set());
    expect(store.getActive()).toHaveLength(0);
    expect(store.getAll()).toHaveLength(1);
    expect(store.getAll()[0].resolvedAt).not.toBeNull();
  });

  it('clear removes all alerts', () => {
    store.upsert({ id: 'c:1', severity: 'info', checkName: 'c', message: 'm', target: 't' });
    store.clear();
    expect(store.getActive()).toHaveLength(0);
    expect(store.getAll()).toHaveLength(0);
  });
});
