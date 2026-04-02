import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  checkClaudeInstallation,
  claudeAbort,
  claudeQuery,
  claudeStatus,
  onClaudeError,
  onClaudeStreamChunk,
  onClaudeStreamComplete,
} from "./bridge";

describe("claudeCode bridge", () => {
  const originals = { window: globalThis.window };

  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(listen).mockReset();
    vi.mocked(listen).mockResolvedValue(() => {});
    Object.defineProperty(globalThis, "window", {
      value: { __TAURI_INTERNALS__: {} },
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "window", {
      value: originals.window,
      configurable: true,
    });
  });

  it("claudeQuery invokes claude_query with camelCase args", async () => {
    vi.mocked(invoke).mockResolvedValue("req-1");
    const id = await claudeQuery("hello", { cwd: "/tmp", maxTurns: 5 });
    expect(id).toBe("req-1");
    expect(invoke).toHaveBeenCalledWith("claude_query", {
      prompt: "hello",
      cwd: "/tmp",
      maxTurns: 5,
      allowedTools: null,
      resume: null,
    });
  });

  it("claudeAbort invokes claude_abort", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await claudeAbort("req-1");
    expect(invoke).toHaveBeenCalledWith("claude_abort", { requestId: "req-1" });
  });

  it("claudeStatus invokes claude_status", async () => {
    const status = {
      type: "status-response" as const,
      correlationId: "c",
      status: "idle" as const,
      activeQueryIds: [],
    };
    vi.mocked(invoke).mockResolvedValue(status);
    await expect(claudeStatus()).resolves.toEqual(status);
  });

  it("checkClaudeInstallation invokes check_claude_installation", async () => {
    const inst = {
      type: "installation-status" as const,
      correlationId: "c",
      installed: false,
    };
    vi.mocked(invoke).mockResolvedValue(inst);
    await expect(checkClaudeInstallation()).resolves.toEqual(inst);
  });

  it("onClaudeStreamChunk registers listen with event name", async () => {
    await onClaudeStreamChunk(() => {});
    expect(listen).toHaveBeenCalledWith("claude-stream-chunk", expect.any(Function));
  });

  it("onClaudeStreamComplete registers listen with event name", async () => {
    await onClaudeStreamComplete(() => {});
    expect(listen).toHaveBeenCalledWith("claude-stream-complete", expect.any(Function));
  });

  it("onClaudeError registers listen with event name", async () => {
    await onClaudeError(() => {});
    expect(listen).toHaveBeenCalledWith("claude-error", expect.any(Function));
  });

  it("throws when not in Tauri", async () => {
    Object.defineProperty(globalThis, "window", {
      value: {},
      configurable: true,
    });
    await expect(claudeQuery("x")).rejects.toThrow(/desktop app/i);
  });
});
