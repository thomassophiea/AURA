/**
 * Version Gate - Forces clean application state on version changes
 *
 * This module ensures that when the app version changes:
 * 1. All localStorage is cleared
 * 2. All sessionStorage is cleared
 * 3. All IndexedDB databases are deleted
 * 4. All Cache Storage entries are deleted
 * 5. All service workers are unregistered
 * 6. A full page reload is forced
 */

// APP_VERSION is injected at build time via Vite's define
declare const __APP_VERSION__: string;
declare const __CACHE_VERSION__: number;

const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
const CACHE_VERSION = typeof __CACHE_VERSION__ !== 'undefined' ? __CACHE_VERSION__ : 1;

const VERSION_STORAGE_KEY = 'app_version';
const CACHE_VERSION_KEY = 'cache_version';

/**
 * Delete all IndexedDB databases
 */
async function clearIndexedDB(): Promise<void> {
  if (!('indexedDB' in window)) return;

  try {
    // Get all database names (if supported)
    if ('databases' in indexedDB) {
      const databases = await (indexedDB as any).databases();
      const deletePromises = databases.map((db: { name: string }) => {
        return new Promise<void>((resolve, reject) => {
          const request = indexedDB.deleteDatabase(db.name);
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
          request.onblocked = () => {
            console.warn(`[VersionGate] IndexedDB ${db.name} delete blocked`);
            resolve();
          };
        });
      });
      await Promise.allSettled(deletePromises);
    }
  } catch (error) {
    console.warn('[VersionGate] Failed to clear IndexedDB:', error);
  }
}

/**
 * Delete all Cache Storage entries
 */
async function clearCacheStorage(): Promise<void> {
  if (!('caches' in window)) return;

  try {
    const cacheNames = await caches.keys();
    const deletePromises = cacheNames.map(name => caches.delete(name));
    await Promise.allSettled(deletePromises);
    console.log(`[VersionGate] Deleted ${cacheNames.length} cache(s)`);
  } catch (error) {
    console.warn('[VersionGate] Failed to clear Cache Storage:', error);
  }
}

/**
 * Unregister all service workers
 */
async function unregisterServiceWorkers(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    const unregisterPromises = registrations.map(reg => reg.unregister());
    await Promise.allSettled(unregisterPromises);
    console.log(`[VersionGate] Unregistered ${registrations.length} service worker(s)`);
  } catch (error) {
    console.warn('[VersionGate] Failed to unregister service workers:', error);
  }
}

// Keys/prefixes that hold user-configured data and must survive version upgrades.
// These are site group lists, saved credentials, and controller selection — not
// app state or cache data, so they should NOT be wiped on each deploy.
const PRESERVE_PREFIXES = [
  'api_controllers',       // saved site group list
  'api_current_controller', // last-selected site group
  'api_current_org',        // last-selected org
  'sg_login_',              // per-site-group controller credentials
  'xiq_creds_',             // per-site-group ExtremeCloud credentials
  'xiq_token_',             // active ExtremeCloud tokens
];

/**
 * Clear all browser storage, preserving user-configured site group data
 */
function clearAllStorage(): void {
  try {
    const keysToRemove: string[] = [];
    const preserved: Array<[string, string]> = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (PRESERVE_PREFIXES.some(p => key.startsWith(p))) {
        const val = localStorage.getItem(key);
        if (val !== null) preserved.push([key, val]);
      } else {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach(key => localStorage.removeItem(key));

    // Restore preserved user data after the wipe
    preserved.forEach(([k, v]) => localStorage.setItem(k, v));

    console.log(`[VersionGate] Cleared ${keysToRemove.length} localStorage item(s), preserved ${preserved.length}`);
  } catch (error) {
    console.warn('[VersionGate] Failed to clear localStorage:', error);
  }

  try {
    // Clear sessionStorage
    const sessionKeysCount = sessionStorage.length;
    sessionStorage.clear();
    console.log(`[VersionGate] Cleared ${sessionKeysCount} sessionStorage item(s)`);
  } catch (error) {
    console.warn('[VersionGate] Failed to clear sessionStorage:', error);
  }
}

/**
 * Expire old versioned cookies by setting them with maxAge=0
 * Note: This only works for non-httpOnly cookies.
 * httpOnly cookies must be expired server-side.
 */
function expireOldCookies(): void {
  // List of old cookie name patterns to expire
  const oldCookiePatterns = [
    'session_v1',
    'session_v2',
    // Add more patterns as versions increment
  ];

  try {
    const cookies = document.cookie.split(';');
    cookies.forEach(cookie => {
      const [name] = cookie.split('=').map(s => s.trim());
      if (oldCookiePatterns.some(pattern => name.startsWith(pattern))) {
        // Expire the cookie by setting it with maxAge=0
        document.cookie = `${name}=; path=/; max-age=0; secure; samesite=lax`;
        console.log(`[VersionGate] Expired cookie: ${name}`);
      }
    });
  } catch (error) {
    console.warn('[VersionGate] Failed to expire old cookies:', error);
  }
}

/**
 * Perform full state cleanup
 */
async function performCleanup(): Promise<void> {
  console.log('[VersionGate] Performing full state cleanup...');

  // Clear synchronous storage first
  clearAllStorage();
  expireOldCookies();

  // Clear async storage
  await Promise.allSettled([
    clearIndexedDB(),
    clearCacheStorage(),
    unregisterServiceWorkers(),
  ]);

  console.log('[VersionGate] State cleanup complete');
}

/**
 * Check version and perform cleanup if needed
 * Returns true if a reload is required
 */
export async function checkVersionGate(): Promise<boolean> {
  const storedVersion = localStorage.getItem(VERSION_STORAGE_KEY);
  const storedCacheVersion = localStorage.getItem(CACHE_VERSION_KEY);

  const versionMismatch = storedVersion !== APP_VERSION;
  const cacheVersionMismatch = storedCacheVersion !== String(CACHE_VERSION);

  if (versionMismatch || cacheVersionMismatch) {
    console.log(`[VersionGate] Version mismatch detected`);
    console.log(`  Stored: ${storedVersion} (cache: ${storedCacheVersion})`);
    console.log(`  Current: ${APP_VERSION} (cache: ${CACHE_VERSION})`);

    // Perform full cleanup
    await performCleanup();

    // Store new version BEFORE reload
    localStorage.setItem(VERSION_STORAGE_KEY, APP_VERSION);
    localStorage.setItem(CACHE_VERSION_KEY, String(CACHE_VERSION));

    console.log('[VersionGate] Forcing full page reload...');
    return true;
  }

  console.log(`[VersionGate] Version OK: ${APP_VERSION}`);
  return false;
}

/**
 * Initialize version gate - should be called as early as possible
 */
export async function initVersionGate(): Promise<void> {
  try {
    const needsReload = await checkVersionGate();

    if (needsReload) {
      // Force a hard reload to ensure fresh assets
      window.location.reload();
    }
  } catch (error) {
    console.error('[VersionGate] Error during version check:', error);
    // On error, don't block app initialization
  }
}

/**
 * Get current app version
 */
export function getAppVersion(): string {
  return APP_VERSION;
}

/**
 * Get current cache version
 */
export function getCacheVersion(): number {
  return CACHE_VERSION;
}

export { APP_VERSION, CACHE_VERSION };
