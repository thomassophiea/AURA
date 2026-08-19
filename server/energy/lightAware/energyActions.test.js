// server/energy/lightAware/energyActions.test.js
import { describe, it, expect } from 'vitest';
import { ACTION_CATALOG, isActionAllowed } from './energyActions.js';

describe('ACTION_CATALOG', () => {
  it('marks every action non-executable this phase', () => {
    for (const def of Object.values(ACTION_CATALOG)) {
      expect(def.canExecute).toBe(false);
      expect(def.canModel).toBe(true);
    }
  });
});

describe('isActionAllowed', () => {
  const caps = { radioEnableDisable: true, radioPowerControl: false, wlanEnableDisable: false, chainControl: true, energyProfileControl: false };
  it('allows disableRadio when radioEnableDisable is present', () => {
    expect(isActionAllowed({ kind: 'disableRadio', band: '6' }, caps)).toBe(true);
  });
  it('blocks reduceTxPower without radioPowerControl', () => {
    expect(isActionAllowed({ kind: 'reduceTxPower', reducePercent: 20 }, caps)).toBe(false);
  });
  it('blocks disableWlan without wlanEnableDisable', () => {
    expect(isActionAllowed({ kind: 'disableWlan', wlanId: 'x' }, caps)).toBe(false);
  });
});
