import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/platform", () => ({
  isTauriDesktop: () => true,
}));

/** Flushes microtasks until `runQueryToCompletion` passes listener setup and `await claudeQuery`. */
async function flushMicrotasks(rounds = 12): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await Promise.resolve();
  }
}

let onChunk: (p: { id: string; content: string }) => void = () => {};
let onComplete: (p: { id: string; result: { content: string } }) => void = () => {};
let onError: (p: { id: string; error: string }) => void = () => {};

vi.mock("./bridge", () => ({
  claudeQuery: vi.fn(),
  claudeAbort: vi.fn(),
  onClaudeStreamChunk: vi.fn((cb: typeof onChunk) => {
    onChunk = cb;
    return Promise.resolve(() => {});
  }),
  onClaudeStreamComplete: vi.fn((cb: typeof onComplete) => {
    onComplete = cb;
    return Promise.resolve(() => {});
  }),
  onClaudeError: vi.fn((cb: typeof onError) => {
    onError = cb;
    return Promise.resolve(() => {});
  }),
  onClaudeToolUseStart: vi.fn().mockResolvedValue(() => {}),
  onClaudeToolUseComplete: vi.fn().mockResolvedValue(() => {}),
}));

import { claudeQuery } from "./bridge";
import { runClaudeQueryToCompletion } from "./runQueryToCompletion";

describe("runClaudeQueryToCompletion", () => {
  beforeEach(() => {
    vi.mocked(claudeQuery).mockReset();
  });

  it("returns final content when stream-complete fires", async () => {
    vi.mocked(claudeQuery).mockResolvedValue("req-1");
    const pending = runClaudeQueryToCompletion("prompt", {});
    await flushMicrotasks();
    onComplete({ id: "req-1", result: { content: "final" } });
    await expect(pending).resolves.toEqual({ ok: true, content: "final" });
  });

  it("replays chunks buffered before request id is assigned", async () => {
    vi.mocked(claudeQuery).mockImplementation(async () => {
      onChunk({ id: "req-1", content: "early" });
      return "req-1";
    });
    const pending = runClaudeQueryToCompletion("prompt", {});
    await flushMicrotasks();
    onComplete({ id: "req-1", result: { content: "final" } });
    await expect(pending).resolves.toEqual({ ok: true, content: "final" });
  });

  it("returns error when sidecar emits error", async () => {
    vi.mocked(claudeQuery).mockResolvedValue("req-1");
    const pending = runClaudeQueryToCompletion("prompt", {});
    await flushMicrotasks();
    onError({ id: "req-1", error: "boom" });
    await expect(pending).resolves.toEqual({ ok: false, error: "boom" });
  });
});
