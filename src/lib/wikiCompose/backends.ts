/**
 * Wiki Compose execution backends (#951) — mirrors server `ExecutionBackend`.
 */

/** Zedi-managed or BYOK provider-specific backends. */
export type ComposeExecutionBackend =
  | "zedi_managed"
  | "user_anthropic"
  | "user_openai"
  | "user_google";

export const COMPOSE_BACKEND_OPTIONS: readonly ComposeExecutionBackend[] = [
  "zedi_managed",
  "user_anthropic",
  "user_openai",
  "user_google",
] as const;

export function isUserByokComposeBackend(
  backend: ComposeExecutionBackend,
): backend is Exclude<ComposeExecutionBackend, "zedi_managed"> {
  return backend !== "zedi_managed";
}
