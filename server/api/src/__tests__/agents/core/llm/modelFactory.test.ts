/**
 * Tests for compose backend validation and BYOK API key resolution (#951).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  assertSupportedComposeBackend,
  assertSupportedBackendP0,
  createZediChatModel,
  UnsupportedBackendError,
  MissingUserCredentialError,
  BackendProviderMismatchError,
} from "../../../../agents/core/llm/modelFactory.js";

const mockValidateModelAccess = vi.fn();
const mockGetUserAiCredentialPlaintext = vi.fn();

vi.mock("../../../../services/usageService.js", () => ({
  validateModelAccess: (...args: unknown[]) => mockValidateModelAccess(...args),
}));

vi.mock("../../../../services/userAiCredentialService.js", () => ({
  getUserAiCredentialPlaintext: (...args: unknown[]) => mockGetUserAiCredentialPlaintext(...args),
}));

describe("assertSupportedComposeBackend", () => {
  it.each(["zedi_managed", "user_anthropic", "user_openai", "user_google"] as const)(
    "accepts %s",
    (backend) => {
      expect(assertSupportedComposeBackend(backend)).toBe(backend);
      expect(assertSupportedBackendP0(backend)).toBe(backend);
    },
  );

  it.each(["byok", "byo_runner", "unknown", "", "ZEDI_MANAGED"])(
    "throws UnsupportedBackendError for %s",
    (backend) => {
      expect(() => assertSupportedComposeBackend(backend)).toThrow(UnsupportedBackendError);
    },
  );
});

describe("createZediChatModel backend resolution", () => {
  const db = {} as never;
  const baseInput = {
    modelId: "openai:gpt-4o-mini",
    userId: "user-1",
    tier: "free" as const,
    db,
    feature: "wiki_compose:test",
    temperature: 0.2,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateModelAccess.mockResolvedValue({
      provider: "openai",
      apiModelId: "gpt-4o-mini",
      inputCostUnits: 1,
      outputCostUnits: 2,
    });
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  it("resolves zedi_managed from process.env", async () => {
    process.env.OPENAI_API_KEY = "sk-system";
    const model = await createZediChatModel({
      ...baseInput,
      backend: "zedi_managed",
    });
    expect(model).toBeDefined();
    expect(mockGetUserAiCredentialPlaintext).not.toHaveBeenCalled();
  });

  it("resolves user_openai from stored credential", async () => {
    mockGetUserAiCredentialPlaintext.mockResolvedValue("sk-user");
    const model = await createZediChatModel({
      ...baseInput,
      backend: "user_openai",
    });
    expect(model).toBeDefined();
    expect(mockGetUserAiCredentialPlaintext).toHaveBeenCalledWith("user-1", "openai", db);
  });

  it("throws MissingUserCredentialError when BYOK key is absent", async () => {
    mockGetUserAiCredentialPlaintext.mockResolvedValue(null);
    await expect(
      createZediChatModel({
        ...baseInput,
        backend: "user_openai",
      }),
    ).rejects.toThrow(MissingUserCredentialError);
  });

  it("throws BackendProviderMismatchError when model provider differs from backend", async () => {
    mockValidateModelAccess.mockResolvedValue({
      provider: "anthropic",
      apiModelId: "claude-3-5-sonnet-20241022",
      inputCostUnits: 1,
      outputCostUnits: 2,
    });
    await expect(
      createZediChatModel({
        ...baseInput,
        backend: "user_openai",
      }),
    ).rejects.toThrow(BackendProviderMismatchError);
  });
});
