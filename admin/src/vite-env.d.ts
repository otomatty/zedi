/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_MAIN_APP_URL: string;
  readonly VITE_PORT: string;
  /** Build-time deployment label (`production` | `development`). */
  readonly VITE_ENV_LABEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
