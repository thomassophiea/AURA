import { describe, it, expect } from 'vitest';
import { AVAILABLE_METRICS, DEFAULT_CONTEXTS } from './siteContext';

describe('AVAILABLE_METRICS', () => {
  it('exposes the 8 documented metric names', () => {
    expect(AVAILABLE_METRICS.map((m) => m.name).sort()).toEqual(
      [
        'apUptimeThreshold',
        'throughputThreshold',
        'signalQualityThreshold',
        'clientDensity',
        'latencyThreshold',
        'packetLossThreshold',
        'coverageThreshold',
        'interferenceThreshold',
      ].sort()
    );
  });

  it('every metric has min ≤ defaultValue ≤ max within a known category', () => {
    const categories = new Set(['performance', 'reliability', 'quality']);
    for (const m of AVAILABLE_METRICS) {
      expect(categories.has(m.category), `${m.name}.category`).toBe(true);
      expect(m.min, `${m.name}.min`).toBeLessThanOrEqual(m.defaultValue);
      expect(m.defaultValue, `${m.name}.defaultValue`).toBeLessThanOrEqual(m.max);
      expect(m.label, `${m.name}.label`).toBeTruthy();
      expect(m.description, `${m.name}.description`).toBeTruthy();
      expect(m.unit, `${m.name}.unit`).toBeTruthy();
    }
  });
});

describe('DEFAULT_CONTEXTS', () => {
  it('exposes the 5 expected contexts (ai-context, retail, warehouse, dc, hq)', () => {
    expect(DEFAULT_CONTEXTS.map((c) => c.id).sort()).toEqual(
      ['ai-context', 'retail-store', 'warehouse', 'distribution-center', 'headquarters'].sort()
    );
  });

  it('every context has name/description/color and full metric set', () => {
    for (const ctx of DEFAULT_CONTEXTS) {
      expect(ctx.name).toBeTruthy();
      expect(ctx.description).toBeTruthy();
      expect(ctx.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(ctx.isCustom).toBe(false);
      expect(typeof ctx.metrics.apUptimeThreshold).toBe('number');
      expect(typeof ctx.metrics.throughputThreshold).toBe('number');
      expect(typeof ctx.metrics.signalQualityThreshold).toBe('number');
      expect(typeof ctx.metrics.clientDensity).toBe('number');
      expect(typeof ctx.metrics.latencyThreshold).toBe('number');
      expect(typeof ctx.metrics.packetLossThreshold).toBe('number');
      expect(typeof ctx.metrics.coverageThreshold).toBe('number');
      expect(typeof ctx.metrics.interferenceThreshold).toBe('number');
    }
  });

  it('headquarters has the strictest uptime threshold (99.9%)', () => {
    const hq = DEFAULT_CONTEXTS.find((c) => c.id === 'headquarters')!;
    expect(hq.metrics.apUptimeThreshold).toBe(99.9);
  });

  it('warehouse has the most lenient signal-quality threshold', () => {
    const warehouse = DEFAULT_CONTEXTS.find((c) => c.id === 'warehouse')!;
    expect(warehouse.metrics.signalQualityThreshold).toBe(-75);
  });
});
