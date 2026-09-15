import { describe, it, expect, beforeEach, vi } from 'vitest';

// No database in unit tests: the catalogue must degrade to memory rather than
// fail, because a catalogue write may never be the reason an answer is lost.
vi.mock('../db/pool.js', () => ({
  isDatabaseConfigured: () => false,
  query: async () => {
    throw new Error('no database in unit tests');
  },
}));

const {
  normaliseQuestion,
  recordGap,
  recordGapsFromInvestigation,
  gapReport,
  clearMemoryCatalogue,
  GAP_KIND,
} = await import('./apiGapCatalog.js');

beforeEach(() => clearMemoryCatalogue());

describe('normaliseQuestion', () => {
  it('strips a MAC address', () => {
    expect(normaliseQuestion('why is D0:57:7E:C4:49:1A dropping?')).toBe('why is <mac> dropping?');
  });

  it('strips an IP before it can be read as a MAC', () => {
    // 192.168.100.122 is twelve hex digits and parses as a valid MAC.
    expect(normaliseQuestion('is 192.168.100.122 slow?')).toBe('is <ip> slow?');
  });

  it('strips an AP serial', () => {
    expect(normaliseQuestion('check WM012243W-30032')).toBe('check <serial>');
  });

  it('scrubs entity names it is told about', () => {
    const shape = normaliseQuestion('is AURA_PSAE broadcasting at AURA_LAB?', {
      entityNames: ['AURA_PSAE', 'AURA_LAB'],
    });
    expect(shape).toBe('is <entity> broadcasting at <entity>?');
  });

  it('collapses two questions about different clients into ONE shape', () => {
    // This is what makes the hit counter mean "demand" instead of "volume".
    const a = normaliseQuestion('why was AA:BB:CC:DD:EE:01 rejected by RADIUS?');
    const b = normaliseQuestion('why was AA:BB:CC:DD:EE:02 rejected by RADIUS?');
    expect(a).toBe(b);
  });

  it('is empty for an empty question rather than a bare placeholder', () => {
    expect(normaliseQuestion('   ')).toBe('');
  });
});

describe('recordGap', () => {
  it('refuses a gap with no capability key', async () => {
    const r = await recordGap({ question: 'anything?', controllerKey: 'c1' });
    expect(r.recorded).toBe(false);
    expect(r.reason).toMatch(/capability key/);
  });

  it('records to memory when no database is configured', async () => {
    const r = await recordGap({
      controllerKey: 'c1',
      capabilityKey: 'client.radius_reject_reason',
      question: 'why was AA:BB:CC:DD:EE:01 rejected?',
    });
    expect(r).toEqual({ recorded: true, store: 'memory' });
  });

  it('counts repeat demand as hits on one gap, not as many gaps', async () => {
    for (const mac of ['AA:BB:CC:DD:EE:01', 'AA:BB:CC:DD:EE:02', 'AA:BB:CC:DD:EE:03']) {
      await recordGap({
        controllerKey: 'c1',
        capabilityKey: 'client.radius_reject_reason',
        question: `why was ${mac} rejected?`,
      });
    }
    const report = await gapReport();
    expect(report.gaps).toHaveLength(1);
    expect(report.gaps[0].hits).toBe(3);
  });

  it('keeps gaps from different controllers apart', async () => {
    await recordGap({ controllerKey: 'c1', capabilityKey: 'ap.reboot_reason', question: 'why did it reboot?' });
    await recordGap({ controllerKey: 'c2', capabilityKey: 'ap.reboot_reason', question: 'why did it reboot?' });
    expect((await gapReport()).gaps).toHaveLength(2);
    expect((await gapReport({ controllerKey: 'c2' })).gaps).toHaveLength(1);
  });

  it('never stores a raw client identifier', async () => {
    await recordGap({
      controllerKey: 'c1',
      capabilityKey: 'client.radius_reject_reason',
      question: 'why was bob.smith on 10.1.2.3 with D0:57:7E:C4:49:1A rejected?',
    });
    const dump = JSON.stringify((await gapReport()).gaps);
    expect(dump).not.toMatch(/10\.1\.2\.3/);
    expect(dump).not.toMatch(/D0:57:7E/i);
  });
});

describe('recordGapsFromInvestigation', () => {
  it('records only the gaps an investigation actually reached', async () => {
    // Writing every unusable capability on every question would make the
    // catalogue a copy of the registry and say nothing about demand.
    await recordGapsFromInvestigation({
      question: 'why did AP WM012243W-30032 reboot?',
      controllerKey: 'c1',
      ledger: [
        { tool: 'getApHealth', ok: true, digest: { tool: 'getApHealth' } },
        { tool: 'getRecentChanges', ok: true, digest: { tool: 'getRecentChanges', unavailable: true, capabilityKey: 'ap.reboot_reason' } },
      ],
      capabilities: { explainGap: (k) => `no source for ${k}` },
    });
    const report = await gapReport();
    expect(report.gaps).toHaveLength(1);
    expect(report.gaps[0].capabilityKey).toBe('ap.reboot_reason');
    expect(report.gaps[0].evidenceRequired).toBe('no source for ap.reboot_reason');
  });

  it('records nothing when the investigation hit no gap', async () => {
    await recordGapsFromInvestigation({
      question: 'how many APs?',
      controllerKey: 'c1',
      ledger: [{ tool: 'getApHealth', ok: true, digest: { tool: 'getApHealth' } }],
    });
    expect((await gapReport()).gaps).toHaveLength(0);
  });
});

describe('gapReport', () => {
  it('says plainly that an in-memory catalogue is not a historical record', async () => {
    const report = await gapReport();
    expect(report.store).toBe('memory');
    expect(report.note).toMatch(/lost on restart/);
  });

  it('ranks by demand', async () => {
    await recordGap({ controllerKey: 'c1', capabilityKey: 'rare.thing', question: 'a?', gapKind: GAP_KIND.FIELD });
    for (let i = 0; i < 5; i += 1) {
      await recordGap({ controllerKey: 'c1', capabilityKey: 'common.thing', question: 'b?' });
    }
    const report = await gapReport();
    expect(report.gaps[0].capabilityKey).toBe('common.thing');
  });
});
