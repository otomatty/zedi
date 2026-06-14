/**
 * Build-time admin deployment label (`VITE_ENV_LABEL`).
 * ビルド時に埋め込む管理画面のデプロイ環境ラベル（`VITE_ENV_LABEL`）。
 */
export type AdminEnvironmentLabel = "production" | "development";

/**
 * Returns the admin deployment label when set at build time.
 * ビルド時に `VITE_ENV_LABEL` が渡されていればその値を返す。
 */
export function getAdminEnvironmentLabel(): AdminEnvironmentLabel | null {
  const raw = import.meta.env?.VITE_ENV_LABEL?.trim().toLowerCase();
  if (raw === "production" || raw === "development") {
    return raw;
  }
  return null;
}

/**
 * True when this admin build targets a non-production API (development stack).
 * development 向けビルドかどうか（誤操作防止バッジ用）。
 */
export function isNonProductionAdminBuild(): boolean {
  return getAdminEnvironmentLabel() === "development";
}
