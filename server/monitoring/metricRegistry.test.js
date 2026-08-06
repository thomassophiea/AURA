import { describe, it, expect } from 'vitest';

import { classifyMetric, isCumulative, isNonSummable, METRIC_FAMILIES } from './metricRegistry.js';

describe('classifyMetric', () => {
  it('classifies a percent unit as a percentage so it is never summed', () => {
    expect(classifyMetric({ family: 'ap_report', name: 'x.total', unit: '%' })).toBe('percentage');
  });

  it('classifies throughput in bps as a gauge, not a counter', () => {
    expect(classifyMetric({ family: 'ap_report', name: 'throughputReport.total', unit: 'bps' })).toBe(
      'gauge'
    );
  });

  it('classifies station byte totals as cumulative counters', () => {
    expect(classifyMetric({ family: METRIC_FAMILIES.STATION, name: 'rxBytes' })).toBe('counter');
    expect(classifyMetric({ family: METRIC_FAMILIES.STATION, name: 'txBytes' })).toBe('counter');
  });

  it('classifies computed SLE scores as percentages', () => {
    expect(classifyMetric({ family: METRIC_FAMILIES.SLE, name: 'coverage' })).toBe('percentage');
    expect(classifyMetric({ family: METRIC_FAMILIES.SLE, name: 'ap_health' })).toBe('percentage');
  });

  it('is case-insensitive on family and name', () => {
    expect(classifyMetric({ family: 'STATION', name: 'RxBytes' })).toBe('counter');
  });

  it('falls back to gauge for an unknown unit rather than guessing', () => {
    expect(classifyMetric({ family: 'ap_report', name: 'mystery', unit: 'furlongs' })).toBe('gauge');
    expect(classifyMetric({ family: 'ap_report', name: 'mystery' })).toBe('gauge');
  });

  it('tolerates missing input', () => {
    expect(classifyMetric()).toBe('gauge');
    expect(classifyMetric({})).toBe('gauge');
  });

  it('lets an explicit registration win over the unit heuristic', () => {
    // dBm would otherwise map to gauge; rxBytes is explicitly a counter.
    expect(classifyMetric({ family: 'station', name: 'rxBytes', unit: 'dBm' })).toBe('counter');
  });
});

describe('isNonSummable / isCumulative', () => {
  it('marks percentages and gauges as non-summable', () => {
    expect(isNonSummable('percentage')).toBe(true);
    expect(isNonSummable('gauge')).toBe(true);
    expect(isNonSummable('ratio')).toBe(true);
  });

  it('allows event counts and counter deltas to be summed', () => {
    expect(isNonSummable('event_count')).toBe(false);
    expect(isNonSummable('counter_delta')).toBe(false);
  });

  it('identifies only raw counters as cumulative', () => {
    expect(isCumulative('counter')).toBe(true);
    expect(isCumulative('counter_delta')).toBe(false);
    expect(isCumulative('gauge')).toBe(false);
  });
});
