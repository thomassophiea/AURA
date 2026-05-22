import { describe, it, expect } from 'vitest';
import { aggregateConfidence } from './confidenceAggregator.js';

const ALL_PASS = [
  { name: 'vlan_exists', result: 'pass' },
  { name: 'dhcp_scope', result: 'pass' },
  { name: 'switch_trunk', result: 'pass' },
  { name: 'ap_model_support', result: 'pass' },
  { name: 'ssid_count_limit', result: 'pass' },
  { name: 'rf_capacity', result: 'pass' },
  { name: 'band_compatibility', result: 'pass' },
];

describe('aggregateConfidence', () => {
  it('returns HIGH (>=80) when all checks pass', () => {
    const { score, band } = aggregateConfidence(ALL_PASS);
    expect(score).toBeGreaterThanOrEqual(80);
    expect(band).toBe('HIGH');
  });

  it('caps at score=40 and band=LOW when a blocking check fails', () => {
    const checks = [
      { name: 'vlan_exists', result: 'fail' },
      { name: 'dhcp_scope', result: 'pass' },
    ];
    const { score, band, blockingFailures } = aggregateConfidence(checks);
    expect(score).toBe(40);
    expect(band).toBe('LOW');
    expect(blockingFailures).toContain('vlan_exists');
  });

  it('applies operationalPattern multiplier x1.20 when no blocking failures', () => {
    // Use a subset that doesn't hit the 100 cap
    const somePass = [
      { name: 'vlan_exists', result: 'pass' },
      { name: 'dhcp_scope', result: 'pass' },
      { name: 'switch_trunk', result: 'pass' },
    ];
    const withMult = aggregateConfidence(somePass, { operationalPattern: true });
    const without = aggregateConfidence(somePass);
    expect(withMult.score).toBeGreaterThan(without.score);
  });

  it('does NOT apply multiplier when a blocking check failed', () => {
    const checks = [{ name: 'vlan_exists', result: 'fail' }];
    expect(aggregateConfidence(checks, { operationalPattern: true }).score).toBe(40);
  });

  it('returns band=BLOCK when any check has result=block', () => {
    const checks = [{ name: 'ssid_count_limit', result: 'block' }];
    expect(aggregateConfidence(checks).band).toBe('BLOCK');
  });

  it('includes warn check names in warnings array', () => {
    const checks = [
      ...ALL_PASS.filter(c => c.name !== 'switch_trunk'),
      { name: 'switch_trunk', result: 'warn' },
    ];
    const { warnings } = aggregateConfidence(checks);
    expect(warnings).toContain('switch_trunk');
  });
});
