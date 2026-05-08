import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadReportConfigs,
  saveReportConfigs,
  exportConfigAsJSON,
  importConfigFromJSON,
  generateSharePayload,
  parseSharePayload,
} from './reportConfigPersistence';
import type { ReportConfig, ReportConfigStore } from '../types/reportConfig';

// Minimal in-memory localStorage shim. The jsdom environment may not provide
// a writable localStorage in all test setups, so we install our own.
function installLocalStorageStub() {
  const store = new Map<string, string>();
  const stub = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => {
      store.clear();
    },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
  vi.stubGlobal('localStorage', stub);
  return stub;
}

const minimalConfig = (id: string, name = 'Test'): ReportConfig =>
  ({
    id,
    name,
    description: '',
    createdAt: 1,
    updatedAt: 1,
    pages: [],
    isDefault: false,
  }) as unknown as ReportConfig;

beforeEach(() => {
  installLocalStorageStub();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  // Stub crypto.randomUUID with a typed-correct value (lib.dom expects a
  // 5-segment UUID literal type).
  const fakeUuid =
    '00000000-0000-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`;
  if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.randomUUID) {
    vi.stubGlobal('crypto', { randomUUID: () => fakeUuid });
  } else {
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(fakeUuid);
  }
});

describe('loadReportConfigs', () => {
  it('returns the default store when localStorage is empty', () => {
    const store = loadReportConfigs();
    expect(store.version).toBe(2);
    expect(store.configs).toHaveLength(1);
    expect(store.configs[0].id).toBe('default');
    expect(store.activeConfigId).toBe('default');
  });

  it('returns the default store when stored value is invalid JSON', () => {
    localStorage.setItem('aura_report_configs', '{not json');
    const store = loadReportConfigs();
    expect(store.version).toBe(2);
    expect(console.error).toHaveBeenCalled();
  });

  it('returns the default store when stored shape is missing required fields', () => {
    localStorage.setItem('aura_report_configs', JSON.stringify({}));
    const store = loadReportConfigs();
    expect(store.version).toBe(2);
  });

  it('returns the default store when configs array is empty', () => {
    localStorage.setItem(
      'aura_report_configs',
      JSON.stringify({ version: 2, configs: [], activeConfigId: 'x', lastModified: 0 })
    );
    const store = loadReportConfigs();
    expect(store.version).toBe(2);
    expect(store.configs.length).toBeGreaterThan(0);
  });

  it('prepends the default config when missing', () => {
    const stored: ReportConfigStore = {
      version: 2,
      configs: [minimalConfig('custom-1', 'Custom')],
      activeConfigId: 'custom-1',
      lastModified: 0,
    } as ReportConfigStore;
    localStorage.setItem('aura_report_configs', JSON.stringify(stored));
    const store = loadReportConfigs();
    expect(store.configs[0].id).toBe('default');
    expect(store.configs.find((c) => c.id === 'custom-1')).toBeDefined();
  });

  it('falls back activeConfigId when it points to a missing config', () => {
    const stored = {
      version: 2,
      configs: [minimalConfig('default'), minimalConfig('a')],
      activeConfigId: 'does-not-exist',
      lastModified: 0,
    };
    localStorage.setItem('aura_report_configs', JSON.stringify(stored));
    const store = loadReportConfigs();
    expect(store.configs.map((c) => c.id)).toContain(store.activeConfigId);
  });

  it('migrates v1 → v2: pie_chart displayType becomes bar_chart', () => {
    const v1 = {
      version: 1,
      activeConfigId: 'default',
      lastModified: 0,
      configs: [
        {
          ...minimalConfig('default'),
          pages: [
            {
              id: 'p1',
              title: 'P',
              widgets: [
                { id: 'w1', widgetKey: 'k', source: 'platform_report', displayType: 'pie_chart' },
                { id: 'w2', widgetKey: 'k', source: 'platform_report', displayType: 'bar_chart' },
              ],
            },
          ],
        },
      ],
    };
    localStorage.setItem('aura_report_configs', JSON.stringify(v1));
    const store = loadReportConfigs();
    expect(store.version).toBe(2);
    const widgets = store.configs[0].pages[0].widgets;
    expect(widgets[0].displayType).toBe('bar_chart');
    expect(widgets[1].displayType).toBe('bar_chart');
  });
});

describe('saveReportConfigs', () => {
  it('writes to localStorage and stamps lastModified', () => {
    const before = Date.now() - 1;
    const store: ReportConfigStore = {
      version: 2,
      configs: [minimalConfig('default')],
      activeConfigId: 'default',
      lastModified: 0,
    };
    saveReportConfigs(store);
    const raw = localStorage.getItem('aura_report_configs');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.lastModified).toBeGreaterThanOrEqual(before);
  });

  it('swallows errors when localStorage rejects (e.g. quota exceeded)', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    });
    expect(() =>
      saveReportConfigs({
        version: 2,
        configs: [minimalConfig('default')],
        activeConfigId: 'default',
        lastModified: 0,
      })
    ).not.toThrow();
    expect(console.error).toHaveBeenCalled();
  });
});

describe('exportConfigAsJSON / importConfigFromJSON', () => {
  it('exportConfigAsJSON returns 2-space-indented JSON', () => {
    const c = minimalConfig('a');
    const json = exportConfigAsJSON(c);
    expect(json).toContain('\n');
    expect(json).toContain('  '); // indent
    expect(JSON.parse(json).id).toBe('a');
  });

  it('importConfigFromJSON returns null on malformed JSON', () => {
    expect(importConfigFromJSON('{not')).toBeNull();
  });

  it('importConfigFromJSON returns null on missing required fields', () => {
    expect(importConfigFromJSON('{"id":"a"}')).toBeNull();
    expect(importConfigFromJSON('{"id":"a","name":"x"}')).toBeNull();
    expect(importConfigFromJSON('{"id":"a","name":"x","pages":"not-array"}')).toBeNull();
  });

  it('importConfigFromJSON assigns a fresh id, timestamps, and clears isDefault', () => {
    const original = minimalConfig('orig-id', 'Imported');
    const restored = importConfigFromJSON(JSON.stringify(original));
    expect(restored).not.toBeNull();
    expect(restored!.id).not.toBe('orig-id');
    expect(restored!.id).toBe('00000000-0000-0000-0000-000000000000');
    expect(restored!.isDefault).toBe(false);
    expect(restored!.createdAt).toBeGreaterThan(0);
    expect(restored!.updatedAt).toBeGreaterThan(0);
  });
});

describe('generateSharePayload / parseSharePayload', () => {
  it('round-trips a config-only (v1 legacy) share payload', () => {
    const config = minimalConfig('a', 'Demo');
    const encoded = generateSharePayload(config);
    expect(typeof encoded).toBe('string');
    const parsed = parseSharePayload(encoded);
    expect(parsed).not.toBeNull();
    expect(parsed!.config.name).toBe('Demo');
    expect(parsed!.snapshot).toBeNull();
    // Shared id should be reassigned to "shared-..." prefix.
    expect(parsed!.config.id).toMatch(/^shared-/);
  });

  it('round-trips a v2 payload with snapshot', () => {
    const config = minimalConfig('a');
    const snapshot = {
      metrics: { ap: 5 },
      widgetData: { foo: { bar: 1 } },
      generatedAt: '2026-05-08T00:00:00Z',
    };
    const encoded = generateSharePayload(config, snapshot);
    const parsed = parseSharePayload(encoded);
    expect(parsed).not.toBeNull();
    expect(parsed!.snapshot).not.toBeNull();
    expect(parsed!.snapshot!.metrics).toEqual({ ap: 5 });
  });

  it('parseSharePayload returns null for non-base64 garbage', () => {
    expect(parseSharePayload('not-a-payload!')).toBeNull();
  });

  it('parseSharePayload returns null when name is missing', () => {
    const encoded = btoa(JSON.stringify({ id: 'x', pages: [] }));
    expect(parseSharePayload(encoded)).toBeNull();
  });

  it('parseSharePayload returns null when pages is not an array', () => {
    const encoded = btoa(JSON.stringify({ id: 'x', name: 'x', pages: 'no' }));
    expect(parseSharePayload(encoded)).toBeNull();
  });
});
