import { describe, it, expect, vi } from 'vitest';
import {
  planRadioChange,
  verifyRadioChange,
  captureRadioState,
  applyRadioChange,
  restoreRadioState,
} from './radioActuator.js';

function ap(radios) {
  return { serialNumber: 'N1', hostSite: 'EAL-PT-N', radios };
}

const RADIOS = [
  { radioIndex: 1, adminState: true, adminStateOvr: false, txPower: 17 },
  { radioIndex: 2, adminState: true, adminStateOvr: false, txPower: 17 },
  { radioIndex: 3, adminState: true, adminStateOvr: false, txPower: 12 },
];

describe('planRadioChange', () => {
  it('sets adminState and turns the per-AP override on when disabling', () => {
    const { next, intended } = planRadioChange(ap(RADIOS), { radioIndexes: [3], adminState: false });
    const r3 = next.radios.find((r) => r.radioIndex === 3);
    expect(r3.adminState).toBe(false);
    expect(r3.adminStateOvr).toBe(true);
    expect(intended).toHaveLength(1);
    expect(intended[0].from.adminState).toBe(true);
  });

  it('hands control back to the profile when re-enabling', () => {
    const disabled = RADIOS.map((r) => (r.radioIndex === 3 ? { ...r, adminState: false, adminStateOvr: true } : r));
    const { next } = planRadioChange(ap(disabled), { radioIndexes: [3], adminState: true });
    const r3 = next.radios.find((r) => r.radioIndex === 3);
    expect(r3.adminState).toBe(true);
    expect(r3.adminStateOvr).toBe(false);
  });

  it('does not mutate the input object', () => {
    const source = ap(RADIOS);
    planRadioChange(source, { radioIndexes: [3], adminState: false });
    expect(source.radios.find((r) => r.radioIndex === 3).adminState).toBe(true);
  });

  it('leaves radios outside the target list untouched', () => {
    const { next, intended } = planRadioChange(ap(RADIOS), { radioIndexes: [3], adminState: false });
    expect(next.radios.find((r) => r.radioIndex === 1).adminState).toBe(true);
    expect(intended.map((i) => i.radioIndex)).toEqual([3]);
  });
});

describe('verifyRadioChange', () => {
  const intended = [{ radioIndex: 3, from: { adminState: true }, to: { adminState: false, adminStateOvr: true } }];

  it('confirms a change the controller really applied', () => {
    const back = ap([{ radioIndex: 3, adminState: false, adminStateOvr: true }]);
    expect(verifyRadioChange(back, intended).verified).toBe(true);
  });

  it('catches HTTP 200 with no configuration change — the real failure mode', () => {
    const back = ap([{ radioIndex: 3, adminState: true, adminStateOvr: false }]);
    const result = verifyRadioChange(back, intended);
    expect(result.verified).toBe(false);
    expect(result.mismatches[0].reason).toBe('admin_state_not_applied');
  });

  it('reports a radio that vanished from the read-back', () => {
    const result = verifyRadioChange(ap([{ radioIndex: 1, adminState: true }]), intended);
    expect(result.mismatches[0].reason).toBe('radio_absent');
  });
});

describe('captureRadioState', () => {
  it('records only the fields the actuator changes', () => {
    const captured = captureRadioState(ap(RADIOS));
    expect(captured.capturedRadios).toEqual([
      { radioIndex: 1, adminState: true, adminStateOvr: false },
      { radioIndex: 2, adminState: true, adminStateOvr: false },
      { radioIndex: 3, adminState: true, adminStateOvr: false },
    ]);
    expect(captured.hostSite).toBe('EAL-PT-N');
  });
});

/** Session double: sequential GET responses, capturing writes. */
function fakeSession(readSequence, { writeOk = true } = {}) {
  const reads = [...readSequence];
  const writes = [];
  return {
    writes,
    get: vi.fn(async () => {
      const next = reads.length > 1 ? reads.shift() : reads[0];
      return next;
    }),
    write: vi.fn(async (path, opts) => {
      writes.push({ path, body: opts.body, method: opts.method });
      return writeOk
        ? { ok: true, status: 200, data: opts.body }
        : { ok: false, status: 422, errorSummary: 'rejected' };
    }),
  };
}

const okRead = (radios) => ({ ok: true, status: 200, data: ap(radios) });

describe('applyRadioChange', () => {
  const sleep = async () => {};

  it('captures rollback BEFORE issuing the write', async () => {
    const order = [];
    const session = fakeSession([
      okRead(RADIOS),
      okRead([{ radioIndex: 3, adminState: false, adminStateOvr: true }]),
    ]);
    session.write = vi.fn(async () => {
      order.push('write');
      return { ok: true, status: 200 };
    });

    await applyRadioChange({
      session,
      serial: 'N1',
      radioIndexes: [3],
      adminState: false,
      persistRollback: async () => {
        order.push('capture');
      },
      sleep,
    });

    expect(order).toEqual(['capture', 'write']);
  });

  it('reports verified only when the read-back agrees', async () => {
    const session = fakeSession([
      okRead(RADIOS),
      okRead([{ radioIndex: 3, adminState: false, adminStateOvr: true }]),
    ]);
    const result = await applyRadioChange({
      session, serial: 'N1', radioIndexes: [3], adminState: false, sleep,
    });
    expect(result.ok).toBe(true);
    expect(result.verified).toBe(true);
  });

  it('fails when the controller accepts the write but nothing changed', async () => {
    const session = fakeSession([okRead(RADIOS), okRead(RADIOS)]);
    const result = await applyRadioChange({
      session, serial: 'N1', radioIndexes: [3], adminState: false, sleep,
    });
    expect(result.ok).toBe(false);
    expect(result.verified).toBe(false);
    expect(result.stage).toBe('verify');
  });

  it('surfaces a rejected write without claiming a change', async () => {
    const session = fakeSession([okRead(RADIOS)], { writeOk: false });
    const result = await applyRadioChange({
      session, serial: 'N1', radioIndexes: [3], adminState: false, sleep,
    });
    expect(result.ok).toBe(false);
    expect(result.stage).toBe('write');
  });

  it('is a no-op with no rollback when the radio is already in the target state', async () => {
    const already = [{ radioIndex: 3, adminState: false, adminStateOvr: true }];
    const persist = vi.fn();
    const session = fakeSession([okRead(already)]);
    const result = await applyRadioChange({
      session, serial: 'N1', radioIndexes: [3], adminState: false, persistRollback: persist, sleep,
    });
    expect(result.noop).toBe(true);
    expect(persist).not.toHaveBeenCalled();
    expect(session.write).not.toHaveBeenCalled();
  });

  it('refuses to write when the AP cannot be read at all', async () => {
    const session = {
      get: vi.fn(async () => ({ ok: false, status: 503, errorSummary: 'unreachable' })),
      write: vi.fn(),
    };
    const result = await applyRadioChange({
      session, serial: 'N1', radioIndexes: [3], adminState: false, sleep,
    });
    expect(result.stage).toBe('read');
    expect(session.write).not.toHaveBeenCalled();
  });

  it('rejects an HTML-shaped 200 body rather than treating it as an AP', async () => {
    const session = {
      get: vi.fn(async () => ({ ok: true, status: 200, data: '<html>404</html>' })),
      write: vi.fn(),
    };
    const result = await applyRadioChange({
      session, serial: 'N1', radioIndexes: [3], adminState: false, sleep,
    });
    expect(result.ok).toBe(false);
    expect(session.write).not.toHaveBeenCalled();
  });

  it('refuses when the AP has none of the requested radios', async () => {
    const session = fakeSession([okRead([{ radioIndex: 1, adminState: true, adminStateOvr: false }])]);
    const result = await applyRadioChange({
      session, serial: 'N1', radioIndexes: [3], adminState: false, sleep,
    });
    expect(result.stage).toBe('plan');
    expect(session.write).not.toHaveBeenCalled();
  });
});

describe('restoreRadioState', () => {
  const sleep = async () => {};
  const original = { capturedRadios: [{ radioIndex: 3, adminState: true, adminStateOvr: false }] };

  it('returns the radio to the captured state and verifies it', async () => {
    const session = fakeSession([
      okRead([{ radioIndex: 3, adminState: false, adminStateOvr: true }]),
      okRead([{ radioIndex: 3, adminState: true, adminStateOvr: false }]),
    ]);
    const result = await restoreRadioState({ session, serial: 'N1', original, sleep });
    expect(result.verified).toBe(true);
  });

  it('never reports success when the read-back disagrees', async () => {
    const stuck = [{ radioIndex: 3, adminState: false, adminStateOvr: true }];
    const session = fakeSession([okRead(stuck), okRead(stuck)]);
    const result = await restoreRadioState({ session, serial: 'N1', original, sleep });
    expect(result.ok).toBe(false);
    expect(result.verified).toBe(false);
    expect(result.error).toMatch(/did not return/i);
  });

  it('is a no-op when the AP is already at its captured state', async () => {
    const session = fakeSession([okRead([{ radioIndex: 3, adminState: true, adminStateOvr: false }])]);
    const result = await restoreRadioState({ session, serial: 'N1', original, sleep });
    expect(result.noop).toBe(true);
    expect(session.write).not.toHaveBeenCalled();
  });
});
