/**
 * aiAccessHelpers の単体テスト。
 * 依存サービス（usageService / subscriptionService / aiProviders）はモックし、
 * エラー → HTTP ステータスのデシジョンテーブルと、provider/model 解決の分岐を検証する。
 *
 * Unit tests for aiAccessHelpers. The collaborating services are mocked so the
 * error → HTTP-status decision table and the provider/model resolution
 * branches can be verified in isolation.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { HTTPException } from "hono/http-exception";
import {
  resolveAiConfigForRequest,
  validateModelAccessOrThrow,
} from "../../services/aiAccessHelpers.js";
import { checkUsage, validateModelAccess } from "../../services/usageService.js";
import { getUserTier } from "../../services/subscriptionService.js";
import { getProviderApiKeyName } from "../../services/aiProviders.js";
import type { Database, UserTier } from "../../types/index.js";

vi.mock("../../services/usageService.js", () => ({
  validateModelAccess: vi.fn(),
  checkUsage: vi.fn(),
}));
vi.mock("../../services/subscriptionService.js", () => ({
  getUserTier: vi.fn(),
}));
vi.mock("../../services/aiProviders.js", () => ({
  getProviderApiKeyName: vi.fn(),
}));

const mockValidateModelAccess = vi.mocked(validateModelAccess);
const mockCheckUsage = vi.mocked(checkUsage);
const mockGetUserTier = vi.mocked(getUserTier);
const mockGetProviderApiKeyName = vi.mocked(getProviderApiKeyName);

/** Dummy DB — never touched directly (all DB access is via mocked services). */
const db = {} as Database;

/** Captures a thrown HTTPException so status + message can be asserted. */
async function catchHttp(promise: Promise<unknown>): Promise<HTTPException> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof HTTPException) return err;
    throw err;
  }
  throw new Error("expected an HTTPException to be thrown");
}

const MODEL_INFO = {
  provider: "openai",
  apiModelId: "gpt-4o-2024-08-06",
  inputCostUnits: 1,
  outputCostUnits: 1,
} as const;

const ALLOWED_USAGE = {
  allowed: true,
  usagePercent: 10,
  remaining: 900,
  tier: "free" as UserTier,
  budgetUnits: 1000,
  consumedUnits: 100,
};

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
});

afterEach(() => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
});

describe("validateModelAccessOrThrow", () => {
  it("成功時は validateModelAccess の結果をそのまま返す / passes through the validateModelAccess result on success", async () => {
    mockValidateModelAccess.mockResolvedValue({ ...MODEL_INFO });

    const result = await validateModelAccessOrThrow("gpt-4o", "free", db);

    expect(result).toEqual(MODEL_INFO);
    expect(mockValidateModelAccess).toHaveBeenCalledWith("gpt-4o", "free", db);
  });

  it("'FORBIDDEN' は 403 に変換する / maps 'FORBIDDEN' to HTTP 403", async () => {
    mockValidateModelAccess.mockRejectedValue(new Error("FORBIDDEN"));

    const err = await catchHttp(validateModelAccessOrThrow("gpt-4o", "free", db));

    expect(err.status).toBe(403);
    expect(err.message).toBe("Model not available for this tier");
  });

  it("'Model not found or inactive' は 400 に変換する / maps a missing model to HTTP 400", async () => {
    mockValidateModelAccess.mockRejectedValue(new Error("Model not found or inactive"));

    const err = await catchHttp(validateModelAccessOrThrow("ghost", "free", db));

    expect(err.status).toBe(400);
    expect(err.message).toBe("Model not found or inactive");
  });

  it("未知のエラーはそのまま再 throw する / rethrows unknown errors unchanged", async () => {
    const boom = new Error("db exploded");
    mockValidateModelAccess.mockRejectedValue(boom);

    await expect(validateModelAccessOrThrow("gpt-4o", "free", db)).rejects.toBe(boom);
  });

  it("Error 以外が throw されても String 化して判定する / stringifies a non-Error rejection before matching", async () => {
    // 文字列など Error でない値が throw されても message 比較が成立する。
    // A raw string rejection still maps via the String(err) fallback.
    mockValidateModelAccess.mockRejectedValue("FORBIDDEN");

    const err = await catchHttp(validateModelAccessOrThrow("gpt-4o", "free", db));

    expect(err.status).toBe(403);
    expect(err.message).toBe("Model not available for this tier");
  });
});

describe("resolveAiConfigForRequest", () => {
  it("provider/model が両方未指定なら null を返す / returns null when neither provider nor model is given", async () => {
    const result = await resolveAiConfigForRequest({
      userId: "u1",
      db,
      provider: undefined,
      model: undefined,
    });

    expect(result).toBeNull();
    // 早期 return なので tier 取得などは一切呼ばれない。
    // Early return — none of the downstream services are consulted.
    expect(mockGetUserTier).not.toHaveBeenCalled();
  });

  it.each([
    ["provider のみ / provider only", "openai", undefined],
    ["model のみ / model only", undefined, "gpt-4o"],
    ["空文字 provider + model / blank provider", "   ", "gpt-4o"],
  ])(
    "片方だけ指定すると 400 を投げる: %s / throws 400 when only one of provider/model is supplied",
    async (_label, provider, model) => {
      const err = await catchHttp(resolveAiConfigForRequest({ userId: "u1", db, provider, model }));

      expect(err.status).toBe(400);
      expect(err.message).toBe("provider and model must be specified together");
    },
  );

  it("サポート外 provider は 400 を投げる / rejects an unsupported provider with 400", async () => {
    const err = await catchHttp(
      resolveAiConfigForRequest({ userId: "u1", db, provider: "cohere", model: "command" }),
    );

    expect(err.status).toBe(400);
    expect(err.message).toBe("unsupported provider: cohere");
  });

  it("正常系: DB の provider/apiModelId と env のキーで解決する / resolves using DB-canonical provider/model and the env API key", async () => {
    mockGetUserTier.mockResolvedValue("free");
    mockValidateModelAccess.mockResolvedValue({ ...MODEL_INFO });
    mockCheckUsage.mockResolvedValue({ ...ALLOWED_USAGE });
    mockGetProviderApiKeyName.mockReturnValue("OPENAI_API_KEY");
    process.env.OPENAI_API_KEY = "sk-env-openai";

    const result = await resolveAiConfigForRequest({
      userId: "u1",
      db,
      provider: "  openai  ",
      model: "  gpt-4o  ",
    });

    expect(result).toEqual({
      provider: "openai",
      apiModelId: "gpt-4o-2024-08-06",
      apiKey: "sk-env-openai",
      internalModelId: "gpt-4o",
      tier: "free",
      modelInfo: MODEL_INFO,
    });
    // クライアント入力はトリムしてから検証・利用する。
    // Client input is trimmed before validation/usage.
    expect(mockValidateModelAccess).toHaveBeenCalledWith("gpt-4o", "free", db);
    expect(mockCheckUsage).toHaveBeenCalledWith("u1", "free", db);
    expect(mockGetProviderApiKeyName).toHaveBeenCalledWith("openai");
  });

  it("DB 上の provider をクライアント入力より優先する / trusts the DB-resolved provider over the client input", async () => {
    // クライアントは openai を要求しているが、DB のモデルは anthropic 所属。
    // 解決後の provider と API キー名は DB 側 (anthropic) に従う。
    // The client asked for openai but the DB model belongs to anthropic; the
    // resolved provider and key name must follow the DB record.
    mockGetUserTier.mockResolvedValue("pro");
    mockValidateModelAccess.mockResolvedValue({
      provider: "anthropic",
      apiModelId: "claude-x",
      inputCostUnits: 1,
      outputCostUnits: 1,
    });
    mockCheckUsage.mockResolvedValue({ ...ALLOWED_USAGE, tier: "pro" });
    mockGetProviderApiKeyName.mockReturnValue("ANTHROPIC_API_KEY");
    process.env.ANTHROPIC_API_KEY = "sk-env-anthropic";

    const result = await resolveAiConfigForRequest({
      userId: "u1",
      db,
      provider: "openai",
      model: "some-model",
    });

    expect(result?.provider).toBe("anthropic");
    expect(result?.apiModelId).toBe("claude-x");
    expect(result?.apiKey).toBe("sk-env-anthropic");
    expect(mockGetProviderApiKeyName).toHaveBeenCalledWith("anthropic");
  });

  it("月次予算を超えていたら 429 を投げる / throws 429 when the monthly budget is exceeded", async () => {
    mockGetUserTier.mockResolvedValue("free");
    mockValidateModelAccess.mockResolvedValue({ ...MODEL_INFO });
    mockCheckUsage.mockResolvedValue({ ...ALLOWED_USAGE, allowed: false });

    const err = await catchHttp(
      resolveAiConfigForRequest({ userId: "u1", db, provider: "openai", model: "gpt-4o" }),
    );

    expect(err.status).toBe(429);
    expect(err.message).toBe("Monthly budget exceeded");
  });

  it("API キーが env に無ければ 503 を投げる / throws 503 when the env API key is not configured", async () => {
    mockGetUserTier.mockResolvedValue("free");
    mockValidateModelAccess.mockResolvedValue({ ...MODEL_INFO });
    mockCheckUsage.mockResolvedValue({ ...ALLOWED_USAGE });
    mockGetProviderApiKeyName.mockReturnValue("OPENAI_API_KEY");
    // OPENAI_API_KEY is intentionally left unset by beforeEach.

    const err = await catchHttp(
      resolveAiConfigForRequest({ userId: "u1", db, provider: "openai", model: "gpt-4o" }),
    );

    expect(err.status).toBe(503);
    expect(err.message).toBe("API key not configured: OPENAI_API_KEY");
  });

  it("検証で FORBIDDEN が出たら 403 が伝播する / propagates 403 from a FORBIDDEN model check", async () => {
    mockGetUserTier.mockResolvedValue("free");
    mockValidateModelAccess.mockRejectedValue(new Error("FORBIDDEN"));

    const err = await catchHttp(
      resolveAiConfigForRequest({ userId: "u1", db, provider: "openai", model: "gpt-4o" }),
    );

    expect(err.status).toBe(403);
    expect(err.message).toBe("Model not available for this tier");
  });
});
