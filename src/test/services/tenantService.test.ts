/**
 * Tests for tenantService — focuses on synchronous getters/setters,
 * URL resolution, and the per-site-group credential cache. The Supabase
 * paths (Organizations CRUD, ControllerCredentials) are skipped because
 * they require a real backend; the local-storage paths are what the app
 * actually exercises in dev mode.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.stubEnv('VITE_SUPABASE_URL', 'https://placeholder.supabase.co');

const { tenantService } = await import('../../services/tenantService');
import type { Controller } from '../../services/tenantService';

function installLocalStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      get length() {
        return store.size;
      },
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => store.set(k, String(v)),
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
    },
  });
}

beforeEach(() => {
  installLocalStorage();
  // Reset any in-memory state on the singleton between tests
  tenantService.setCurrentController(null);
});

function makeController(overrides: Partial<Controller> = {}): Controller {
  return {
    id: 'c-1',
    org_id: 'org-1',
    name: 'Lab Controller',
    url: 'controller.example.com',
    port: 443,
    is_active: true,
    is_default: false,
    connection_status: 'unknown',
    ...overrides,
  };
}

describe('tenantService.setCurrentController + getCurrentController', () => {
  it('round-trips a controller through the singleton', () => {
    const c = makeController();
    tenantService.setCurrentController(c);
    expect(tenantService.getCurrentController()?.id).toBe('c-1');
  });

  it('null clears the current controller', () => {
    tenantService.setCurrentController(makeController());
    tenantService.setCurrentController(null);
    expect(tenantService.getCurrentController()).toBeNull();
  });

  it('dispatches a controllerChanged window event with the new controller', () => {
    const handler = vi.fn();
    window.addEventListener('controllerChanged', handler as EventListener);
    const c = makeController({ id: 'c-2' });
    tenantService.setCurrentController(c);
    expect(handler).toHaveBeenCalled();
    const ev = handler.mock.calls[0][0] as CustomEvent;
    expect(ev.detail).toEqual(c);
    window.removeEventListener('controllerChanged', handler as EventListener);
  });
});

describe('tenantService.getControllerUrl', () => {
  it('returns null when no controller is selected', () => {
    expect(tenantService.getControllerUrl()).toBeNull();
  });

  it('prepends https:// and the port when the URL is bare hostname', () => {
    tenantService.setCurrentController(
      makeController({ url: 'controller.example.com', port: 8443 })
    );
    expect(tenantService.getControllerUrl()).toBe('https://controller.example.com:8443');
  });

  it('keeps an explicit https:// scheme but appends the port if absent', () => {
    tenantService.setCurrentController(
      makeController({ url: 'https://controller.example.com', port: 8443 })
    );
    expect(tenantService.getControllerUrl()).toBe('https://controller.example.com:8443');
  });

  it('does not double-append the port when the URL already includes one', () => {
    tenantService.setCurrentController(
      makeController({ url: 'https://controller.example.com:9443', port: 8443 })
    );
    expect(tenantService.getControllerUrl()).toBe('https://controller.example.com:9443');
  });

  it('defaults to port 443 when none is set on the controller', () => {
    tenantService.setCurrentController(makeController({ url: 'host', port: undefined }));
    expect(tenantService.getControllerUrl()).toBe('https://host:443');
  });
});

describe('tenantService — site-group login cache (base64-encoded)', () => {
  it('saves and reads back a credential pair', () => {
    tenantService.saveSiteGroupLogin('c-1', 'admin', 'p@ss');
    expect(tenantService.getSiteGroupLogin('c-1')).toEqual({ username: 'admin', password: 'p@ss' });
  });

  it('returns null when no credential is stored', () => {
    expect(tenantService.getSiteGroupLogin('not-set')).toBeNull();
  });

  it('clearSiteGroupLogin removes the stored credential', () => {
    tenantService.saveSiteGroupLogin('c-1', 'admin', 'p@ss');
    tenantService.clearSiteGroupLogin('c-1');
    expect(tenantService.getSiteGroupLogin('c-1')).toBeNull();
  });

  it('returns null on corrupted base64 instead of throwing', () => {
    localStorage.setItem('sg_login_bad', '%%not-base64%%');
    expect(tenantService.getSiteGroupLogin('bad')).toBeNull();
  });

  it('isolates credentials by controllerId', () => {
    tenantService.saveSiteGroupLogin('c-1', 'admin1', 'p1');
    tenantService.saveSiteGroupLogin('c-2', 'admin2', 'p2');
    expect(tenantService.getSiteGroupLogin('c-1')).toEqual({ username: 'admin1', password: 'p1' });
    expect(tenantService.getSiteGroupLogin('c-2')).toEqual({ username: 'admin2', password: 'p2' });
  });
});

describe('tenantService.addQuickController', () => {
  it('returns a controller with a fresh UUID and the supplied name + url', () => {
    const c = tenantService.addQuickController('Lab', 'lab.example.com');
    expect(c.name).toBe('Lab');
    expect(c.url).toBe('lab.example.com');
    expect(c.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(c.is_active).toBe(true);
    expect(c.connection_status).toBe('unknown');
  });

  it('persists the new controller to localStorage so it survives a reload', () => {
    const c = tenantService.addQuickController('Lab', 'lab.example.com');
    const raw = localStorage.getItem('api_controllers');
    expect(raw).toBeTruthy();
    const all = JSON.parse(raw!);
    expect(all.some((x: Controller) => x.id === c.id)).toBe(true);
  });
});
