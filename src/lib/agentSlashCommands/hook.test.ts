/**
 * Tests for the global slash-agent command hook registry.
 * グローバルなスラッシュエージェントフック登録のテスト。
 */

import type { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getSlashAgentCommandHook,
  registerSlashAgentCommandHook,
  type SlashAgentCommandHook,
} from "./hook";

afterEach(() => {
  // 共有モジュール状態を必ずリセットする（テスト間の漏れ防止）。
  // Always reset shared module state to prevent cross-test bleed.
  registerSlashAgentCommandHook(null);
});

describe("registerSlashAgentCommandHook / getSlashAgentCommandHook", () => {
  it("returns null when no hook is registered", () => {
    expect(getSlashAgentCommandHook()).toBeNull();
  });

  it("registers the supplied hook and exposes it via the getter", () => {
    const hook: SlashAgentCommandHook = vi.fn(() => null);
    registerSlashAgentCommandHook(hook);
    expect(getSlashAgentCommandHook()).toBe(hook);
  });

  it("clears the registered hook when null is passed", () => {
    const hook: SlashAgentCommandHook = vi.fn(() => null);
    registerSlashAgentCommandHook(hook);
    registerSlashAgentCommandHook(null);
    expect(getSlashAgentCommandHook()).toBeNull();
  });

  it("replaces the previous hook on re-registration", () => {
    const first: SlashAgentCommandHook = vi.fn(() => null);
    const second: SlashAgentCommandHook = vi.fn(() => null);
    registerSlashAgentCommandHook(first);
    registerSlashAgentCommandHook(second);
    expect(getSlashAgentCommandHook()).toBe(second);
  });

  it("invokes the registered hook with the supplied context", async () => {
    const hook: SlashAgentCommandHook = vi.fn(() => ({ markdown: "from-hook" }));
    registerSlashAgentCommandHook(hook);
    const editor = {} as Editor;
    const result = await getSlashAgentCommandHook()?.({
      commandId: "agent-analyze",
      args: "src/x",
      query: "analyze src/x",
      editor,
    });
    expect(hook).toHaveBeenCalledWith({
      commandId: "agent-analyze",
      args: "src/x",
      query: "analyze src/x",
      editor,
    });
    expect(result).toEqual({ markdown: "from-hook" });
  });
});
