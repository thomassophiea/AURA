// server/energy/lightAware/policyEngine.test.js
import { describe, it, expect } from 'vitest';
import { eligibleOptimizations } from './policyEngine.js';

const fullCaps = {
  radioPowerControl: true, radioEnableDisable: true, chainControl: true,
  wlanEnableDisable: true, energyProfileControl: true,
};

const policy = {
  dim: { actions: [{ kind: 'reduceTxPower', reducePercent: 20 }, { kind: 'reduceChains' }] },
  dark: { actions: [{ kind: 'disableRadio', band: '6' }, { kind: 'reduceTxPower', reducePercent: 30 }, { kind: 'disableWlan', wlanId: 'guest' }] },
  protectedWlanIds: ['iot', 'voice'],
};

describe('eligibleOptimizations', () => {
  it('returns nothing for bright or unknown', () => {
    expect(eligibleOptimizations({ state: 'bright', capabilities: fullCaps, policy })).toEqual([]);
    expect(eligibleOptimizations({ state: 'unknown', capabilities: fullCaps, policy })).toEqual([]);
  });

  it('applies dim actions when state is dim', () => {
    const opts = eligibleOptimizations({ state: 'dim', capabilities: fullCaps, policy });
    expect(opts).toContainEqual(expect.objectContaining({ kind: 'reduceTxPower', reducePercent: 20, source: 'lightAware' }));
    expect(opts).toContainEqual(expect.objectContaining({ kind: 'reduceChains', source: 'lightAware' }));
  });

  it('applies dark actions when state is dark', () => {
    const opts = eligibleOptimizations({ state: 'dark', capabilities: fullCaps, policy });
    expect(opts).toContainEqual(expect.objectContaining({ kind: 'disableRadio', band: '6' }));
  });

  it('never disables a protected WLAN even if listed in dark actions', () => {
    const p = { ...policy, dark: { actions: [{ kind: 'disableWlan', wlanId: 'iot' }] } };
    const opts = eligibleOptimizations({ state: 'dark', capabilities: fullCaps, policy: p });
    expect(opts.find((o) => o.kind === 'disableWlan')).toBeUndefined();
  });

  it('drops actions the hardware cannot perform', () => {
    const caps = { ...fullCaps, wlanEnableDisable: false };
    const opts = eligibleOptimizations({ state: 'dark', capabilities: caps, policy });
    expect(opts.find((o) => o.kind === 'disableWlan')).toBeUndefined();
  });
});
