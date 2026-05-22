import { describe, it, expect, beforeEach } from 'vitest';
import { RollbackEngine } from './rollbackEngine.js';

describe('RollbackEngine', () => {
  let engine;
  beforeEach(() => { engine = new RollbackEngine(); });

  it('saves and retrieves a snapshot', () => {
    engine.save('audit-1', { serviceId: 'svc-abc', profiles: [1, 2, 3] });
    const snap = engine.get('audit-1');
    expect(snap.serviceId).toBe('svc-abc');
    expect(snap.savedAt).toBeDefined();
  });

  it('returns null for unknown auditId', () => {
    expect(engine.get('nope')).toBeNull();
  });

  it('deletes a snapshot', () => {
    engine.save('audit-2', { serviceId: 'x' });
    engine.delete('audit-2');
    expect(engine.get('audit-2')).toBeNull();
  });

  it('lists all snapshots with auditId and savedAt', () => {
    engine.save('a1', { serviceId: 'svc1' });
    engine.save('a2', { serviceId: 'svc2' });
    const list = engine.list();
    expect(list).toHaveLength(2);
    expect(list.map(s => s.auditId)).toContain('a1');
    expect(list[0]).not.toHaveProperty('serviceId'); // snapshot data not leaked in list
  });

  it('overwrites an existing snapshot on re-save', () => {
    engine.save('audit-3', { serviceId: 'old' });
    engine.save('audit-3', { serviceId: 'new' });
    expect(engine.get('audit-3').serviceId).toBe('new');
  });
});
