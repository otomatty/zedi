/**
 * Per-command prompt builder tests for agent slash commands.
 * エージェントスラッシュ各コマンドのプロンプト生成テスト。
 */

import type { Editor } from "@tiptap/core";
import { describe, expect, it, vi } from "vitest";
import {
  buildAnalyzePrompt,
  buildExplainPrompt,
  buildGitSummaryPrompt,
  buildResearchPrompt,
  buildReviewPrompt,
  buildRunPrompt,
  buildSummarizePrompt,
  buildTestPrompt,
} from "./buildAgentSlashPromptParts";

/**
 * Builds a minimal mock editor that satisfies the calls made by the
 * prompt-builder helpers (`getText` and selection-aware `textBetween`).
 * プロンプトビルダから呼ばれる API のみを満たす最小モックを返す。
 */
function makeMockEditor(opts: {
  /** Plain text returned from `editor.getText`. / `editor.getText` の戻り値 */
  plainText?: string;
  /** Selection range for `state.selection`. / `state.selection` の範囲 */
  selection?: { from: number; to: number };
  /** Selection text returned by `doc.textBetween`. / `doc.textBetween` の戻り値 */
  selectionText?: string;
}): Editor {
  const sel = opts.selection ?? { from: 0, to: 0 };
  return {
    getText: vi.fn(() => opts.plainText ?? ""),
    state: {
      selection: sel,
      doc: {
        textBetween: vi.fn(() => opts.selectionText ?? ""),
      },
    },
  } as unknown as Editor;
}

describe("buildAnalyzePrompt", () => {
  it("includes the workspace path when args are provided", () => {
    const out = buildAnalyzePrompt("src/lib/foo.ts");
    expect(out).toContain("Target path (relative to workspace): src/lib/foo.ts");
    expect(out).toContain("Analyze the code at the given path");
  });

  it("falls back to inference message when args are empty", () => {
    const out = buildAnalyzePrompt("");
    expect(out).toContain("No path was given");
    expect(out).not.toContain("Target path (relative to workspace):");
  });
});

describe("buildGitSummaryPrompt", () => {
  it("instructs to run git log and summarize in Japanese", () => {
    const out = buildGitSummaryPrompt();
    expect(out).toContain("git log -n 20 --oneline");
    expect(out).toContain("Bash");
    expect(out).toContain("Japanese");
  });
});

describe("buildRunPrompt", () => {
  it("includes the command when args are provided", () => {
    const out = buildRunPrompt("ls -la");
    expect(out).toContain("Command: ls -la");
    expect(out).toContain("Bash");
  });

  it("asks the user to provide a command when args are empty", () => {
    const out = buildRunPrompt("");
    expect(out).toContain("No command was given");
  });
});

describe("buildResearchPrompt", () => {
  it("includes the topic when args are provided", () => {
    const out = buildResearchPrompt("Tiptap performance");
    expect(out).toContain("Topic: Tiptap performance");
    expect(out).toContain("WebSearch");
  });

  it("asks the user to specify a topic when args are empty", () => {
    const out = buildResearchPrompt("");
    expect(out).toContain("No topic was given");
  });
});

describe("buildReviewPrompt", () => {
  it("includes the target path when args are provided", () => {
    const out = buildReviewPrompt("src/components/Foo.tsx");
    expect(out).toContain("Target path: src/components/Foo.tsx");
    expect(out).toContain("code review");
  });

  it("asks for a default when args are empty", () => {
    const out = buildReviewPrompt("");
    expect(out).toContain("No path was given");
  });
});

describe("buildTestPrompt", () => {
  it("includes the focus path when args are provided", () => {
    const out = buildTestPrompt("src/lib/foo.test.ts");
    expect(out).toContain("Focus path or pattern: src/lib/foo.test.ts");
    expect(out).toContain("bun run test:run");
  });

  it("falls back to default test script when args are empty", () => {
    const out = buildTestPrompt("");
    expect(out).toContain("No path");
    expect(out).toContain("default test script");
  });
});

describe("buildExplainPrompt", () => {
  it("uses the captured selection text when provided", () => {
    const editor = makeMockEditor({});
    const out = buildExplainPrompt(editor, { selectionText: "captured snippet" });
    expect(out).toContain("Selection:");
    expect(out).toContain("captured snippet");
    // captures.selectionText が優先されるため editor 取得は呼ばれない
    // editor accessors should not be called when captures provide the selection.
    expect(editor.getText).not.toHaveBeenCalled();
  });

  it("falls back to live editor selection when captures are absent", () => {
    const editor = makeMockEditor({
      selection: { from: 1, to: 8 },
      selectionText: "live sel",
    });
    const out = buildExplainPrompt(editor);
    expect(out).toContain("Selection:");
    expect(out).toContain("live sel");
    expect(editor.state.doc.textBetween).toHaveBeenCalled();
  });

  it("instructs the user to select text when no selection is available", () => {
    const editor = makeMockEditor({ selection: { from: 4, to: 4 } });
    const out = buildExplainPrompt(editor);
    expect(out).toContain("No selection");
  });
});

describe("buildSummarizePrompt", () => {
  it("uses the captured plain text when provided", () => {
    const editor = makeMockEditor({});
    const out = buildSummarizePrompt(editor, { plainText: "note body" });
    expect(out).toContain("Note text:\nnote body");
    expect(editor.getText).not.toHaveBeenCalled();
  });

  it("falls back to live editor text when captures are absent", () => {
    const editor = makeMockEditor({ plainText: "live body" });
    const out = buildSummarizePrompt(editor);
    expect(out).toContain("Note text:\nlive body");
    expect(editor.getText).toHaveBeenCalledWith({ blockSeparator: "\n" });
  });

  it("reports an empty note when there is no text", () => {
    const editor = makeMockEditor({ plainText: "" });
    const out = buildSummarizePrompt(editor);
    expect(out).toContain("The note appears empty.");
    expect(out).not.toContain("Note text:");
  });

  it("truncates very large note text and marks it as truncated", () => {
    const huge = "x".repeat(13000);
    const editor = makeMockEditor({ plainText: huge });
    const out = buildSummarizePrompt(editor);
    expect(out).toContain("…(truncated)");
    // 12000 文字 + "\n\n…(truncated)" のみが本文として残る。
    // Exactly 12000 chars from the original should be included before the truncation marker.
    const slice = out.split("Note text:\n")[1] ?? "";
    expect(slice.startsWith("x".repeat(12000))).toBe(true);
    expect(slice.length).toBeLessThan(huge.length);
  });
});
