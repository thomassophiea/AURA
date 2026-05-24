/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const isPlaceholder = (v: string | undefined): boolean =>
  !v || v.includes('placeholder') || v.includes('example.com');

export const isSupabaseConfigured: boolean =
  !isPlaceholder(SUPABASE_URL) && !isPlaceholder(SUPABASE_ANON_KEY);

// Chainable no-op stub. Returns itself for any property access, is thenable,
// and resolves to a structured "not configured" error so callers fall back to
// localStorage / empty results instead of firing DNS-failing requests.
function createStubClient(): SupabaseClient {
  const notConfiguredError = {
    message: 'Supabase not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing)',
    code: 'SUPABASE_NOT_CONFIGURED',
    details: '',
    hint: '',
    name: 'PostgrestError',
  };

  const stubResult = {
    data: null,
    error: notConfiguredError,
    count: null,
    status: 0,
    statusText: '',
  };

  const makeChain = (): any => {
    const chain: any = new Proxy(function () {}, {
      get(_target, prop) {
        if (prop === 'then') {
          // Make the proxy thenable so `await supabase.from(...).select(...)` resolves.
          return (resolve: (v: typeof stubResult) => unknown) => resolve(stubResult);
        }
        if (prop === Symbol.iterator || prop === Symbol.asyncIterator) {
          return undefined;
        }
        return () => chain;
      },
      apply() {
        return chain;
      },
    });
    return chain;
  };

  const stubAuth = {
    getSession: async () => ({ data: { session: null }, error: null }),
    getUser: async () => ({ data: { user: null }, error: null }),
    signInWithPassword: async () => ({
      data: { user: null, session: null },
      error: notConfiguredError,
    }),
    signOut: async () => ({ error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
  };

  return new Proxy({} as SupabaseClient, {
    get(_target, prop) {
      if (prop === 'auth') return stubAuth;
      if (prop === 'from' || prop === 'rpc' || prop === 'schema') return () => makeChain();
      if (prop === 'storage' || prop === 'realtime' || prop === 'functions') return makeChain();
      return () => makeChain();
    },
  });
}

if (!isSupabaseConfigured) {
  console.warn(
    '[Supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set — using no-op stub. Supabase-backed features (templates, variables, network rewind) will return empty results.'
  );
}

export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: { persistSession: true, autoRefreshToken: true },
      db: { schema: 'public' },
      global: { headers: { 'X-Client-Info': 'edge-services-site' } },
    })
  : createStubClient();

export interface ServiceMetricsSnapshot {
  id?: string;
  service_id: string;
  service_name: string;
  timestamp: string;
  metrics: {
    throughput?: number;
    latency?: number;
    jitter?: number;
    packetLoss?: number;
    reliability?: number;
    uptime?: number;
    clientCount?: number;
    successRate?: number;
    errorRate?: number;
    averageRssi?: number;
    averageSnr?: number;
  };
  created_at?: string;
}

export interface NetworkSnapshot {
  id?: string;
  timestamp: string;
  site_id?: string;
  site_name?: string;
  total_services: number;
  total_clients: number;
  total_throughput: number;
  average_reliability: number;
  created_at?: string;
}
