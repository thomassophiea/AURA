/**
 * OfflineStorage - IndexedDB-based storage for larger offline datasets
 * Supports: stations, accessPoints, services, events
 */

const DB_NAME = 'aura_offline_cache';
const DB_VERSION = 1;
const STORE_NAME = 'cache_store';

interface CacheEntry<T = unknown> {
  key: string;
  data: T;
  timestamp: number;
  expiresAt: number | null;
  schemaVersion: number;
}

interface CacheStats {
  entryCount: number;
  totalSize: number;
  oldestEntry: number | null;
  newestEntry: number | null;
}

const CURRENT_SCHEMA_VERSION = 1;

const DEFAULT_TTL: Record<string, number> = {
  stations: 5 * 60 * 1000,      // 5 minutes
  accessPoints: 5 * 60 * 1000,  // 5 minutes
  applications: 10 * 60 * 1000, // 10 minutes
  sites: 30 * 60 * 1000,        // 30 minutes
  events: 2 * 60 * 1000,        // 2 minutes
  default: 5 * 60 * 1000,       // 5 minutes
};

class OfflineStorage {
  private db: IDBDatabase | null = null;
  private dbPromise: Promise<IDBDatabase> | null = null;

  private async getDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('[OfflineStorage] Failed to open database:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('expiresAt', 'expiresAt', { unique: false });
        }
      };
    });

    return this.dbPromise;
  }

  async set<T>(key: string, data: T, ttl?: number): Promise<void> {
    try {
      const db = await this.getDB();
      const resolvedTTL = ttl ?? DEFAULT_TTL[key] ?? DEFAULT_TTL.default ?? 300000;
      const now = Date.now();

      const entry: CacheEntry<T> = {
        key,
        data,
        timestamp: now,
        expiresAt: resolvedTTL > 0 ? now + resolvedTTL : null,
        schemaVersion: CURRENT_SCHEMA_VERSION,
      };

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(entry);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (error) {
      console.error('[OfflineStorage] Failed to set:', key, error);
      this.fallbackToLocalStorage(key, data, ttl);
    }
  }

  async get<T>(key: string): Promise<{ data: T; timestamp: number } | null> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(key);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const entry = request.result as CacheEntry<T> | undefined;
          if (!entry) {
            resolve(null);
            return;
          }

          if (entry.schemaVersion !== CURRENT_SCHEMA_VERSION) {
            this.delete(key);
            resolve(null);
            return;
          }

          if (entry.expiresAt && Date.now() > entry.expiresAt) {
            this.delete(key);
            resolve(null);
            return;
          }

          resolve({ data: entry.data, timestamp: entry.timestamp });
        };
      });
    } catch (error) {
      console.error('[OfflineStorage] Failed to get:', key, error);
      return this.fallbackFromLocalStorage(key);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(key);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (error) {
      console.error('[OfflineStorage] Failed to delete:', key, error);
      localStorage.removeItem(`cache_${key}`);
    }
  }

  async clear(): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch (error) {
      console.error('[OfflineStorage] Failed to clear:', error);
      Object.keys(localStorage)
        .filter((k) => k.startsWith('cache_'))
        .forEach((k) => localStorage.removeItem(k));
    }
  }

  async getCacheStats(): Promise<CacheStats> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const entries = request.result as CacheEntry[];
          const totalSize = entries.reduce(
            (acc, entry) => acc + JSON.stringify(entry.data).length,
            0
          );
          const timestamps = entries.map((e) => e.timestamp);

          resolve({
            entryCount: entries.length,
            totalSize,
            oldestEntry: timestamps.length ? Math.min(...timestamps) : null,
            newestEntry: timestamps.length ? Math.max(...timestamps) : null,
          });
        };
      });
    } catch (error) {
      console.error('[OfflineStorage] Failed to get stats:', error);
      return { entryCount: 0, totalSize: 0, oldestEntry: null, newestEntry: null };
    }
  }

  async cleanupExpired(): Promise<number> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();
        let deletedCount = 0;

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const entries = request.result as CacheEntry[];
          const now = Date.now();

          entries.forEach((entry) => {
            const isExpired = entry.expiresAt && now > entry.expiresAt;
            const isStaleSchema = entry.schemaVersion !== CURRENT_SCHEMA_VERSION;

            if (isExpired || isStaleSchema) {
              store.delete(entry.key);
              deletedCount++;
            }
          });

          resolve(deletedCount);
        };
      });
    } catch (error) {
      console.error('[OfflineStorage] Failed to cleanup:', error);
      return 0;
    }
  }

  private fallbackToLocalStorage<T>(key: string, data: T, ttl?: number): void {
    try {
      const entry = {
        data,
        timestamp: Date.now(),
        expiresAt: ttl ? Date.now() + ttl : null,
        schemaVersion: CURRENT_SCHEMA_VERSION,
      };
      localStorage.setItem(`cache_${key}`, JSON.stringify(entry));
    } catch (e) {
      console.error('[OfflineStorage] LocalStorage fallback failed:', e);
    }
  }

  private fallbackFromLocalStorage<T>(key: string): { data: T; timestamp: number } | null {
    try {
      const cached = localStorage.getItem(`cache_${key}`);
      if (!cached) return null;

      const entry = JSON.parse(cached);
      if (entry.schemaVersion !== CURRENT_SCHEMA_VERSION) {
        localStorage.removeItem(`cache_${key}`);
        return null;
      }
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        localStorage.removeItem(`cache_${key}`);
        return null;
      }

      return { data: entry.data, timestamp: entry.timestamp };
    } catch (e) {
      return null;
    }
  }
}

export const offlineStorage = new OfflineStorage();
export { CURRENT_SCHEMA_VERSION, DEFAULT_TTL };
export type { CacheEntry, CacheStats };
