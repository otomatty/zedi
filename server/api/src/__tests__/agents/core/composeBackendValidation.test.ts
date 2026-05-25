import { describe, expect, it, vi, beforeEach } from "vitest";
import { HTTPException } from "hono/http-exception";
import { assertComposeBackendReady } from "../../../agents/core/composeBackendValidation.js";

const mockGetUserAiCredentialPlaintext = vi.fn();

vi.mock("../../../services/userAiCredentialService.js", () => ({
  getUserAiCredentialPlaintext: (...args: unknown[]) => mockGetUserAiCredentialPlaintext(...args),
}));

describe("assertComposeBackendReady", () => {
  const db = {} as never;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserAiCredentialPlaintext.mockResolvedValue("sk-user");
  });

  it("no-ops for zedi_managed", async () => {
    await assertComposeBackendReady({
      backend: "zedi_managed",
      graphId: "wiki-compose",
      userId: "u1",
      tier: "free",
      db,
    });
    expect(mockGetUserAiCredentialPlaintext).not.toHaveBeenCalled();
  });

  it("allows BYOK backend without static env model provider mismatch (#972)", async () => {
    await assertComposeBackendReady({
      backend: "user_openai",
      graphId: "wiki-compose-research",
      userId: "u1",
      tier: "free",
      db,
    });
    expect(mockGetUserAiCredentialPlaintext).toHaveBeenCalledWith("u1", "openai", db);
  });

  it("skips credential check for model-less graphs (wiki-maintenance)", async () => {
    await assertComposeBackendReady({
      backend: "user_anthropic",
      graphId: "wiki-maintenance",
      userId: "u1",
      tier: "free",
      db,
    });
    expect(mockGetUserAiCredentialPlaintext).not.toHaveBeenCalled();
  });

  it("throws 400 when credential is missing", async () => {
    mockGetUserAiCredentialPlaintext.mockResolvedValue(null);
    await expect(
      assertComposeBackendReady({
        backend: "user_anthropic",
        graphId: "wiki-compose-research",
        userId: "u1",
        tier: "free",
        db,
      }),
    ).rejects.toBeInstanceOf(HTTPException);
  });
});
