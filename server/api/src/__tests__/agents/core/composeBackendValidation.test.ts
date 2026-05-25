import { describe, expect, it, vi, beforeEach } from "vitest";
import { HTTPException } from "hono/http-exception";
import { assertComposeBackendReady } from "../../../agents/core/composeBackendValidation.js";

const mockValidateModelAccess = vi.fn();
const mockGetUserAiCredentialPlaintext = vi.fn();

vi.mock("../../../services/usageService.js", () => ({
  validateModelAccess: (...args: unknown[]) => mockValidateModelAccess(...args),
}));

vi.mock("../../../services/userAiCredentialService.js", () => ({
  getUserAiCredentialPlaintext: (...args: unknown[]) => mockGetUserAiCredentialPlaintext(...args),
}));

describe("assertComposeBackendReady", () => {
  const db = {} as never;

  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateModelAccess.mockResolvedValue({
      provider: "anthropic",
      apiModelId: "claude-3-5-haiku",
      inputCostUnits: 1,
      outputCostUnits: 2,
    });
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
    expect(mockValidateModelAccess).not.toHaveBeenCalled();
  });

  it("throws 400 when model provider mismatches BYOK backend", async () => {
    mockValidateModelAccess.mockResolvedValue({
      provider: "openai",
      apiModelId: "gpt-4o-mini",
      inputCostUnits: 1,
      outputCostUnits: 2,
    });
    await expect(
      assertComposeBackendReady({
        backend: "user_anthropic",
        graphId: "wiki-compose-research",
        userId: "u1",
        tier: "free",
        db,
      }),
    ).rejects.toMatchObject({ status: 400 });
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
