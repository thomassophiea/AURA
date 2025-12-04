import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Supabase configuration
const SUPABASE_URL = 'https://sdcanlpqxfjcmjpeaesj.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

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
