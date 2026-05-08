import { describe, it, expect } from 'vitest';
import {
  normalizePublicLookupQuery,
  generateEstimatedFloorHeights,
  getMockPublicLookupResults,
  searchPublicLookup,
  effectiveFloorsAboveGround,
  effectiveTypicalFloorHeightFt,
  effectiveFloorHeightAboveGroundFt,
} from './publicLookupService';

describe('normalizePublicLookupQuery', () => {
  it('trims, lowercases, and collapses whitespace', () => {
    expect(normalizePublicLookupQuery('  Comcast   Center  ')).toBe('comcast center');
    expect(normalizePublicLookupQuery('MTCC')).toBe('mtcc');
  });

  it('returns empty string for an empty / whitespace-only input', () => {
    expect(normalizePublicLookupQuery('')).toBe('');
    expect(normalizePublicLookupQuery('   ')).toBe('');
  });
});

describe('generateEstimatedFloorHeights', () => {
  it('produces N entries 1..N with cumulative heights', () => {
    const out = generateEstimatedFloorHeights(3, 10);
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({ floor: 1, estimatedHeightAboveGroundFt: 0 });
    expect(out[1]).toEqual({ floor: 2, estimatedHeightAboveGroundFt: 10 });
    expect(out[2]).toEqual({ floor: 3, estimatedHeightAboveGroundFt: 20 });
  });

  it('rounds heights to two decimals', () => {
    const out = generateEstimatedFloorHeights(3, 10.123);
    expect(out[1].estimatedHeightAboveGroundFt).toBe(10.12);
    expect(out[2].estimatedHeightAboveGroundFt).toBe(20.25);
  });

  it('floors fractional N and clamps to 0 minimum', () => {
    expect(generateEstimatedFloorHeights(2.7, 10)).toHaveLength(2);
    expect(generateEstimatedFloorHeights(-5, 10)).toEqual([]);
  });
});

describe('getMockPublicLookupResults', () => {
  it('returns null for empty queries', () => {
    expect(getMockPublicLookupResults('')).toBeNull();
    expect(getMockPublicLookupResults('   ')).toBeNull();
  });

  it('matches "comcast" alias variants and returns Comcast Center Campus', () => {
    expect(getMockPublicLookupResults('Comcast')!.organizationName).toBe('Comcast Center Campus');
    expect(getMockPublicLookupResults('Comcast Philadelphia')!.organizationName).toBe(
      'Comcast Center Campus'
    );
  });

  it('matches "MTCC" alias variants and returns Metro Toronto Convention Centre', () => {
    expect(getMockPublicLookupResults('MTCC')!.organizationName).toBe(
      'Metro Toronto Convention Centre'
    );
    expect(getMockPublicLookupResults('Metro Toronto Convention Centre')!.organizationName).toBe(
      'Metro Toronto Convention Centre'
    );
  });

  it('returns null for queries that match no demo entry', () => {
    expect(getMockPublicLookupResults('made-up search term')).toBeNull();
  });

  it('hydrated result carries isDemoData and requiresUserValidation flags', () => {
    const r = getMockPublicLookupResults('Comcast')!;
    expect(r.isDemoData).toBe(true);
    expect(r.requiresUserValidation).toBe(true);
  });

  it('returned buildings have an estimatedFloors array of length floorsAboveGround', () => {
    const r = getMockPublicLookupResults('Comcast')!;
    const first = r.buildings[0];
    expect(first.estimatedFloors).toHaveLength(first.estimatedFloorsAboveGround);
  });
});

describe('searchPublicLookup', () => {
  it('proxies to getMockPublicLookupResults via Promise', async () => {
    const r = await searchPublicLookup('comcast');
    expect(r?.organizationName).toBe('Comcast Center Campus');
    expect(await searchPublicLookup('nope')).toBeNull();
  });
});

describe('effective* helpers (override → estimated fallback)', () => {
  it('effectiveFloorsAboveGround prefers the override', () => {
    expect(
      effectiveFloorsAboveGround({
        estimatedFloorsAboveGround: 30,
        overriddenFloorsAboveGround: 25,
      } as Parameters<typeof effectiveFloorsAboveGround>[0])
    ).toBe(25);
  });

  it('effectiveFloorsAboveGround falls back to estimate when no override', () => {
    expect(
      effectiveFloorsAboveGround({
        estimatedFloorsAboveGround: 30,
      } as Parameters<typeof effectiveFloorsAboveGround>[0])
    ).toBe(30);
  });

  it('effectiveTypicalFloorHeightFt: override beats estimate', () => {
    expect(
      effectiveTypicalFloorHeightFt({
        estimatedTypicalFloorHeightFt: 12,
        overriddenTypicalFloorHeightFt: 14,
      } as Parameters<typeof effectiveTypicalFloorHeightFt>[0])
    ).toBe(14);
  });

  it('effectiveFloorHeightAboveGroundFt: override beats estimate', () => {
    expect(
      effectiveFloorHeightAboveGroundFt({
        floor: 3,
        estimatedHeightAboveGroundFt: 30,
        overriddenHeightAboveGroundFt: 33,
      } as Parameters<typeof effectiveFloorHeightAboveGroundFt>[0])
    ).toBe(33);
  });
});
