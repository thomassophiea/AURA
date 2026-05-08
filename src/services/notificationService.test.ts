import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

function installLocalStorageStub() {
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
  return store;
}

beforeEach(() => {
  vi.resetModules();
  installLocalStorageStub();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// Importing the module fresh per-test gives us a clean singleton.
async function freshService() {
  const mod = await import('./notificationService');
  return mod.notificationService;
}

describe('notificationService — preferences', () => {
  it('returns the default preferences when storage is empty', async () => {
    const svc = await freshService();
    const prefs = svc.getPreferences();
    expect(prefs.enabled).toBe(true);
    expect(prefs.apOffline).toBe(true);
    expect(prefs.sleDrops).toBe(true);
    expect(prefs.highClientCount).toBe(false);
    expect(prefs.sleThreshold).toBe(70);
    expect(prefs.clientCountThreshold).toBe(100);
  });

  it('updatePreferences merges and persists', async () => {
    const svc = await freshService();
    svc.updatePreferences({ sleThreshold: 80, highClientCount: true });
    const prefs = svc.getPreferences();
    expect(prefs.sleThreshold).toBe(80);
    expect(prefs.highClientCount).toBe(true);
    expect(prefs.apOffline).toBe(true); // unchanged
    // Persisted via localStorage
    const raw = localStorage.getItem('aura_notification_preferences');
    expect(JSON.parse(raw!).sleThreshold).toBe(80);
  });

  it('returns a defensive copy from getPreferences (no aliasing)', async () => {
    const svc = await freshService();
    const a = svc.getPreferences();
    a.enabled = false;
    expect(svc.getPreferences().enabled).toBe(true);
  });
});

describe('notificationService — checkAPStatus', () => {
  it('emits one notification per newly-offline AP', async () => {
    const svc = await freshService();
    const newOnes = svc.checkAPStatus([
      { id: 'ap-1', status: 'offline', name: 'Lobby' },
      { id: 'ap-2', status: 'online' },
    ]);
    expect(newOnes).toHaveLength(1);
    expect(newOnes[0].type).toBe('ap_offline');
    expect(svc.getAllNotifications()).toHaveLength(1);
  });

  it('does NOT re-emit for an AP that is already known to be offline', async () => {
    const svc = await freshService();
    svc.checkAPStatus([{ id: 'ap-1', status: 'offline' }]);
    svc.checkAPStatus([{ id: 'ap-1', status: 'offline' }]);
    expect(svc.getAllNotifications()).toHaveLength(1);
  });

  it('forgets the offline-state when the AP comes back online', async () => {
    const svc = await freshService();
    svc.checkAPStatus([{ id: 'ap-1', status: 'offline' }]);
    svc.checkAPStatus([{ id: 'ap-1', status: 'online' }]);
    svc.checkAPStatus([{ id: 'ap-1', status: 'offline' }]); // should re-fire
    expect(svc.getAllNotifications()).toHaveLength(2);
  });

  it('returns empty when notifications are disabled globally', async () => {
    const svc = await freshService();
    svc.updatePreferences({ enabled: false });
    expect(svc.checkAPStatus([{ id: 'ap-1', status: 'offline' }])).toEqual([]);
  });

  it('returns empty when AP-offline notifications are disabled', async () => {
    const svc = await freshService();
    svc.updatePreferences({ apOffline: false });
    expect(svc.checkAPStatus([{ id: 'ap-1', status: 'offline' }])).toEqual([]);
  });

  it('treats connected:false as offline', async () => {
    const svc = await freshService();
    expect(svc.checkAPStatus([{ id: 'ap-x', connected: false }])).toHaveLength(1);
  });
});

describe('notificationService — checkSLEs', () => {
  it('fires when an SLE drops below threshold', async () => {
    const svc = await freshService();
    const out = svc.checkSLEs([{ id: 's-1', name: 'WiFi', value: 60 }]);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe('sle_drop');
  });

  it('parses string values', async () => {
    const svc = await freshService();
    expect(svc.checkSLEs([{ id: 's-1', value: '50.4' }])).toHaveLength(1);
  });

  it('does NOT fire for SLEs above threshold', async () => {
    const svc = await freshService();
    expect(svc.checkSLEs([{ id: 's-1', value: 90 }])).toEqual([]);
  });

  it('dedupes within a 10% bucket — second drop in the same bucket is skipped', async () => {
    const svc = await freshService();
    svc.checkSLEs([{ id: 's-1', value: 65 }]); // bucket 6 (65/10 = 6)
    svc.checkSLEs([{ id: 's-1', value: 60 }]); // bucket 6 — skipped
    expect(svc.getAllNotifications()).toHaveLength(1);
  });

  it('re-fires after the 5-minute cooldown elapses', async () => {
    const svc = await freshService();
    svc.checkSLEs([{ id: 's-1', value: 65 }]);
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    svc.checkSLEs([{ id: 's-1', value: 65 }]);
    expect(svc.getAllNotifications()).toHaveLength(2);
  });
});

describe('notificationService — checkHighClientCount', () => {
  it('does not fire by default (preference disabled)', async () => {
    const svc = await freshService();
    expect(svc.checkHighClientCount(200)).toEqual([]);
  });

  it('fires when count exceeds threshold and preference enabled', async () => {
    const svc = await freshService();
    svc.updatePreferences({ highClientCount: true, clientCountThreshold: 100 });
    const out = svc.checkHighClientCount(150, 'Site-A');
    expect(out).toHaveLength(1);
    expect(out[0].message).toContain('150 clients connected');
    expect(out[0].message).toContain('Site-A');
  });

  it('does not fire when count below threshold', async () => {
    const svc = await freshService();
    svc.updatePreferences({ highClientCount: true, clientCountThreshold: 100 });
    expect(svc.checkHighClientCount(50)).toEqual([]);
  });
});

describe('notificationService — read / clear', () => {
  it('getUnreadCount counts only unread', async () => {
    const svc = await freshService();
    svc.checkAPStatus([
      { id: 'a', status: 'offline' },
      { id: 'b', status: 'offline' },
    ]);
    expect(svc.getUnreadCount()).toBe(2);
    svc.markAsRead(svc.getAllNotifications()[0].id);
    expect(svc.getUnreadCount()).toBe(1);
  });

  it('markAllAsRead drops the unread count to 0', async () => {
    const svc = await freshService();
    svc.checkAPStatus([
      { id: 'a', status: 'offline' },
      { id: 'b', status: 'offline' },
    ]);
    svc.markAllAsRead();
    expect(svc.getUnreadCount()).toBe(0);
  });

  it('deleteNotification removes by id', async () => {
    const svc = await freshService();
    svc.checkAPStatus([
      { id: 'a', status: 'offline' },
      { id: 'b', status: 'offline' },
    ]);
    const idToDelete = svc.getAllNotifications()[0].id;
    svc.deleteNotification(idToDelete);
    const ids = svc.getAllNotifications().map((n) => n.id);
    expect(ids).not.toContain(idToDelete);
  });

  it('clearAll empties everything', async () => {
    const svc = await freshService();
    svc.checkAPStatus([{ id: 'a', status: 'offline' }]);
    svc.clearAll();
    expect(svc.getAllNotifications()).toEqual([]);
  });
});

describe('notificationService — subscribe', () => {
  it('subscribe receives an immediate snapshot and updates on new events', async () => {
    const svc = await freshService();
    const cb = vi.fn();
    const unsubscribe = svc.subscribe(cb);
    expect(cb).toHaveBeenCalledTimes(1); // initial snapshot
    svc.checkAPStatus([{ id: 'a', status: 'offline' }]);
    expect(cb.mock.calls.length).toBeGreaterThan(1);
    unsubscribe();
    svc.checkAPStatus([{ id: 'b', status: 'offline' }]);
    // No further calls after unsubscribe.
    const callsAfterUnsub = cb.mock.calls.length;
    svc.checkAPStatus([{ id: 'c', status: 'offline' }]);
    expect(cb.mock.calls.length).toBe(callsAfterUnsub);
  });

  it('survives subscriber callbacks that throw on subsequent (non-initial) calls', async () => {
    const svc = await freshService();
    // subscribe accepts any callback; the initial snapshot call happens
    // synchronously and is NOT inside the service's try/catch (see source).
    // We test the *update* path: skip throwing on the first call, then
    // throw on subsequent calls.
    let calls = 0;
    svc.subscribe(() => {
      if (calls++ > 0) throw new Error('subscriber kaboom');
    });
    expect(() => svc.checkAPStatus([{ id: 'a', status: 'offline' }])).not.toThrow();
    expect(console.error).toHaveBeenCalled();
  });
});

describe('notificationService — addInfoNotification', () => {
  it('appends an info notification with title + message', async () => {
    const svc = await freshService();
    svc.addInfoNotification('Backup', 'Backup completed', { hint: 'ok' });
    const all = svc.getAllNotifications();
    expect(all).toHaveLength(1);
    expect(all[0].type).toBe('info');
    expect(all[0].title).toBe('Backup');
  });
});
