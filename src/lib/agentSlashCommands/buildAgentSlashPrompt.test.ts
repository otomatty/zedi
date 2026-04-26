/**
 * Dispatcher-level tests for `buildAgentSlashPrompt` and Claude option policy.
 * `buildAgentSlashPrompt` 振り分けと Claude 実行ポリシーのテスト。
 */

import type { Editor } from "@tiptap/core";
import { describe, expect, it, vi } from "vitest";
import { buildAgentSlashPrompt, getAgentSlashClaudeOptions } from "./buildAgentSlashPrompt";
import type { AgentSlashCommandId } from "./types";

/**
 * Minimal editor mock used only by `agent-explain` / `agent-summarize` paths
 * when captures are not supplied. Other branches do not touch the editor.
 * `agent-explain` / `agent-summarize` 以外の分岐ではエディタを触らない。
 */
function makeMockEditor(opts: { plainText?: string; selectionText?: string }): Editor {
  return {
    getText: vi.fn(() => opts.plainText ?? ""),
    state: {
      selection: { from: 0, to: opts.selectionText ? opts.selectionText.length : 0 },
      doc: {
        textBetween: vi.fn(() => opts.selectionText ?? ""),
      },
    },
  } as unknown as Editor;
}

describe("buildAgentSlashPrompt — command dispatch", () => {
  // Editor が必要になる分岐は限定的。args の前後空白は trim される契約。
  // Only explain/summarize touch the editor; args are trimmed by contract.

  it.each([
    ["agent-analyze", "  src/lib.ts  ", "Target path (relative to workspace): src/lib.ts"],
    ["agent-run", "  echo hi  ", "Command: echo hi"],
    ["agent-research", "  graphs  ", "Topic: graphs"],
    ["agent-review", "  src/x.ts  ", "Target path: src/x.ts"],
    ["agent-test", "  src/x.test.ts  ", "Focus path or pattern: src/x.test.ts"],
  ] as const)("dispatches %s and forwards trimmed args", (id, args, needle) => {
    const editor = makeMockEditor({});
    const out = buildAgentSlashPrompt(id as AgentSlashCommandId, args, editor);
    expect(out).toContain(needle);
  });

  it("dispatches agent-git-summary regardless of args", () => {
    const editor = makeMockEditor({});
    const out = buildAgentSlashPrompt("agent-git-summary", "ignored args", editor);
    expect(out).toContain("git log -n 20 --oneline");
  });

  it("dispatches agent-explain and forwards the captured selection", () => {
    const editor = makeMockEditor({});
    const out = buildAgentSlashPrompt("agent-explain", "", editor, {
      selectionText: "snippet",
    });
    expect(out).toContain("Selection:");
    expect(out).toContain("snippet");
    expect(editor.state.doc.textBetween).not.toHaveBeenCalled();
  });

  it("dispatches agent-summarize and forwards the captured plain text", () => {
    const editor = makeMockEditor({});
    const out = buildAgentSlashPrompt("agent-summarize", "", editor, {
      plainText: "body",
    });
    expect(out).toContain("Note text:\nbody");
    expect(editor.getText).not.toHaveBeenCalled();
  });

  it("falls back to the live editor when captures are absent (explain)", () => {
    const editor = makeMockEditor({ selectionText: "live" });
    const out = buildAgentSlashPrompt("agent-explain", "", editor);
    expect(out).toContain("live");
    expect(editor.state.doc.textBetween).toHaveBeenCalled();
  });

  it("falls back to the live editor when captures are absent (summarize)", () => {
    const editor = makeMockEditor({ plainText: "live body" });
    const out = buildAgentSlashPrompt("agent-summarize", "", editor);
    expect(out).toContain("live body");
    expect(editor.getText).toHaveBeenCalled();
  });

  it("throws on an unknown command id (defensive exhaustiveness check)", () => {
    const editor = makeMockEditor({});
    // 型に存在しない id を渡したケースのフェイルセーフ。
    // Defensive guard for an id that bypassed the type system.
    expect(() =>
      buildAgentSlashPrompt("agent-unknown" as unknown as AgentSlashCommandId, "", editor),
    ).toThrow(/Unhandled agent slash command/);
  });
});

describe("getAgentSlashClaudeOptions", () => {
  it.each([
    ["agent-analyze", 20, ["Read"]],
    ["agent-explain", 8, []],
    ["agent-git-summary", 10, ["Bash"]],
    ["agent-research", 20, ["WebSearch", "Read"]],
    ["agent-review", 20, ["Read"]],
    ["agent-run", 12, ["Bash"]],
    ["agent-summarize", 16, []],
    ["agent-test", 18, ["Bash", "Read"]],
  ] as const)("returns the policy for %s", (id, maxTurns, allowedTools) => {
    const opts = getAgentSlashClaudeOptions(id as AgentSlashCommandId);
    expect(opts.maxTurns).toBe(maxTurns);
    expect(opts.allowedTools).toEqual(allowedTools);
  });

  it("throws on an unknown command id (defensive exhaustiveness check)", () => {
    expect(() =>
      getAgentSlashClaudeOptions("agent-unknown" as unknown as AgentSlashCommandId),
    ).toThrow(/Unhandled agent slash command/);
  });
});
