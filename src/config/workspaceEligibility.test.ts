import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ELIGIBLE_ENDPOINT_PREFIXES,
  ELIGIBLE_WIDGET_TYPES,
  INELIGIBLE_WIDGET_IDS,
  WIDGET_ELIGIBILITY_REGISTRY,
  checkWidgetEligibility,
  canHydrateInWorkspace,
  getWidgetEligibilityInfo,
  listEligibleWidgets,
  listWidgetsRequiringContext,
} from './workspaceEligibility';

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('eligibility registry shape', () => {
  it('every registry entry with isEligible=true has an endpoint + catalog + hydration path', () => {
    for (const [id, info] of Object.entries(WIDGET_ELIGIBILITY_REGISTRY)) {
      if (!info.isEligible) continue;
      expect(info.endpointRef, `${id}.endpointRef`).toBeTruthy();
      expect(info.catalogId, `${id}.catalogId`).toBeTruthy();
      expect(info.hydrationPath, `${id}.hydrationPath`).toBeTruthy();
    }
  });

  it('all eligible widget types are non-empty strings', () => {
    expect(ELIGIBLE_WIDGET_TYPES.length).toBeGreaterThan(0);
    for (const t of ELIGIBLE_WIDGET_TYPES) {
      expect(typeof t).toBe('string');
      expect(t.length).toBeGreaterThan(0);
    }
  });

  it('eligible endpoint prefixes are non-empty strings', () => {
    expect(ELIGIBLE_ENDPOINT_PREFIXES.length).toBeGreaterThan(0);
    for (const p of ELIGIBLE_ENDPOINT_PREFIXES) {
      expect(typeof p).toBe('string');
    }
  });

  it('INELIGIBLE_WIDGET_IDS is a Set with documented config widgets', () => {
    expect(INELIGIBLE_WIDGET_IDS).toBeInstanceOf(Set);
    expect(INELIGIBLE_WIDGET_IDS.has('settings-panel')).toBe(true);
    expect(INELIGIBLE_WIDGET_IDS.has('packet-capture')).toBe(true);
  });
});

describe('checkWidgetEligibility', () => {
  it('returns ineligible for widgets in INELIGIBLE_WIDGET_IDS', () => {
    const out = checkWidgetEligibility('settings-panel');
    expect(out.isEligible).toBe(false);
    expect(out.reason).toMatch(/static or configuration/i);
    expect(console.warn).toHaveBeenCalled();
  });

  it('returns the registry entry verbatim for a known widget', () => {
    const out = checkWidgetEligibility('access-points-table');
    expect(out.isEligible).toBe(true);
    expect(out.endpointRef).toBe('access_points.list');
  });

  it('falls through to dynamic check for unknown widget + eligible type + valid endpoint', () => {
    const out = checkWidgetEligibility('made-up-id', 'kpi_tile', ['access_points.foo']);
    expect(out.isEligible).toBe(true);
    expect(out.endpointRef).toBe('access_points.foo');
  });

  it('eligible type but no endpoint → ineligible', () => {
    const out = checkWidgetEligibility('made-up-id', 'kpi_tile');
    expect(out.isEligible).toBe(false);
    expect(out.reason).toMatch(/cannot hydrate/i);
  });

  it('eligible type but endpoint not on prefix list → ineligible', () => {
    const out = checkWidgetEligibility('made-up-id', 'kpi_tile', ['unknown_thing.x']);
    expect(out.isEligible).toBe(false);
  });

  it('completely unknown widget → ineligible', () => {
    const out = checkWidgetEligibility('made-up-id');
    expect(out.isEligible).toBe(false);
    expect(out.reason).toMatch(/not recognized/i);
  });
});

describe('canHydrateInWorkspace', () => {
  it('returns canHydrate=false for widgets not in the registry', () => {
    const out = canHydrateInWorkspace('not-in-registry', {});
    expect(out.canHydrate).toBe(false);
  });

  it('returns canHydrate=true when no required context is needed', () => {
    const out = canHydrateInWorkspace('access-points-table', {});
    expect(out.canHydrate).toBe(true);
  });

  it('returns missing context names when required values are absent', () => {
    const out = canHydrateInWorkspace('ap-channel-utilization', {});
    expect(out.canHydrate).toBe(false);
    expect(out.missingContext).toContain('siteId');
    expect(out.missingContext).toContain('timeRange');
  });

  it('hydrates when all required context is supplied', () => {
    const out = canHydrateInWorkspace('ap-channel-utilization', {
      siteId: 's-1',
      timeRange: '24h',
    });
    expect(out.canHydrate).toBe(true);
  });

  it('treats null siteId as missing', () => {
    const out = canHydrateInWorkspace('ap-channel-utilization', {
      siteId: null,
      timeRange: '24h',
    });
    expect(out.canHydrate).toBe(false);
    expect(out.missingContext).toContain('siteId');
  });
});

describe('helper queries', () => {
  it('getWidgetEligibilityInfo returns the entry or null', () => {
    expect(getWidgetEligibilityInfo('access-points-table')).toBeTruthy();
    expect(getWidgetEligibilityInfo('does-not-exist')).toBeNull();
  });

  it('listEligibleWidgets returns only entries where isEligible=true', () => {
    const ids = listEligibleWidgets();
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(WIDGET_ELIGIBILITY_REGISTRY[id].isEligible).toBe(true);
    }
  });

  it('listWidgetsRequiringContext("siteId") returns site-scoped widgets', () => {
    const ids = listWidgetsRequiringContext('siteId');
    expect(ids).toContain('ap-channel-utilization');
    for (const id of ids) {
      expect(WIDGET_ELIGIBILITY_REGISTRY[id].requiredContext).toContain('siteId');
    }
  });

  it('listWidgetsRequiringContext("clientId") returns client-scoped widgets', () => {
    const ids = listWidgetsRequiringContext('clientId');
    expect(ids).toContain('client-events-timeline');
  });
});
