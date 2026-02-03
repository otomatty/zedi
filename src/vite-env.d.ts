/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLERK_PUBLISHABLE_KEY: string;
  readonly VITE_TURSO_DATABASE_URL: string;
  readonly VITE_TURSO_AUTH_TOKEN?: string;
  readonly VITE_AI_API_BASE_URL?: string;
  readonly VITE_THUMBNAIL_API_BASE_URL?: string;
  readonly VITE_REALTIME_URL?: string;
  readonly VITE_E2E_TEST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
