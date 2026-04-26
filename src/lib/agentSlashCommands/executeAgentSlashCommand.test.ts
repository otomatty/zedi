/**
 * Tests for the high-level orchestration of one slash-agent execution.
 * スラッシュエージェント 1 回分のオーケストレーションテスト。
 */

import type { Editor } from "@tiptap/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/claudeCode/runQueryToCompletion", () => ({
  runClaudeQueryToCompletion: vi.fn(),
}));

vi.mock("./buildAgentSlashPrompt", () => ({
  buildAgentSlashPrompt: vi.fn(() => "PROMPT"),
  getAgentSlashClaudeOptions: vi.fn(() => ({ maxTurns: 5, allowedTools: ["Read"] })),
  getEditorPlainText: vi.fn(() => "PLAIN"),
  getEditorSelectionText: vi.fn(() => ""),
}));

vi.mock("./insertSlashAgentMarkdown", () => ({
  insertSlashAgentMarkdownAt: vi.fn(),
}));

vi.mock("./insertPosition", () => ({
  readSlashAgentInsertPosition: vi.fn(() => "cursor"),
}));

vi.mock("./slashAgentSelectionCache", () => ({
  clearLastSlashAgentSelection: vi.fn(),
  getLastSlashAgentSelection: vi.fn(() => ""),
}));

import { runClaudeQueryToCompletion } from "@/lib/claudeCode/runQueryToCompletion";
import {
  buildAgentSlashPrompt,
  getAgentSlashClaudeOptions,
  getEditorSelectionText,
} from "./buildAgentSlashPrompt";
import { executeAgentSlashCommand } from "./executeAgentSlashCommand";
import {
  getSlashAgentCommandHook,
  registerSlashAgentCommandHook,
  type SlashAgentCommandHook,
} from "./hook";
import { readSlashAgentInsertPosition } from "./insertPosition";
import { insertSlashAgentMarkdownAt } from "./insertSlashAgentMarkdown";
import {
  clearLastSlashAgentSelection,
  getLastSlashAgentSelection,
} from "./slashAgentSelectionCache";

/**
 * Builds a fluent editor mock with traceable chain calls and a mutable cursor.
 * チェーン呼び出しを追跡できるエディタモックを構築する。
 */
function makeMockEditor(opts: { cursorAfterDelete?: number } = {}): {
  editor: Editor;
  deleteRange: ReturnType<typeof vi.fn>;
  insertContentAt: ReturnType<typeof vi.fn>;
} {
  const deleteRange = vi.fn();
  const insertContentAt = vi.fn();

  const chainObj: {
    focus: () => typeof chainObj;
    deleteRange: (range: unknown) => typeof chainObj;
    insertContentAt: (pos: number, content: unknown) => typeof chainObj;
    run: () => boolean;
  } = {
    focus() {
      return chainObj;
    },
    deleteRange(range) {
      deleteRange(range);
      return chainObj;
    },
    insertContentAt(pos, content) {
      insertContentAt(pos, content);
      return chainObj;
    },
    run() {
      return true;
    },
  };

  const editor = {
    chain: vi.fn(() => chainObj),
    state: {
      selection: { from: opts.cursorAfterDelete ?? 12 },
    },
  } as unknown as Editor;

  return { editor, deleteRange, insertContentAt };
}

beforeEach(() => {
  vi.mocked(runClaudeQueryToCompletion).mockReset();
  vi.mocked(buildAgentSlashPrompt).mockClear();
  vi.mocked(getAgentSlashClaudeOptions).mockClear();
  vi.mocked(getEditorSelectionText).mockReset().mockReturnValue("");
  vi.mocked(insertSlashAgentMarkdownAt).mockReset();
  vi.mocked(readSlashAgentInsertPosition).mockReset().mockReturnValue("cursor");
  vi.mocked(clearLastSlashAgentSelection).mockReset();
  vi.mocked(getLastSlashAgentSelection).mockReset().mockReturnValue("");
});

afterEach(() => {
  registerSlashAgentCommandHook(null);
});

describe("executeAgentSlashCommand — hook short-circuit", () => {
  it("uses hook output without calling Claude", async () => {
    const hook: SlashAgentCommandHook = vi.fn(() => ({ markdown: "from-hook" }));
    registerSlashAgentCommandHook(hook);

    const { editor, deleteRange } = makeMockEditor({ cursorAfterDelete: 17 });

    const result = await executeAgentSlashCommand({
      commandId: "agent-analyze",
      query: "analyze src/foo.ts",
      editor,
      range: { from: 4, to: 10 },
    });

    expect(result).toBeNull();
    expect(hook).toHaveBeenCalledTimes(1);
    expect(deleteRange).toHaveBeenCalledWith({ from: 4, to: 10 });
    // Claude 経路に進まないこと。
    // The Claude pipeline must not run when the hook resolves.
    expect(runClaudeQueryToCompletion).not.toHaveBeenCalled();
    expect(insertSlashAgentMarkdownAt).toHaveBeenCalledWith(editor, 17, "from-hook", "cursor");
  });

  it("returns the hook's error message when the hook throws", async () => {
    registerSlashAgentCommandHook(() => {
      throw new Error("hook boom");
    });

    const { editor, deleteRange } = makeMockEditor();

    const result = await executeAgentSlashCommand({
      commandId: "agent-analyze",
      query: "analyze x",
      editor,
      range: { from: 0, to: 5 },
    });

    expect(result).toBe("hook boom");
    // 失敗時はエディタを変更しない（範囲削除も Claude 呼び出しもしない）。
    // On failure no editor mutation and no Claude call should happen.
    expect(deleteRange).not.toHaveBeenCalled();
    expect(runClaudeQueryToCompletion).not.toHaveBeenCalled();
  });

  it("falls through to Claude when the hook returns null", async () => {
    registerSlashAgentCommandHook(() => null);
    vi.mocked(runClaudeQueryToCompletion).mockResolvedValue({ ok: true, content: "claude-result" });

    const { editor } = makeMockEditor();

    const result = await executeAgentSlashCommand({
      commandId: "agent-analyze",
      query: "analyze src/foo.ts",
      editor,
      range: { from: 0, to: 5 },
    });

    expect(result).toBeNull();
    expect(runClaudeQueryToCompletion).toHaveBeenCalledTimes(1);
    expect(insertSlashAgentMarkdownAt).toHaveBeenCalledWith(
      editor,
      expect.any(Number),
      "claude-result",
      "cursor",
    );
  });
});

describe("executeAgentSlashCommand — Claude execution path", () => {
  it("forwards the resolved args + selection captures to the prompt builder", async () => {
    vi.mocked(runClaudeQueryToCompletion).mockResolvedValue({ ok: true, content: "ok" });
    vi.mocked(getEditorSelectionText).mockReturnValue("live-sel");

    const { editor } = makeMockEditor();

    await executeAgentSlashCommand({
      commandId: "agent-analyze",
      query: "analyze src/foo.ts",
      editor,
      range: { from: 0, to: 5 },
    });

    expect(buildAgentSlashPrompt).toHaveBeenCalledWith("agent-analyze", "src/foo.ts", editor, {
      selectionText: "live-sel",
      plainText: "PLAIN",
    });
  });

  it("merges claudeCwd into the Claude options when provided", async () => {
    vi.mocked(runClaudeQueryToCompletion).mockResolvedValue({ ok: true, content: "ok" });

    const { editor } = makeMockEditor();
    const signal = new AbortController().signal;

    await executeAgentSlashCommand({
      commandId: "agent-run",
      query: "run echo",
      editor,
      range: { from: 0, to: 3 },
      signal,
      claudeCwd: "/tmp/work",
    });

    const [prompt, opts, passedSignal] = vi.mocked(runClaudeQueryToCompletion).mock.calls[0];
    expect(prompt).toBe("PROMPT");
    expect(opts).toEqual({ maxTurns: 5, allowedTools: ["Read"], cwd: "/tmp/work" });
    expect(passedSignal).toBe(signal);
  });

  it("does not include cwd when claudeCwd is omitted", async () => {
    vi.mocked(runClaudeQueryToCompletion).mockResolvedValue({ ok: true, content: "ok" });

    const { editor } = makeMockEditor();

    await executeAgentSlashCommand({
      commandId: "agent-run",
      query: "run echo",
      editor,
      range: { from: 0, to: 3 },
    });

    const opts = vi.mocked(runClaudeQueryToCompletion).mock.calls[0][1];
    expect(opts).toEqual({ maxTurns: 5, allowedTools: ["Read"] });
    expect((opts as Record<string, unknown>).cwd).toBeUndefined();
  });

  it("inserts the Claude content at the post-delete cursor with the chosen position", async () => {
    vi.mocked(runClaudeQueryToCompletion).mockResolvedValue({ ok: true, content: "## Result" });
    vi.mocked(readSlashAgentInsertPosition).mockReturnValue("end");

    const { editor } = makeMockEditor({ cursorAfterDelete: 99 });

    await executeAgentSlashCommand({
      commandId: "agent-analyze",
      query: "analyze x",
      editor,
      range: { from: 0, to: 5 },
    });

    expect(insertSlashAgentMarkdownAt).toHaveBeenCalledWith(editor, 99, "## Result", "end");
  });

  it("inserts a paragraph with the error and returns the message on failure", async () => {
    vi.mocked(runClaudeQueryToCompletion).mockResolvedValue({ ok: false, error: "boom" });

    const { editor, insertContentAt } = makeMockEditor({ cursorAfterDelete: 25 });

    const result = await executeAgentSlashCommand({
      commandId: "agent-analyze",
      query: "analyze x",
      editor,
      range: { from: 0, to: 5 },
    });

    expect(result).toBe("boom");
    expect(insertContentAt).toHaveBeenCalledWith(25, {
      type: "paragraph",
      content: [{ type: "text", text: "Claude Code: boom" }],
    });
    // 失敗時は Markdown 挿入経路を通らないこと。
    // The Markdown-insert path must not run on failure.
    expect(insertSlashAgentMarkdownAt).not.toHaveBeenCalled();
  });

  it("falls back to the cached selection for /explain when the live selection is empty", async () => {
    vi.mocked(runClaudeQueryToCompletion).mockResolvedValue({ ok: true, content: "ok" });
    vi.mocked(getEditorSelectionText).mockReturnValue("");
    vi.mocked(getLastSlashAgentSelection).mockReturnValue("cached");

    const { editor } = makeMockEditor();

    await executeAgentSlashCommand({
      commandId: "agent-explain",
      query: "explain",
      editor,
      range: { from: 0, to: 7 },
    });

    expect(buildAgentSlashPrompt).toHaveBeenCalledWith("agent-explain", "", editor, {
      selectionText: "cached",
      plainText: "PLAIN",
    });
    // 成功時は /explain のキャッシュをクリアする。
    // On success the /explain selection cache is cleared.
    expect(clearLastSlashAgentSelection).toHaveBeenCalledWith(editor);
  });

  it("does not consult the /explain selection cache for other commands", async () => {
    vi.mocked(runClaudeQueryToCompletion).mockResolvedValue({ ok: true, content: "ok" });
    vi.mocked(getEditorSelectionText).mockReturnValue("");

    const { editor } = makeMockEditor();

    await executeAgentSlashCommand({
      commandId: "agent-summarize",
      query: "summarize",
      editor,
      range: { from: 0, to: 9 },
    });

    expect(getLastSlashAgentSelection).not.toHaveBeenCalled();
    expect(clearLastSlashAgentSelection).not.toHaveBeenCalled();
  });

  it("hook short-circuit clears the /explain cache too", async () => {
    registerSlashAgentCommandHook(() => ({ markdown: "from-hook" }));

    const { editor } = makeMockEditor();

    await executeAgentSlashCommand({
      commandId: "agent-explain",
      query: "explain",
      editor,
      range: { from: 0, to: 5 },
    });

    expect(clearLastSlashAgentSelection).toHaveBeenCalledWith(editor);
  });

  it("returns the resolved hook from the registry on each invocation", () => {
    const hook: SlashAgentCommandHook = vi.fn(() => null);
    registerSlashAgentCommandHook(hook);
    expect(getSlashAgentCommandHook()).toBe(hook);
  });
});
