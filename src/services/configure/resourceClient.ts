/**
 * Core request/CRUD plumbing for the Configure (EPB-125) service layer.
 *
 * Every resource module in src/services/configure builds on this factory
 * instead of growing the 7.3k-line api.ts singleton. All traffic still flows
 * through `apiService.makeAuthenticatedRequest`, so auth, token refresh,
 * concurrent-GET dedup, rate-limit backoff, X-Controller-URL proxy routing
 * and the API call log are inherited unchanged.
 */
import { apiService, getDynamicControllerUrl } from '../api';
import { cacheService } from '../cache';
import { logger } from '../logger';

/** Error carrying the HTTP status + response body for toast/validation UX. */
export class ConfigureApiError extends Error {
  readonly status: number;
  readonly body: string;
  readonly endpoint: string;

  constructor(operation: string, endpoint: string, status: number, body: string) {
    super(`${operation} ${endpoint} failed: ${status}${body ? ` - ${body}` : ''}`);
    this.name = 'ConfigureApiError';
    this.status = status;
    this.body = body;
    this.endpoint = endpoint;
  }
}

export interface ConfigureRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** JSON-serialized when provided. */
  body?: unknown;
  timeoutMs?: number;
}

const GET_TIMEOUT_MS = 10000;
// Heavy config PUTs regularly exceed the apiService 6s default (port brief §7.5).
const MUTATION_TIMEOUT_MS = 20000;

/**
 * Perform an authenticated request against a controller management endpoint
 * and return the parsed JSON payload. Throws ConfigureApiError on non-2xx.
 */
export async function configureRequest<T>(
  endpoint: string,
  options: ConfigureRequestOptions = {}
): Promise<T> {
  const method = options.method ?? 'GET';
  const isMutation = method !== 'GET';
  const timeoutMs = options.timeoutMs ?? (isMutation ? MUTATION_TIMEOUT_MS : GET_TIMEOUT_MS);

  const init: RequestInit = { method };
  if (options.body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(options.body);
  }

  const response = await apiService.makeAuthenticatedRequest(endpoint, init, timeoutMs);
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new ConfigureApiError(method, endpoint, response.status, text);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  const text = await response.text();
  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

/**
 * Unwrap list payloads: controllers return either bare arrays or envelopes
 * (data/items/results/content) depending on version — same tolerance api.ts
 * applies in getSites.
 */
export function unwrapList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === 'object') {
    const envelope = payload as Record<string, unknown>;
    for (const key of ['data', 'items', 'results', 'content']) {
      if (Array.isArray(envelope[key])) return envelope[key] as T[];
    }
  }
  return [];
}

export interface ResourceClientConfig {
  /** Human-readable resource label used in errors/log lines. */
  resource: string;
  /**
   * Candidate base paths in priority order (e.g. ['/v3/adsp', '/v4/adsp']).
   * A 404 falls through to the next candidate; the first path that answers
   * anything other than 404 is remembered per controller.
   */
  basePaths: string[];
  /** Record field carrying the identifier (default 'id'). */
  idField?: string;
  /** Set false for resources with no /default template (e.g. profiles). */
  supportsDefault?: boolean;
  /** Set true for resources exposing GET <base>/nametoidmap. */
  supportsNameToIdMap?: boolean;
  /**
   * When true, list() resolves to [] if every base path 404s instead of
   * throwing — used for optional features (vlangroups) so the UI can degrade
   * gracefully.
   */
  optionalFeature?: boolean;
  /** cacheService keys to clear after any mutation (exact keys). */
  invalidateCacheKeys?: () => string[];
}

export interface ResourceClient<T> {
  list(): Promise<T[]>;
  get(id: string): Promise<T>;
  create(payload: Partial<T>): Promise<T>;
  update(id: string, payload: Partial<T>): Promise<T>;
  remove(id: string): Promise<void>;
  /** Fetch the controller's new-object template (GET <base>/default). */
  getDefault(): Promise<T>;
  getNameToIdMap(): Promise<Record<string, string>>;
  /** True once any request succeeded; false after an all-404 probe. */
  isSupported(): Promise<boolean>;
}

/** Resolved base path per controller, so multi-controller sessions don't leak paths. */
type BaseCache = Map<string, string>;

function controllerKey(): string {
  return getDynamicControllerUrl() ?? 'default';
}

export function createResourceClient<T extends object>(
  config: ResourceClientConfig
): ResourceClient<T> {
  const {
    resource,
    basePaths,
    supportsDefault = true,
    supportsNameToIdMap = false,
    optionalFeature = false,
    invalidateCacheKeys,
  } = config;
  const resolvedBases: BaseCache = new Map();

  function candidates(): string[] {
    const remembered = resolvedBases.get(controllerKey());
    if (!remembered) return basePaths;
    return [remembered, ...basePaths.filter((p) => p !== remembered)];
  }

  /** Try each candidate base; 404 falls through, anything else settles. */
  async function requestWithFallback<R>(
    suffix: string,
    options: ConfigureRequestOptions = {}
  ): Promise<R> {
    const paths = candidates();
    let lastError: ConfigureApiError | null = null;
    for (const base of paths) {
      try {
        const result = await configureRequest<R>(`${base}${suffix}`, options);
        resolvedBases.set(controllerKey(), base);
        return result;
      } catch (error) {
        if (error instanceof ConfigureApiError && error.status === 404) {
          lastError = error;
          logger.log(`[configure/${resource}] ${base}${suffix} -> 404, trying next candidate`);
          continue;
        }
        throw error;
      }
    }
    throw lastError ?? new ConfigureApiError('GET', basePaths[0] + suffix, 404, 'not found');
  }

  function invalidate(): void {
    if (!invalidateCacheKeys) return;
    for (const key of invalidateCacheKeys()) {
      cacheService.clear(key);
    }
  }

  return {
    async list(): Promise<T[]> {
      try {
        const payload = await requestWithFallback<unknown>('');
        return unwrapList<T>(payload);
      } catch (error) {
        if (
          optionalFeature &&
          error instanceof ConfigureApiError &&
          (error.status === 404 || error.status === 501)
        ) {
          logger.warn(`[configure/${resource}] not supported on this controller, returning []`);
          return [];
        }
        throw error;
      }
    },

    async get(id: string): Promise<T> {
      return requestWithFallback<T>(`/${encodeURIComponent(id)}`);
    },

    async create(payload: Partial<T>): Promise<T> {
      const result = await requestWithFallback<T>('', { method: 'POST', body: payload });
      invalidate();
      return result;
    },

    async update(id: string, payload: Partial<T>): Promise<T> {
      const result = await requestWithFallback<T>(`/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: payload,
      });
      invalidate();
      return result;
    },

    async remove(id: string): Promise<void> {
      await requestWithFallback<void>(`/${encodeURIComponent(id)}`, { method: 'DELETE' });
      invalidate();
    },

    async getDefault(): Promise<T> {
      if (!supportsDefault) {
        throw new Error(
          `${resource} has no /default template — seed new records from an existing one`
        );
      }
      return requestWithFallback<T>('/default');
    },

    async getNameToIdMap(): Promise<Record<string, string>> {
      if (!supportsNameToIdMap) {
        throw new Error(`${resource} does not expose a /nametoidmap endpoint`);
      }
      return requestWithFallback<Record<string, string>>('/nametoidmap');
    },

    async isSupported(): Promise<boolean> {
      try {
        await requestWithFallback<unknown>('');
        return true;
      } catch (error) {
        if (error instanceof ConfigureApiError && error.status === 404) return false;
        // Non-404 failures (auth, timeout) don't prove the feature is absent.
        return true;
      }
    },
  };
}

export interface SingletonResourceClient<T> {
  get(): Promise<T>;
  update(payload: T): Promise<T>;
}

/**
 * For singleton settings documents (snmp, globalsettings, accesscontrol,
 * aps/registration): GET/PUT on a fixed path, no collection semantics.
 */
export function createSingletonClient<T extends object>(config: {
  resource: string;
  path: string;
  invalidateCacheKeys?: () => string[];
}): SingletonResourceClient<T> {
  const { path, invalidateCacheKeys } = config;
  return {
    async get(): Promise<T> {
      return configureRequest<T>(path);
    },
    async update(payload: T): Promise<T> {
      const result = await configureRequest<T>(path, { method: 'PUT', body: payload });
      if (invalidateCacheKeys) {
        for (const key of invalidateCacheKeys()) cacheService.clear(key);
      }
      return result;
    },
  };
}
