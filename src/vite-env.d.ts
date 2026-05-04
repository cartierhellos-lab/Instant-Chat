/// <reference types="vite/client" />

// Global constants defined at build time
declare const __ROUTE_MESSAGING_ENABLED__: boolean;

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_DUOPLUS_API_REGION?: 'global' | 'cn';
  readonly VITE_DUOPLUS_POLL_INTERVAL?: string;
  readonly VITE_DUOPLUS_ADB_TEMPLATE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
