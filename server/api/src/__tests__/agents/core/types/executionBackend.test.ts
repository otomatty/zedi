import { describe, expect, it, vi, beforeEach } from "vitest";

const mockGetUserAiCredentialPlaintext = vi.fn();

vi.mock("../../../../services/userAiCredentialService.js", () => ({
  getUserAiCredentialPlaintext: (...args: unknown[]) => mockGetUserAiCredentialPlaintext(...args),
}));

import {
  resolveWebSearchExecutionBackend,
  resolveWebSearchExecutionBackendForRun,
} from "../../../../agents/core/types/executionBackend.js";

describe("resolveWebSearchExecutionBackend", () => {
  it("uses zedi_managed for zedi_managed sessions", () => {
    expect(resolveWebSearchExecutionBackend("zedi_managed", "openai")).toBe("zedi_managed");
  });

  it("uses session backend when provider matches", () => {
    expect(resolveWebSearchExecutionBackend("user_openai", "openai")).toBe("user_openai");
  });

  it("uses cross-provider BYOK credential when session is another provider", () => {
    expect(resolveWebSearchExecutionBackend("user_anthropic", "openai")).toBe("user_openai");
  });
});

describe("resolveWebSearchExecutionBackendForRun", () => {
  beforeEach(() => {
    mockGetUserAiCredentialPlaintext.mockReset();
  });

  it("falls back to zedi_managed when cross-provider credential is missing", async () => {
    mockGetUserAiCredentialPlaintext.mockResolvedValue(null);
    await expect(
      resolveWebSearchExecutionBackendForRun("user_anthropic", "openai", "user-1", {} as never),
    ).resolves.toBe("zedi_managed");
  });

  it("uses cross-provider BYOK when credential exists", async () => {
    mockGetUserAiCredentialPlaintext.mockResolvedValue("sk-openai");
    await expect(
      resolveWebSearchExecutionBackendForRun("user_anthropic", "openai", "user-1", {} as never),
    ).resolves.toBe("user_openai");
  });
});
