import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { ExecutableCodeBlockNodeView } from "../ExecutableCodeBlockNodeView";

/** Run lifecycle for executable code blocks. / 実行可能コードブロックの実行状態。 */
export type ExecutableRunStatus = "idle" | "running" | "done" | "error";

/**
 * Options for {@link ExecutableCodeBlock} Tiptap extension.
 * {@link ExecutableCodeBlock} Tiptap 拡張のオプション。
 */
export interface ExecutableCodeBlockOptions {
  /** Extra attributes merged into the root DOM node. / ルート DOM にマージする追加属性。 */
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    /**
     * Inserts an executable code block (Claude Code / Bash).
     * 実行可能コードブロック（Claude Code / Bash）を挿入する。
     */
    insertExecutableCodeBlock: (attrs?: { language?: string }) => ReturnType;
  }
}

/**
 * Notebook-style code cell executed via Claude Code Bash tool (Issue #459).
 * Claude Code の Bash ツールで実行するノートブック風コードセル（Issue #459）。
 */
export const ExecutableCodeBlock = Node.create<ExecutableCodeBlockOptions>({
  name: "executableCodeBlock",

  group: "block",

  content: "text*",

  marks: "",

  code: true,

  defining: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      language: {
        default: "bash",
        parseHTML: (el) => el.getAttribute("data-language") || "bash",
        renderHTML: (attrs) => ({
          "data-language": attrs.language || "bash",
        }),
      },
      runStatus: {
        default: "idle" as ExecutableRunStatus,
        parseHTML: (el) => (el.getAttribute("data-run-status") as ExecutableRunStatus) || "idle",
        renderHTML: (attrs) => ({
          "data-run-status": attrs.runStatus ?? "idle",
        }),
      },
      stdout: {
        default: "",
        parseHTML: (el) => el.querySelector('pre[data-stream="stdout"]')?.textContent ?? "",
      },
      stderr: {
        default: "",
        parseHTML: (el) => el.querySelector('pre[data-stream="stderr"]')?.textContent ?? "",
      },
      exitCode: {
        default: null as number | null,
        parseHTML: (el) => {
          const raw = el.getAttribute("data-exit-code");
          if (raw === null || raw === "") return null;
          const n = parseInt(raw, 10);
          return Number.isFinite(n) ? n : null;
        },
        renderHTML: (attrs) => {
          if (attrs.exitCode === null || attrs.exitCode === undefined) {
            return {};
          }
          return { "data-exit-code": String(attrs.exitCode) };
        },
      },
      durationMs: {
        default: null as number | null,
        parseHTML: (el) => {
          const raw = el.getAttribute("data-duration-ms");
          if (raw === null || raw === "") return null;
          const n = parseInt(raw, 10);
          return Number.isFinite(n) ? n : null;
        },
        renderHTML: (attrs) => {
          if (attrs.durationMs === null || attrs.durationMs === undefined) {
            return {};
          }
          return { "data-duration-ms": String(attrs.durationMs) };
        },
      },
      interpretation: {
        default: "",
        parseHTML: (el) => el.querySelector(".zedi-exec-interpretation")?.textContent ?? "",
        renderHTML: () => ({}),
      },
      errorMessage: {
        default: "",
        parseHTML: (el) => el.querySelector('pre[data-stream="error"]')?.textContent ?? "",
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="executable-code-block"]',
        preserveWhitespace: "full" as const,
        contentElement: (el) => el.querySelector("pre code") ?? el,
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const lang = (node.attrs.language as string) || "bash";
    const stdout = (node.attrs.stdout as string) || "";
    const stderr = (node.attrs.stderr as string) || "";
    const err = (node.attrs.errorMessage as string) || "";
    const interpretation = (node.attrs.interpretation as string) || "";

    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "executable-code-block",
        class: "zedi-executable-code-block",
      }),
      ["pre", { spellcheck: "false" }, ["code", { class: lang ? `language-${lang}` : "" }, 0]],
      [
        "div",
        { class: "zedi-exec-output" },
        ["pre", { "data-stream": "stdout" }, stdout],
        ["pre", { "data-stream": "stderr" }, stderr],
        ...(err ? [["pre", { "data-stream": "error" }, err] as const] : []),
        ...(interpretation
          ? [["div", { class: "zedi-exec-interpretation" }, interpretation] as const]
          : []),
      ],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ExecutableCodeBlockNodeView);
  },

  addCommands() {
    return {
      insertExecutableCodeBlock:
        (attrs?: { language?: string }) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { language: attrs?.language ?? "bash" },
            // Zero-width space: empty string can be rejected by ProseMirror text schema.
            // U+200B: ProseMirror の text* で空文字が弾かれるのを避ける。
            content: [{ type: "text", text: "\u200b" }],
          }),
    };
  },
});
