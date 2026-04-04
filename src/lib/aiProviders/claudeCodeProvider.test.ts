import { describe, it, expect, vi, beforeEach } from "vitest";
import * as aiTypes from "@/types/ai";
import type { AIStreamChunk, AIRequest } from "./types";

vi.mock("@/lib/platform", () => ({
  isTauriDesktop: vi.fn(() => false),
}));

vi.mock("@/lib/claudeCode/bridge", () => ({
  claudeQuery: vi.fn(),
  claudeAbort: vi.fn().mockResolvedValue(undefined),
  onClaudeStreamChunk: vi.fn(),
  onClaudeStreamComplete: vi.fn(),
  onClaudeError: vi.fn(),
  onClaudeToolUseStart: vi.fn(),
  onClaudeToolUseComplete: vi.fn(),
  checkClaudeInstallation: vi.fn(),
}));

import { createClaudeCodeProvider } from "./claudeCodeProvider";

const platformMod = () =>
  import("@/lib/platform") as Promise<{ isTauriDesktop: ReturnType<typeof vi.fn> }>;

const bridgeMod = () =>
  import("@/lib/claudeCode/bridge") as unknown as Promise<{
    claudeQuery: ReturnType<typeof vi.fn>;
    claudeAbort: ReturnType<typeof vi.fn>;
    onClaudeStreamChunk: ReturnType<typeof vi.fn>;
    onClaudeStreamComplete: ReturnType<typeof vi.fn>;
    onClaudeError: ReturnType<typeof vi.fn>;
    onClaudeToolUseStart: ReturnType<typeof vi.fn>;
    onClaudeToolUseComplete: ReturnType<typeof vi.fn>;
    checkClaudeInstallation: ReturnType<typeof vi.fn>;
  }>;

const request: AIRequest = {
  prompt: "test",
  model: "",
  messages: [{ role: "user", content: "Hello" }],
};

/**
 * Sets up bridge mocks for a streaming test.
 * Returns the requestId used by the events.
 */
async function setupStreamingBridge(
  events: Array<
    { type: "chunk"; content: string } | { type: "complete" } | { type: "error"; error: string }
  >,
  requestId = "req-test",
): Promise<void> {
  let chunkCb: ((p: { id: string; content: string }) => void) | null = null;
  let completeCb: ((p: { id: string }) => void) | null = null;
  let errorCb: ((p: { id: string; error: string }) => void) | null = null;

  const bridge = await bridgeMod();
  bridge.onClaudeStreamChunk.mockImplementation(
    (cb: (p: { id: string; content: string }) => void) => {
      chunkCb = cb;
      return Promise.resolve(vi.fn());
    },
  );
  bridge.onClaudeStreamComplete.mockImplementation((cb: (p: { id: string }) => void) => {
    completeCb = cb;
    return Promise.resolve(vi.fn());
  });
  bridge.onClaudeError.mockImplementation((cb: (p: { id: string; error: string }) => void) => {
    errorCb = cb;
    return Promise.resolve(vi.fn());
  });
  bridge.onClaudeToolUseStart.mockImplementation(() => Promise.resolve(vi.fn()));
  bridge.onClaudeToolUseComplete.mockImplementation(() => Promise.resolve(vi.fn()));
  bridge.claudeQuery.mockImplementation(async () => {
    let delay = 0;
    for (const event of events) {
      const currentDelay = delay++;
      setTimeout(() => {
        switch (event.type) {
          case "chunk":
            chunkCb?.({ id: requestId, content: event.content });
            break;
          case "complete":
            completeCb?.({ id: requestId });
            break;
          case "error":
            errorCb?.({ id: requestId, error: event.error });
            break;
        }
      }, currentDelay);
    }
    return requestId;
  });
}

describe("createClaudeCodeProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exposes correct id and capabilities", () => {
    const p = createClaudeCodeProvider();
    expect(p.id).toBe("claude-code");
    expect(p.capabilities.textGeneration).toBe(true);
    expect(p.capabilities.fileAccess).toBe(true);
    expect(p.capabilities.commandExecution).toBe(true);
    expect(p.capabilities.mcpIntegration).toBe(true);
    expect(p.capabilities.agentLoop).toBe(true);
  });

  it("throws when provider metadata not found", () => {
    const spy = vi.spyOn(aiTypes, "getProviderById").mockReturnValue(undefined);
    expect(() => createClaudeCodeProvider()).toThrow("metadata not found");
    spy.mockRestore();
  });

  describe("isAvailable", () => {
    it("returns false outside Tauri", async () => {
      const { isTauriDesktop } = await platformMod();
      isTauriDesktop.mockReturnValue(false);

      expect(await createClaudeCodeProvider().isAvailable()).toBe(false);
    });

    it("returns true when Claude is installed in Tauri", async () => {
      const { isTauriDesktop } = await platformMod();
      isTauriDesktop.mockReturnValue(true);

      const bridge = await bridgeMod();
      bridge.checkClaudeInstallation.mockResolvedValue({ installed: true });

      expect(await createClaudeCodeProvider().isAvailable()).toBe(true);
    });

    it("returns false when Claude is not installed", async () => {
      const { isTauriDesktop } = await platformMod();
      isTauriDesktop.mockReturnValue(true);

      const bridge = await bridgeMod();
      bridge.checkClaudeInstallation.mockResolvedValue({ installed: false });

      expect(await createClaudeCodeProvider().isAvailable()).toBe(false);
    });

    it("returns false when checkClaudeInstallation throws", async () => {
      const { isTauriDesktop } = await platformMod();
      isTauriDesktop.mockReturnValue(true);

      const bridge = await bridgeMod();
      bridge.checkClaudeInstallation.mockRejectedValue(new Error("fail"));

      expect(await createClaudeCodeProvider().isAvailable()).toBe(false);
    });
  });

  describe("query", () => {
    it("yields error when not in Tauri", async () => {
      const { isTauriDesktop } = await platformMod();
      isTauriDesktop.mockReturnValue(false);

      const chunks: AIStreamChunk[] = [];
      for await (const c of createClaudeCodeProvider().query(request)) {
        chunks.push(c);
      }

      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe("error");
      expect(chunks[0].content).toContain("デスクトップアプリ");
    });

    it("streams text chunks from bridge events and completes", async () => {
      const { isTauriDesktop } = await platformMod();
      isTauriDesktop.mockReturnValue(true);

      await setupStreamingBridge([
        { type: "chunk", content: "Hello" },
        { type: "chunk", content: " world" },
        { type: "complete" },
      ]);

      const chunks: AIStreamChunk[] = [];
      for await (const c of createClaudeCodeProvider().query(request)) {
        chunks.push(c);
      }

      expect(chunks).toContainEqual({ type: "text", content: "Hello" });
      expect(chunks).toContainEqual({ type: "text", content: " world" });
    });

    it("completes without hanging on error event", async () => {
      const { isTauriDesktop } = await platformMod();
      isTauriDesktop.mockReturnValue(true);

      await setupStreamingBridge([
        { type: "chunk", content: "partial" },
        { type: "error", error: "something broke" },
      ]);

      const chunks: AIStreamChunk[] = [];
      for await (const c of createClaudeCodeProvider().query(request)) {
        chunks.push(c);
      }

      expect(chunks).toContainEqual({ type: "text", content: "partial" });
    });

    it("passes prompt and options to claudeQuery", async () => {
      const { isTauriDesktop } = await platformMod();
      isTauriDesktop.mockReturnValue(true);

      await setupStreamingBridge([{ type: "complete" }]);

      const req: AIRequest = {
        prompt: "test",
        model: "",
        messages: [{ role: "user", content: "Do something" }],
        options: { cwd: "/tmp", maxTurns: 3 },
      };

      for await (const _ of createClaudeCodeProvider().query(req)) {
        // consume
      }

      const bridge = await bridgeMod();
      expect(bridge.claudeQuery).toHaveBeenCalledWith("Do something", {
        cwd: "/tmp",
        maxTurns: 3,
        allowedTools: undefined,
      });
    });

    it("ignores events from a different request ID", async () => {
      const { isTauriDesktop } = await platformMod();
      isTauriDesktop.mockReturnValue(true);

      let chunkCb: ((p: { id: string; content: string }) => void) | null = null;
      let completeCb: ((p: { id: string }) => void) | null = null;
      let errorCb: ((p: { id: string; error: string }) => void) | null = null;

      const bridge = await bridgeMod();
      bridge.onClaudeStreamChunk.mockImplementation(
        (cb: (p: { id: string; content: string }) => void) => {
          chunkCb = cb;
          return Promise.resolve(vi.fn());
        },
      );
      bridge.onClaudeStreamComplete.mockImplementation((cb: (p: { id: string }) => void) => {
        completeCb = cb;
        return Promise.resolve(vi.fn());
      });
      bridge.onClaudeError.mockImplementation((cb: (p: { id: string; error: string }) => void) => {
        errorCb = cb;
        return Promise.resolve(vi.fn());
      });

      bridge.claudeQuery.mockImplementation(async () => {
        setTimeout(() => {
          chunkCb?.({ id: "other-req", content: "WRONG" });
          errorCb?.({ id: "other-req", error: "WRONG ERROR" });
        }, 0);
        setTimeout(() => {
          chunkCb?.({ id: "correct-req", content: "RIGHT" });
        }, 1);
        setTimeout(() => {
          completeCb?.({ id: "correct-req" });
        }, 2);
        return "correct-req";
      });

      const chunks: AIStreamChunk[] = [];
      for await (const c of createClaudeCodeProvider().query(request)) {
        chunks.push(c);
      }

      expect(chunks).toContainEqual({ type: "text", content: "RIGHT" });
      expect(chunks).not.toContainEqual(expect.objectContaining({ content: "WRONG" }));
      expect(chunks).not.toContainEqual(expect.objectContaining({ content: "WRONG ERROR" }));
    });

    it("joins message contents with double newline for prompt", async () => {
      const { isTauriDesktop } = await platformMod();
      isTauriDesktop.mockReturnValue(true);

      await setupStreamingBridge([{ type: "complete" }]);

      const req: AIRequest = {
        prompt: "test",
        model: "",
        messages: [
          { role: "user", content: "First" },
          { role: "assistant", content: "Response" },
          { role: "user", content: "Second" },
        ],
      };

      for await (const _ of createClaudeCodeProvider().query(req)) {
        // consume
      }

      const bridge = await bridgeMod();
      expect(bridge.claudeQuery).toHaveBeenCalledWith(
        "First\n\nResponse\n\nSecond",
        expect.anything(),
      );
    });

    it("cleans up listeners after completion", async () => {
      const { isTauriDesktop } = await platformMod();
      isTauriDesktop.mockReturnValue(true);

      const unlistenChunk = vi.fn();
      const unlistenComplete = vi.fn();
      const unlistenError = vi.fn();

      const bridge = await bridgeMod();
      bridge.onClaudeStreamChunk.mockImplementation(() => Promise.resolve(unlistenChunk));
      bridge.onClaudeStreamComplete.mockImplementation((cb: (p: { id: string }) => void) => {
        setTimeout(() => cb({ id: "req-cleanup" }), 0);
        return Promise.resolve(unlistenComplete);
      });
      bridge.onClaudeError.mockImplementation(() => Promise.resolve(unlistenError));
      bridge.claudeQuery.mockResolvedValue("req-cleanup");

      for await (const _ of createClaudeCodeProvider().query(request)) {
        // consume
      }

      expect(unlistenChunk).toHaveBeenCalled();
      expect(unlistenComplete).toHaveBeenCalled();
      expect(unlistenError).toHaveBeenCalled();
    });
  });

  describe("abort", () => {
    it("calls claudeAbort when in Tauri with active request", async () => {
      const { isTauriDesktop } = await platformMod();
      isTauriDesktop.mockReturnValue(true);

      await setupStreamingBridge([
        { type: "chunk", content: "Hello" },
        // No complete event — we will abort instead
      ]);

      const provider = createClaudeCodeProvider();
      const iterator = provider.query(request)[Symbol.asyncIterator]();

      const first = await iterator.next();
      expect(first.value).toEqual({ type: "text", content: "Hello" });

      provider.abort();

      const bridge = await bridgeMod();
      await vi.waitFor(() => {
        expect(bridge.claudeAbort).toHaveBeenCalledWith("req-test");
      });
    });
  });
});
