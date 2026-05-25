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

export type ComposeBackendProvider = "anthropic" | "openai" | "google";

/** UI metadata for each backend option. */
export interface ComposeBackendOptionMeta {
  id: ComposeExecutionBackend;
  provider: ComposeBackendProvider | null;
  labelKey: string;
  descriptionKey: string;
}

export const COMPOSE_BACKEND_META: readonly ComposeBackendOptionMeta[] = [
  {
    id: "zedi_managed",
    provider: null,
    labelKey: "wikiCompose.backend.zediManaged",
    descriptionKey: "wikiCompose.backend.zediManagedDesc",
  },
  {
    id: "user_anthropic",
    provider: "anthropic",
    labelKey: "wikiCompose.backend.userAnthropic",
    descriptionKey: "wikiCompose.backend.userAnthropicDesc",
  },
  {
    id: "user_openai",
    provider: "openai",
    labelKey: "wikiCompose.backend.userOpenai",
    descriptionKey: "wikiCompose.backend.userOpenaiDesc",
  },
  {
    id: "user_google",
    provider: "google",
    labelKey: "wikiCompose.backend.userGoogle",
    descriptionKey: "wikiCompose.backend.userGoogleDesc",
  },
];

export function isUserByokComposeBackend(
  backend: ComposeExecutionBackend,
): backend is Exclude<ComposeExecutionBackend, "zedi_managed"> {
  return backend !== "zedi_managed";
}

export function usesZediCu(backend: ComposeExecutionBackend): boolean {
  return backend === "zedi_managed";
}
