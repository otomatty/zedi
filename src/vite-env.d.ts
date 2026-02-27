/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_REALTIME_URL?: string;
  readonly VITE_E2E_TEST?: string;
  readonly VITE_POLAR_PRO_MONTHLY_PRODUCT_ID?: string;
  readonly VITE_POLAR_PRO_YEARLY_PRODUCT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
