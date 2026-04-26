/**
 * listClaudeModels のユニットテスト
 *
 * - SDK の `query()` を `vi.mock` で差し替え、`initializationResult` の戻り値を
 *   `ClaudeModelInfo[]` にマップしていること、`finally` で `q.close()` を必ず呼ぶことを検証する。
 *
 * Unit tests for {@link listClaudeModels}. The SDK's `query()` is mocked so the test does
 * not require a real Claude session.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: (...args: unknown[]) => queryMock(...args),
}));

import { listClaudeModels } from "./models";

interface FakeQuery {
  initializationResult: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

/** Build a minimal `Query` stub matching the methods listClaudeModels touches. / 必要メソッドだけのスタブ */
function fakeQuery(initImpl: () => Promise<unknown> = async () => ({ models: [] })): FakeQuery {
  return {
    initializationResult: vi.fn(initImpl),
    close: vi.fn(),
  };
}

beforeEach(() => {
  queryMock.mockReset();
});

afterEach(() => {
  queryMock.mockReset();
});

describe("listClaudeModels", () => {
  it("requests a minimal plan-mode query (maxTurns:0, permissionMode:'plan')", async () => {
    const fq = fakeQuery();
    queryMock.mockReturnValue(fq);

    await listClaudeModels();

    expect(queryMock).toHaveBeenCalledOnce();
    const arg = queryMock.mock.calls[0]?.[0] as {
      prompt: string;
      options: { maxTurns: number; permissionMode: string };
    };
    expect(arg.prompt).toBe("");
    expect(arg.options.maxTurns).toBe(0);
    expect(arg.options.permissionMode).toBe("plan");
  });

  it("maps initializationResult.models to ClaudeModelInfo[]", async () => {
    const fq = fakeQuery(async () => ({
      models: [
        {
          value: "claude-opus-4-7",
          displayName: "Claude Opus 4.7",
          description: "Most capable",
          // 余計なフィールドはマップから落ちる / extra fields must be dropped from the result.
          extra: "ignored",
        },
        {
          value: "claude-haiku-4-5",
          displayName: "Claude Haiku 4.5",
          description: "Fast and cheap",
        },
      ],
    }));
    queryMock.mockReturnValue(fq);

    const models = await listClaudeModels();
    expect(models).toEqual([
      {
        value: "claude-opus-4-7",
        displayName: "Claude Opus 4.7",
        description: "Most capable",
      },
      {
        value: "claude-haiku-4-5",
        displayName: "Claude Haiku 4.5",
        description: "Fast and cheap",
      },
    ]);
    expect(fq.initializationResult).toHaveBeenCalledOnce();
  });

  it("calls q.close() even when initializationResult rejects", async () => {
    const fq = fakeQuery(() => Promise.reject(new Error("init failed")));
    queryMock.mockReturnValue(fq);

    await expect(listClaudeModels()).rejects.toThrow("init failed");
    expect(fq.close).toHaveBeenCalledOnce();
  });

  it("calls q.close() exactly once on success", async () => {
    const fq = fakeQuery(async () => ({ models: [] }));
    queryMock.mockReturnValue(fq);

    await listClaudeModels();
    expect(fq.close).toHaveBeenCalledOnce();
  });

  it("returns an empty array when the SDK exposes no models", async () => {
    const fq = fakeQuery(async () => ({ models: [] }));
    queryMock.mockReturnValue(fq);

    expect(await listClaudeModels()).toEqual([]);
  });
});
