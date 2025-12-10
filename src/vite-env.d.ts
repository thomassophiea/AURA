/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_VERSION: string;
  readonly VITE_APP_COMMIT_HASH: string;
  readonly VITE_APP_COMMIT_COUNT: string;
  readonly VITE_APP_BRANCH: string;
  readonly VITE_APP_BUILD_DATE: string;
  readonly VITE_APP_COMMIT_DATE: string;

  // Existing Supabase vars
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
