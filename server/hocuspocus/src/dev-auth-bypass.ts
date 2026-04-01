/**
 * Hocuspocus auth when `API_INTERNAL_URL` is unset.
 * `API_INTERNAL_URL` 未設定時の認証方針（開発用バイパス可否）。
 */

const TRUTHY_FLAGS = new Set(["1", "true", "yes"]);

/**
 * Whether an environment variable is considered enabled (trimmed, ASCII case-insensitive).
 * `1` / `true` / `yes` のみを真とする（誤って `on` などを真にしない）。
 *
 * @param value - Raw env value / 環境変数の生値
 */
export function isTruthyEnvFlag(value: string | undefined): boolean {
  if (value == null) return false;
  const v = value.trim().toLowerCase();
  return TRUTHY_FLAGS.has(v);
}

/**
 * Result when internal API URL is missing / 内部 API URL 欠落時の分岐結果。
 */
export type MissingApiInternalUrlAuthDecision =
  | { readonly action: "dev_bypass" }
  | { readonly action: "throw"; readonly message: string };

/**
 * Decide auth when `API_INTERNAL_URL` is not set.
 * 本番では常に拒否。それ以外では `HOCUSPOCUS_DEV_MODE` が真のときのみ開発バイパスを許可する。
 *
 * @param nodeEnv - `process.env.NODE_ENV`
 * @param hocuspocusDevMode - `process.env.HOCUSPOCUS_DEV_MODE`
 */
export function decideAuthWhenApiInternalUrlMissing(
  nodeEnv: string | undefined,
  hocuspocusDevMode: string | undefined,
): MissingApiInternalUrlAuthDecision {
  if (nodeEnv === "production") {
    return {
      action: "throw",
      message: "API_INTERNAL_URL must be set in production",
    };
  }
  if (isTruthyEnvFlag(hocuspocusDevMode)) {
    return { action: "dev_bypass" };
  }
  return {
    action: "throw",
    message:
      "API_INTERNAL_URL must be set, or set HOCUSPOCUS_DEV_MODE=true only for trusted local development",
  };
}

let loggedDevAuthBypass = false;

/**
 * Emit a single high-visibility warning when dev auth bypass is used.
 * 開発バイパス利用時に、プロセスあたり一度だけ警告を出す。
 */
export function warnDevAuthBypassOnce(): void {
  if (loggedDevAuthBypass) return;
  loggedDevAuthBypass = true;
  console.warn(
    "[Auth] SECURITY: Hocuspocus auth bypass is active (HOCUSPOCUS_DEV_MODE). " +
      "Any client can read/write documents. Do not expose this server. / " +
      "認証がバイパスされています。信頼できないネットワークに公開しないでください。",
  );
}
