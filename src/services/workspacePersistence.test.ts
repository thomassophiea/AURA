import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the WIDGET_CATALOG so hydrateWidgetFromReference has a deterministic input.
vi.mock('@/hooks/useWorkspace', () => ({
  WIDGET_CATALOG: [
    {
      id: 'cat-1',
      type: 'kpi_tile',
      topic: 'ConnectedClients',
      title: 'Catalog Title',
      description: 'd',
      columns: [],
      dataBinding: { endpointRef: 'access_points.list' },
      interaction: undefined,
    },
  ],
}));

beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  });
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-05-07T15:00:00Z'));
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

import {
  loadWorkspaceState,
  saveWorkspaceState,
  saveWidgetToWorkspace,
  removeWidgetFromWorkspace,
  isWidgetSavedToWorkspace,
  getSavedWidgets,
  updateSavedWidget,
  hydrateWidgetFromReference,
  createWidgetReference,
  generateSavedWidgetId,
  debouncedSaveState,
  type PersistedWidgetReference,
} from './workspacePersistence';

const STORAGE_KEY = 'workspace_saved_widgets';

const validWidget = (
  overrides: Partial<PersistedWidgetReference> = {}
): PersistedWidgetReference => ({
  widget_id: 'w-1',
  widget_type: 'kpi_tile',
  title: 'My Widget',
  data_endpoint_refs: ['access_points.summary'],
  saved_at: 0,
  ...overrides,
});

describe('loadWorkspaceState / saveWorkspaceState', () => {
  it('returns null when nothing is stored', () => {
    expect(loadWorkspaceState()).toBeNull();
  });

  it('saves state and reads it back', () => {
    const state = {
      version: 1,
      widgets: [validWidget()],
      last_modified: 0,
    };
    expect(saveWorkspaceState(state)).toBe(true);
    const loaded = loadWorkspaceState();
    expect(loaded?.widgets[0].widget_id).toBe('w-1');
  });

  it('returns null for corrupted JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not-json');
    expect(loadWorkspaceState()).toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });
});

describe('saveWidgetToWorkspace', () => {
  it('creates a new state when none exists and persists the widget', () => {
    const ok = saveWidgetToWorkspace(validWidget());
    expect(ok).toBe(true);
    expect(getSavedWidgets()).toHaveLength(1);
  });

  it('updates an existing widget rather than duplicating it', () => {
    saveWidgetToWorkspace(validWidget({ title: 'A' }));
    saveWidgetToWorkspace(validWidget({ title: 'B' }));
    const widgets = getSavedWidgets();
    expect(widgets).toHaveLength(1);
    expect(widgets[0].title).toBe('B');
  });

  it('refuses to save a widget missing required fields', () => {
    const bad = { ...validWidget(), title: '' };
    expect(saveWidgetToWorkspace(bad)).toBe(false);
    expect(getSavedWidgets()).toHaveLength(0);
  });

  it('refuses to save when no data_endpoint_refs are provided', () => {
    const bad = { ...validWidget(), data_endpoint_refs: [] };
    expect(saveWidgetToWorkspace(bad)).toBe(false);
  });

  it('refuses to save when endpoint refs are not from a wireless prefix', () => {
    const bad = validWidget({ data_endpoint_refs: ['unknown.thing'] });
    expect(saveWidgetToWorkspace(bad)).toBe(false);
  });
});

describe('removeWidgetFromWorkspace', () => {
  it('returns true if state is missing (idempotent)', () => {
    expect(removeWidgetFromWorkspace('does-not-exist')).toBe(true);
  });

  it('removes a saved widget by id', () => {
    saveWidgetToWorkspace(validWidget());
    expect(removeWidgetFromWorkspace('w-1')).toBe(true);
    expect(getSavedWidgets()).toHaveLength(0);
  });

  it('is a no-op when the id is not in saved widgets', () => {
    saveWidgetToWorkspace(validWidget());
    expect(removeWidgetFromWorkspace('not-there')).toBe(true);
    expect(getSavedWidgets()).toHaveLength(1);
  });
});

describe('isWidgetSavedToWorkspace + getSavedWidgets', () => {
  it('isWidgetSavedToWorkspace reports membership accurately', () => {
    expect(isWidgetSavedToWorkspace('w-1')).toBe(false);
    saveWidgetToWorkspace(validWidget());
    expect(isWidgetSavedToWorkspace('w-1')).toBe(true);
  });

  it('getSavedWidgets returns [] when state is missing', () => {
    expect(getSavedWidgets()).toEqual([]);
  });
});

describe('updateSavedWidget', () => {
  it('returns false when state is missing', () => {
    expect(updateSavedWidget('w-1', { title: 'X' })).toBe(false);
  });

  it('returns false when widget id is not present', () => {
    saveWidgetToWorkspace(validWidget());
    expect(updateSavedWidget('not-there', { title: 'X' })).toBe(false);
  });

  it('merges updates into the existing widget and persists', () => {
    saveWidgetToWorkspace(validWidget());
    expect(updateSavedWidget('w-1', { title: 'Updated' })).toBe(true);
    expect(getSavedWidgets()[0].title).toBe('Updated');
  });
});

describe('hydrateWidgetFromReference', () => {
  it('uses catalogId when provided', () => {
    const ref = validWidget({ catalog_id: 'cat-1' });
    const out = hydrateWidgetFromReference(ref);
    expect(out?.id).toBe('w-1');
    expect(out?.catalogId).toBe('cat-1');
    expect(out?.title).toBe('My Widget');
  });

  it('falls back to endpoint-based catalog lookup', () => {
    const ref = validWidget({
      catalog_id: undefined,
      data_endpoint_refs: ['access_points.list'],
    });
    const out = hydrateWidgetFromReference(ref);
    expect(out?.catalogId).toBe('cat-1');
  });

  it('creates a generic widget when no catalog item is found', () => {
    const ref = validWidget({
      catalog_id: 'unknown',
      data_endpoint_refs: ['unknown.thing'],
    });
    const out = hydrateWidgetFromReference(ref);
    expect(out?.title).toBe('My Widget');
    expect(out?.catalogId).toBe('unknown');
  });
});

describe('createWidgetReference + generateSavedWidgetId', () => {
  it('createWidgetReference attaches saved_at and merges options', () => {
    const ref = createWidgetReference('w-99', 'kpi_tile', 'New', ['clients.list'], {
      filters: { x: 1 },
    });
    expect(ref.widget_id).toBe('w-99');
    expect(ref.title).toBe('New');
    expect(ref.filters).toEqual({ x: 1 });
    expect(ref.saved_at).toBeGreaterThan(0);
  });

  it('generateSavedWidgetId produces a unique-ish id with the source prefix', () => {
    const a = generateSavedWidgetId('dashboard', 'kpi');
    const b = generateSavedWidgetId('dashboard', 'kpi');
    expect(a.startsWith('saved_dashboard_kpi_')).toBe(true);
    expect(a).not.toBe(b);
  });
});

describe('debouncedSaveState', () => {
  it('delays the save by the configured interval', () => {
    const state = {
      version: 1,
      widgets: [validWidget()],
      last_modified: 0,
    };
    debouncedSaveState(state, 500);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    vi.advanceTimersByTime(500);
    expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy();
  });

  it('coalesces rapid successive calls into a single save', () => {
    const state1 = { version: 1, widgets: [validWidget({ title: 'A' })], last_modified: 0 };
    const state2 = { version: 1, widgets: [validWidget({ title: 'B' })], last_modified: 0 };
    debouncedSaveState(state1, 200);
    debouncedSaveState(state2, 200);
    vi.advanceTimersByTime(250);
    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(persisted.widgets[0].title).toBe('B');
  });
});
