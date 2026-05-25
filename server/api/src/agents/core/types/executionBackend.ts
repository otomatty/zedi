import type { UserAiCredentialProvider } from "../../../schema/userAiCredentials.js";

/**
 * Execution backend identifies where the LangGraph agent runs and which
 * credential mode applies.
 *
 * 実行バックエンド。LangGraph エージェントが「どこで・誰の鍵で」走るかを表す。
 *
 * - `zedi_managed` — Zedi がプロビジョニングしたシステム API キーで API
 *   ホスト内で実行。月次 CU は `recordUsage` で消費する。
 * - `user_anthropic` / `user_openai` / `user_google` — ユーザーがサーバーに
 *   登録した暗号化 API キーで実行（BYOK, #951）。Zedi CU は消費しない。
 * - `byo_runner` — ユーザー所有ランナー（将来）。未対応で予約。
 *
 * `byok` は P0 スケッチ名；P3 では provider 別 backend に分割した。
 */
export type ExecutionBackend =
  | "zedi_managed"
  | "user_anthropic"
  | "user_openai"
  | "user_google"
  | "byo_runner";

/** BYOK backends that map 1:1 to a stored credential provider. */
export type UserByokExecutionBackend = "user_anthropic" | "user_openai" | "user_google";

/**
 * Backends accepted for Wiki Compose session create / run (#951).
 * Wiki Compose で受け入れる backend 一覧。
 */
export const SUPPORTED_COMPOSE_BACKENDS: ReadonlyArray<ExecutionBackend> = [
  "zedi_managed",
  "user_anthropic",
  "user_openai",
  "user_google",
];

/**
 * @deprecated P0 名。`SUPPORTED_COMPOSE_BACKENDS` を使用すること。
 * Alias kept for imports that still reference the P0 symbol.
 */
export const SUPPORTED_BACKENDS_P0: ReadonlyArray<ExecutionBackend> = SUPPORTED_COMPOSE_BACKENDS;

/**
 * 与えられた値が `ExecutionBackend` の文字列かどうかを判定する。
 * Type guard for `ExecutionBackend`.
 */
export function isExecutionBackend(value: unknown): value is ExecutionBackend {
  return (
    value === "zedi_managed" ||
    value === "user_anthropic" ||
    value === "user_openai" ||
    value === "user_google" ||
    value === "byo_runner"
  );
}

/**
 * True when the backend uses a user-supplied API key (BYOK).
 * ユーザー API キー backend かどうか。
 */
export function isUserByokBackend(backend: ExecutionBackend): backend is UserByokExecutionBackend {
  return backend === "user_anthropic" || backend === "user_openai" || backend === "user_google";
}

/**
 * Map a BYOK execution backend to the credential provider id.
 * BYOK backend から credential provider へ変換。
 */
export function backendToCredentialProvider(
  backend: UserByokExecutionBackend,
): UserAiCredentialProvider {
  switch (backend) {
    case "user_anthropic":
      return "anthropic";
    case "user_openai":
      return "openai";
    case "user_google":
      return "google";
  }
}

/**
 * Map credential provider to the compose execution backend id.
 */
export function credentialProviderToBackend(
  provider: UserAiCredentialProvider,
): UserByokExecutionBackend {
  switch (provider) {
    case "anthropic":
      return "user_anthropic";
    case "openai":
      return "user_openai";
    case "google":
      return "user_google";
  }
}
