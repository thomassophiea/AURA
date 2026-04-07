/// <reference types="vite/client" />

// Version constants injected by Vite at build time
declare const __APP_VERSION__: string;
declare const __CACHE_VERSION__: number;

interface ImportMetaEnv {
  readonly VITE_APP_VERSION: string;
  readonly VITE_APP_COMMIT_HASH: string;
  readonly VITE_APP_COMMIT_COUNT: string;
  readonly VITE_APP_BRANCH: string;
  readonly VITE_APP_BUILD_DATE: string;
  readonly VITE_APP_COMMIT_DATE: string;

  // Supabase — public project URL and anon key (safe to expose to browser)
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
