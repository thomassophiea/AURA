import { describe, it, expect } from 'vitest';
import { TOOLS, getToolSpecs, getTool, isKnownTool } from './toolCatalog.js';

describe('Ultr0n tool catalog', () => {
  it('exports the core read-only tools', () => {
    const names = Object.keys(TOOLS);
    for (const required of [
      'listSites',
      'getSiteHealth',
      'listAps',
      'getApDetail',
      'getApRfStats',
      'listClients',
      'getClientDetail',
      'getClientEvents',
      'listServices',
      'getAuditLogs',
    ]) {
      expect(names).toContain(required);
    }
  });

  it('each tool has a valid spec, method, and buildPath', () => {
    for (const [name, tool] of Object.entries(TOOLS)) {
      expect(tool.spec.name).toBe(name);
      expect(typeof tool.spec.description).toBe('string');
      expect(tool.spec.parameters.type).toBe('object');
      expect(['GET']).toContain(tool.method);
      expect(typeof tool.buildPath).toBe('function');
    }
  });

  it('does not expose any write/destructive tools', () => {
    for (const tool of Object.values(TOOLS)) {
      expect(['POST', 'PUT', 'DELETE', 'PATCH']).not.toContain(tool.method);
    }
  });

  it('getToolSpecs returns specs only (no buildPath/method leakage)', () => {
    const specs = getToolSpecs();
    expect(specs.length).toBe(Object.keys(TOOLS).length);
    for (const spec of specs) {
      expect(spec).not.toHaveProperty('buildPath');
      expect(spec).not.toHaveProperty('method');
    }
  });

  it('isKnownTool returns true for catalog entries and false for unknown', () => {
    expect(isKnownTool('listSites')).toBe(true);
    expect(isKnownTool('totally-fake-tool')).toBe(false);
  });

  it('encodes arguments safely in buildPath', () => {
    const path = getTool('getClientDetail').buildPath({ mac: 'aa:bb:cc:dd:ee:ff' });
    expect(path).toBe('/v1/stations/aa%3Abb%3Acc%3Add%3Aee%3Aff');
  });

  it('listClients picks the right path based on filters', () => {
    expect(getTool('listClients').buildPath({})).toBe('/v1/stations/query');
    expect(getTool('listClients').buildPath({ siteId: 's-1' })).toBe('/v3/sites/s-1/stations');
    expect(getTool('listClients').buildPath({ serviceId: 'svc-1' })).toBe(
      '/v1/services/svc-1/stations'
    );
  });
});
