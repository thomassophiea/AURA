/**
 * Tests for globalElementsService — focus on the localStorage fallback path
 * (Supabase unconfigured) because that's the path most users hit in dev/no-cloud
 * mode, and the CSV import/export which is pure logic.
 *
 * The service auto-detects Supabase via VITE_SUPABASE_URL containing the word
 * "placeholder". The default vite config in this repo uses placeholder values,
 * so under vitest the service runs in localStorage-only mode by default.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the Supabase client so any accidental "configured" path becomes a
// loud failure rather than a silent network call.
vi.mock('../../services/supabaseClient', () => ({
  supabase: {
    from: () => {
      throw new Error('Supabase should not be reached in test mode');
    },
  },
}));

// Force the placeholder URL so _isSupabaseConfigured returns false.
vi.stubEnv('VITE_SUPABASE_URL', 'https://placeholder.supabase.co');

const { globalElementsService } = await import('../../services/globalElementsService');
import type {
  GlobalElementTemplate,
  PersistedVariableDefinition,
  VariableValue,
} from '../../types/globalElements';

const ORG = 'org-test';

// jsdom's localStorage shim doesn't expose .clear() consistently. Replace with
// an in-memory implementation that supports the methods the service uses.
function installLocalStorageMock() {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      get length() {
        return store.size;
      },
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
    },
  });
}

beforeEach(() => {
  installLocalStorageMock();
});

// ─── Templates (localStorage path) ────────────────────────────────────────────

describe('GlobalElementsService — templates (localStorage)', () => {
  it('createTemplate persists to localStorage and getTemplates returns it', async () => {
    const created = await globalElementsService.createTemplate({
      org_id: ORG,
      name: 'Corp WLAN',
      element_type: 'service',
      config_payload: { ssid: '{{ssid_name}}' },
      is_active: true,
      tags: ['promoted'],
    });
    expect(created.id).toBeTruthy();
    expect(created.version).toBe(1);

    const list = await globalElementsService.getTemplates(ORG);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Corp WLAN');
  });

  it('getTemplates filters by element_type when provided', async () => {
    await globalElementsService.createTemplate({
      org_id: ORG,
      name: 'A',
      element_type: 'service',
      config_payload: {},
      is_active: true,
      tags: [],
    });
    await globalElementsService.createTemplate({
      org_id: ORG,
      name: 'B',
      element_type: 'topology',
      config_payload: {},
      is_active: true,
      tags: [],
    });
    const services = await globalElementsService.getTemplates(ORG, 'service');
    expect(services.map((t) => t.name)).toEqual(['A']);
    const topos = await globalElementsService.getTemplates(ORG, 'topology');
    expect(topos.map((t) => t.name)).toEqual(['B']);
  });

  it('updateTemplate merges fields and bumps updated_at', async () => {
    const created = await globalElementsService.createTemplate({
      org_id: ORG,
      name: 'Original',
      element_type: 'service',
      config_payload: { ssid: 'old' },
      is_active: true,
      tags: [],
    });
    const before = created.updated_at;
    // small delay so updated_at differs
    await new Promise((r) => setTimeout(r, 5));
    const updated = await globalElementsService.updateTemplate(created.id, {
      name: 'Renamed',
      config_payload: { ssid: 'new' },
    });
    expect(updated.name).toBe('Renamed');
    expect((updated.config_payload as { ssid: string }).ssid).toBe('new');
    expect(updated.updated_at).not.toBe(before);
  });

  it('deleteTemplate removes the entry from cache', async () => {
    const t = await globalElementsService.createTemplate({
      org_id: ORG,
      name: 'X',
      element_type: 'service',
      config_payload: {},
      is_active: true,
      tags: [],
    });
    await globalElementsService.deleteTemplate(t.id);
    const list = await globalElementsService.getTemplates(ORG);
    expect(list).toEqual([]);
  });

  it('duplicateTemplate copies config_payload and creates a new id', async () => {
    const t = await globalElementsService.createTemplate({
      org_id: ORG,
      name: 'Source',
      element_type: 'service',
      config_payload: { ssid: '{{name}}' },
      is_active: true,
      tags: ['promoted'],
    });
    const copy = await globalElementsService.duplicateTemplate(t.id, 'Source (copy)');
    expect(copy.id).not.toBe(t.id);
    expect(copy.name).toBe('Source (copy)');
    expect(copy.config_payload).toEqual(t.config_payload);
  });
});

// ─── CSV export ───────────────────────────────────────────────────────────────

describe('GlobalElementsService.exportVariablesCsv', () => {
  const defs: PersistedVariableDefinition[] = [
    { id: 'd1', org_id: ORG, name: 'Employee VLAN', token: 'employee_vlan', type: 'vlan' },
    { id: 'd2', org_id: ORG, name: 'SSID Name', token: 'ssid_name', type: 'string' },
  ];

  it('produces a header row plus one row per value, joining on variable_id', () => {
    const values: VariableValue[] = [
      {
        id: 'v1',
        org_id: ORG,
        variable_id: 'd1',
        scope_type: 'organization',
        scope_id: ORG,
        value: '100',
        source_type: 'override',
      },
      {
        id: 'v2',
        org_id: ORG,
        variable_id: 'd2',
        scope_type: 'organization',
        scope_id: ORG,
        value: 'corp',
        source_type: 'override',
      },
    ];
    const csv = globalElementsService.exportVariablesCsv(defs, values);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Variable,Token,Value');
    expect(lines).toHaveLength(3);
    expect(lines).toContain('Employee VLAN,{{employee_vlan}},100');
    expect(lines).toContain('SSID Name,{{ssid_name}},corp');
  });

  it('quotes values that contain a comma', () => {
    const values: VariableValue[] = [
      {
        id: 'v1',
        org_id: ORG,
        variable_id: 'd2',
        scope_type: 'organization',
        scope_id: ORG,
        value: 'a, b, c',
        source_type: 'override',
      },
    ];
    const csv = globalElementsService.exportVariablesCsv(defs, values);
    expect(csv).toContain('SSID Name,{{ssid_name}},"a, b, c"');
  });

  it('skips values whose variable_id has no matching definition', () => {
    const values: VariableValue[] = [
      {
        id: 'v1',
        org_id: ORG,
        variable_id: 'orphan-id',
        scope_type: 'organization',
        scope_id: ORG,
        value: 'x',
        source_type: 'override',
      },
    ];
    const csv = globalElementsService.exportVariablesCsv(defs, values);
    expect(csv).toBe('Variable,Token,Value'); // header only
  });
});

// ─── CSV import ───────────────────────────────────────────────────────────────

describe('GlobalElementsService.parseCsvImport', () => {
  const defs: PersistedVariableDefinition[] = [
    { id: 'd1', org_id: ORG, name: 'Employee VLAN', token: 'employee_vlan', type: 'vlan' },
    { id: 'd2', org_id: ORG, name: 'SSID Name', token: 'ssid_name', type: 'string' },
  ];

  it('parses a well-formed CSV into VariableValue rows scoped to the supplied scope', () => {
    const csv = `Variable,Token,Value
Employee VLAN,{{employee_vlan}},100
SSID Name,{{ssid_name}},corp`;
    const result = globalElementsService.parseCsvImport(csv, defs, ORG, 'site_group', 'sg-1');
    expect(result.errors).toEqual([]);
    expect(result.values).toHaveLength(2);
    expect(result.values[0]).toMatchObject({
      org_id: ORG,
      variable_id: 'd1',
      scope_type: 'site_group',
      scope_id: 'sg-1',
      value: '100',
      source_type: 'imported',
    });
  });

  it('reports an error for unknown tokens and continues', () => {
    const csv = `Variable,Token,Value
Mystery,{{not_real}},42
SSID Name,{{ssid_name}},corp`;
    const result = globalElementsService.parseCsvImport(csv, defs, ORG, 'organization', ORG);
    expect(result.values).toHaveLength(1);
    expect(result.values[0].variable_id).toBe('d2');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('not_real');
  });

  it('reports an error when a row has fewer than 3 columns', () => {
    const csv = `Variable,Token,Value
Bad row,{{employee_vlan}}`;
    const result = globalElementsService.parseCsvImport(csv, defs, ORG, 'organization', ORG);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('expected 3 columns');
    expect(result.values).toEqual([]);
  });

  it('handles quoted values with embedded commas', () => {
    const csv = `Variable,Token,Value
SSID Name,{{ssid_name}},"a, b, c"`;
    const result = globalElementsService.parseCsvImport(csv, defs, ORG, 'organization', ORG);
    expect(result.errors).toEqual([]);
    expect(result.values[0].value).toBe('a, b, c');
  });
});
