import { describe, it, expect } from "vitest";
import type { AISettings } from "@/types/ai";
import {
  coerceWikiComposeBackend,
  isComposeBackendAvailable,
  isWikiComposeAllowedBackend,
  resolveComposeBackendFromAiSettings,
  resolvePreferredComposeBackend,
} from "./resolveComposeBackend";
import type { UserAiCredentialsStatus } from "@/lib/userAiCredentials";

const baseSettings = (overrides: Partial<AISettings>): AISettings => ({
  provider: "google",
  apiKey: "",
  apiMode: "api_server",
  model: "gemini-3-flash-preview",
  modelId: "google:gemini-3-flash-preview",
  isConfigured: false,
  ...overrides,
});

const credentialsNone: UserAiCredentialsStatus = {
  storageEnabled: true,
  providers: [
    { provider: "anthropic", configured: false },
    { provider: "openai", configured: false },
    { provider: "google", configured: false },
  ],
};

const credentialsOpenAi: UserAiCredentialsStatus = {
  storageEnabled: true,
  providers: [
    { provider: "anthropic", configured: false },
    { provider: "openai", configured: true },
    { provider: "google", configured: false },
  ],
};

const credentialsGoogle: UserAiCredentialsStatus = {
  storageEnabled: true,
  providers: [
    { provider: "anthropic", configured: false },
    { provider: "openai", configured: false },
    { provider: "google", configured: true },
  ],
};

describe("resolvePreferredComposeBackend", () => {
  it("maps api_server mode to zedi_managed", () => {
    expect(resolvePreferredComposeBackend(baseSettings({ provider: "openai" }))).toBe(
      "zedi_managed",
    );
  });

  it("maps user_api_key mode to matching user_* backend", () => {
    expect(
      resolvePreferredComposeBackend(
        baseSettings({ apiMode: "user_api_key", provider: "anthropic", isConfigured: true }),
      ),
    ).toBe("user_anthropic");
  });

  it("maps claude-code to zedi_managed", () => {
    expect(
      resolvePreferredComposeBackend(
        baseSettings({ provider: "claude-code", modelId: "claude-code:default" }),
      ),
    ).toBe("zedi_managed");
  });
});

describe("isComposeBackendAvailable", () => {
  it("treats zedi_managed as always available", () => {
    expect(isComposeBackendAvailable("zedi_managed", credentialsNone)).toBe(true);
  });

  it("requires storage and configured credential for BYOK", () => {
    expect(isComposeBackendAvailable("user_openai", credentialsOpenAi)).toBe(true);
    expect(isComposeBackendAvailable("user_openai", credentialsNone)).toBe(false);
    expect(
      isComposeBackendAvailable("user_openai", {
        storageEnabled: false,
        providers: credentialsOpenAi.providers,
      }),
    ).toBe(false);
  });
});

describe("isWikiComposeAllowedBackend", () => {
  it("allows zedi_managed and user_google only", () => {
    expect(isWikiComposeAllowedBackend("zedi_managed")).toBe(true);
    expect(isWikiComposeAllowedBackend("user_google")).toBe(true);
    expect(isWikiComposeAllowedBackend("user_openai")).toBe(false);
    expect(isWikiComposeAllowedBackend("user_anthropic")).toBe(false);
  });
});

describe("coerceWikiComposeBackend", () => {
  it("falls back to user_google when preferred non-Google BYOK but Google credential exists", () => {
    expect(coerceWikiComposeBackend("user_openai", credentialsGoogle)).toBe("user_google");
    expect(coerceWikiComposeBackend("user_anthropic", credentialsGoogle)).toBe("user_google");
  });

  it("falls back to zedi_managed when only non-Google BYOK credentials exist", () => {
    expect(coerceWikiComposeBackend("user_openai", credentialsOpenAi)).toBe("zedi_managed");
    expect(coerceWikiComposeBackend("user_anthropic", credentialsOpenAi)).toBe("zedi_managed");
    expect(coerceWikiComposeBackend("user_openai", credentialsNone)).toBe("zedi_managed");
  });
});

describe("resolveComposeBackendFromAiSettings", () => {
  it("falls back to zedi_managed when preferred BYOK is unavailable", () => {
    expect(
      resolveComposeBackendFromAiSettings(
        baseSettings({ apiMode: "user_api_key", provider: "openai", isConfigured: true }),
        credentialsNone,
      ),
    ).toBe("zedi_managed");
  });

  it("maps non-Google BYOK to user_google when Google credential exists (#990)", () => {
    expect(
      resolveComposeBackendFromAiSettings(
        baseSettings({ apiMode: "user_api_key", provider: "openai", isConfigured: true }),
        credentialsGoogle,
      ),
    ).toBe("user_google");
  });

  it("keeps user_google when preferred and credential exists", () => {
    expect(
      resolveComposeBackendFromAiSettings(
        baseSettings({ apiMode: "user_api_key", provider: "google", isConfigured: true }),
        credentialsGoogle,
      ),
    ).toBe("user_google");
  });
});
