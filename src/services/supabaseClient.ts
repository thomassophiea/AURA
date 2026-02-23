import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Supabase configuration — values must be set via environment variables.
// VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are the Supabase project URL
// and public anon key; both are safe to expose to the browser per Supabase
// design (RLS policies enforce access control). Never use the service role key here.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('[Supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set — Supabase features will be unavailable.');
}

// Create a single supabase client for interacting with your database.
// Falls back to placeholder values when env vars are absent so the module
// can be imported without crashing; callers should check the warning above.
export const supabase: SupabaseClient = createClient(SUPABASE_URL || 'https://placeholder.supabase.co', SUPABASE_ANON_KEY || 'placeholder', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  db: {
    schema: 'public'
  },
  global: {
    headers: {
      'X-Client-Info': 'edge-services-site'
    }
  }
});

// Database types for TypeScript
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
