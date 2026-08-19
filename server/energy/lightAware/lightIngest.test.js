// server/energy/lightAware/lightIngest.test.js
import { describe, it, expect, vi } from 'vitest';
import { ingestLightReport } from './lightIngest.js';

function fakeDeps(open) {
  return {
    insertSample: vi.fn().mockResolvedValue(undefined),
    getOpenTransition: vi.fn().mockResolvedValue(open),
    closeAndOpenTransition: vi.fn().mockResolvedValue(undefined),
  };
}

describe('ingestLightReport', () => {
  it('always inserts a sample with the normalized state', async () => {
    const deps = fakeDeps({ to_state: 'bright', entered_at: '2026-08-19T00:00:00Z' });
    await ingestLightReport({ sourceId: 's', serial: 'A', state: 'dark', data: 2, at: '2026-08-19T00:10:00Z' }, deps);
    expect(deps.insertSample).toHaveBeenCalledWith(
      expect.objectContaining({ apSerial: 'A', normalizedState: 'dark' })
    );
  });

  it('does not commit a transition before dwell elapses', async () => {
    const deps = fakeDeps({ to_state: 'bright', entered_at: '2026-08-19T00:00:00Z' });
    const res = await ingestLightReport({ sourceId: 's', serial: 'A', state: 'dark', data: 2, at: '2026-08-19T00:01:00Z' }, deps);
    expect(res.committed).toBe(false);
    expect(deps.closeAndOpenTransition).not.toHaveBeenCalled();
  });

  it('commits a transition once dwell elapses', async () => {
    const deps = fakeDeps({ to_state: 'bright', entered_at: '2026-08-19T00:00:00Z' });
    const res = await ingestLightReport({ sourceId: 's', serial: 'A', state: 'dark', data: 2, at: '2026-08-19T00:31:00Z' }, deps);
    expect(res.committed).toBe(true);
    expect(deps.closeAndOpenTransition).toHaveBeenCalledWith(
      expect.objectContaining({ toState: 'dark', fromState: 'bright' })
    );
  });
});
