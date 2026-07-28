/**
 * Loads every live data source the diagnostics engine needs and runs it. All
 * sources are fetched through the shared configure request layer (auth, proxy,
 * dedup inherited): full AP config (`/v1/aps`), status rows (`/v1/aps/query`),
 * profiles (`/v3/profiles`), switches (`/v1/switches`) and AAA policies
 * (`/v1/aaapolicy`). Each source degrades to empty on failure so one dead
 * endpoint never blanks the whole surface. No health endpoint is called — every
 * check is computed client-side (schema audit: no health REST endpoint exists).
 */
import { useCallback, useEffect, useState } from 'react';
import { aaaPolicyService, configureRequest, profilesService, unwrapList } from '../../services/configure';
import { logger } from '../../services/logger';
import type { AaaPolicy, ApDetail, ApProfile } from '../../types/configure';
import {
  runDiagnostics,
  type ApStatusRow,
  type DiagnosticsResult,
} from './diagnosticsEngine';

async function loadFullAps(): Promise<ApDetail[]> {
  try {
    const payload = await configureRequest<unknown>('/v1/aps');
    return unwrapList<ApDetail>(payload);
  } catch (error) {
    logger.warn('[diagnostics] /v1/aps failed', error);
    return [];
  }
}

async function loadApStatus(): Promise<ApStatusRow[]> {
  try {
    const payload = await configureRequest<unknown>(
      '/v1/aps/query?fields=serialNumber,apName,status&limit=500'
    );
    // /v1/aps/query returns a bare array or an { aps } envelope.
    if (Array.isArray(payload)) return payload as ApStatusRow[];
    const env = payload as Record<string, unknown> | null;
    for (const key of ['aps', 'data', 'results', 'content']) {
      if (env && Array.isArray(env[key])) return env[key] as ApStatusRow[];
    }
    return [];
  } catch (error) {
    logger.warn('[diagnostics] /v1/aps/query failed', error);
    return [];
  }
}

async function loadSwitches(): Promise<unknown[]> {
  try {
    const payload = await configureRequest<unknown>('/v1/switches');
    return unwrapList<unknown>(payload);
  } catch (error) {
    logger.warn('[diagnostics] /v1/switches failed', error);
    return [];
  }
}

async function loadProfiles(): Promise<ApProfile[]> {
  try {
    return await profilesService.list();
  } catch (error) {
    logger.warn('[diagnostics] profiles failed', error);
    return [];
  }
}

async function loadAaaPolicies(): Promise<AaaPolicy[]> {
  try {
    return await aaaPolicyService.list();
  } catch (error) {
    logger.warn('[diagnostics] aaapolicy failed', error);
    return [];
  }
}

export interface UseSystemHealth {
  result: DiagnosticsResult | null;
  aps: ApDetail[];
  aaaPolicies: AaaPolicy[];
  loading: boolean;
  refresh: () => void;
}

export function useSystemHealth(): UseSystemHealth {
  const [result, setResult] = useState<DiagnosticsResult | null>(null);
  const [aps, setAps] = useState<ApDetail[]>([]);
  const [aaaPolicies, setAaaPolicies] = useState<AaaPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      loadFullAps(),
      loadApStatus(),
      loadSwitches(),
      loadProfiles(),
      loadAaaPolicies(),
    ]).then(([fullAps, apStatus, switches, profiles, policies]) => {
      if (cancelled) return;
      setAps(fullAps);
      setAaaPolicies(policies);
      setResult(runDiagnostics({ aps: fullAps, apStatus, switches, profiles, aaaPolicies: policies }));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return { result, aps, aaaPolicies, loading, refresh };
}
