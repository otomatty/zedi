/**
 * `@file:` mark: typed path, click previews via Tauri `read_note_workspace_file` (Issue #461).
 * `@file:` マーク。クリックで Tauri `read_note_workspace_file` によりプレビュー（Issue #461）。
 */
import { Mark, mergeAttributes, markInputRule } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { dispatchFilePreview } from "@/lib/noteWorkspace/filePreviewEvents";
import { readNoteWorkspaceFile } from "@/lib/noteWorkspace/noteWorkspaceIo";

/** Max characters shown in the preview dialog (UX; Rust already caps file size). / プレビューダイアログの最大文字数 */
const FILE_PREVIEW_DISPLAY_MAX_CHARS = 32_000;

/**
 * Options for {@link FileReference}. / {@link FileReference} のオプション。
 */
export interface FileReferenceOptions {
  HTMLAttributes: Record<string, unknown>;
  /** Returns linked workspace root for the current note (desktop). / ノートのワークスペースルート */
  getWorkspaceRoot: () => string | null;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fileReference: {
      setFileReference: (attrs: { path: string }) => ReturnType;
      unsetFileReference: () => ReturnType;
    };
  }
}

/**
 * Marks `@file:relative/path` segments; click loads preview via Tauri (Issue #461).
 * `@file:相対パス` をマークし、クリックで Tauri 経由プレビュー（Issue #461）。
 */
export const FileReference = Mark.create<FileReferenceOptions>({
  name: "fileReference",

  priority: 1000,

  addOptions() {
    return {
      HTMLAttributes: {},
      getWorkspaceRoot: () => null as string | null,
    };
  },

  addAttributes() {
    return {
      path: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-path") ?? "",
        renderHTML: (attributes) => ({
          "data-path": attributes.path,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-file-ref]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-file-ref": "",
        class:
          "file-reference rounded bg-muted/80 px-0.5 font-mono text-sm text-foreground underline decoration-dotted",
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setFileReference:
        (attrs) =>
        ({ commands }) =>
          commands.setMark(this.name, attrs),
      unsetFileReference:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },

  addInputRules() {
    return [
      markInputRule({
        find: /(?:^|\s)(@file:[^\s]+)\s$/,
        type: this.type,
        getAttributes: (match) => {
          const full = match[1] ?? "";
          const path = full.startsWith("@file:") ? full.slice(6) : full;
          return { path };
        },
      }),
    ];
  },

  addProseMirrorPlugins() {
    const getRoot = this.options.getWorkspaceRoot;
    return [
      new Plugin({
        key: new PluginKey("fileReferenceClick"),
        props: {
          handleClick: (view, _pos, event) => {
            const target = event.target as HTMLElement | null;
            const el = target?.closest?.("[data-file-ref]") as HTMLElement | null;
            if (!el) return false;
            const path = el.getAttribute("data-path");
            if (!path) return false;
            const root = getRoot();
            if (!root) {
              event.preventDefault();
              event.stopPropagation();
              dispatchFilePreview({ relativePath: path, noWorkspace: true });
              return true;
            }
            event.preventDefault();
            event.stopPropagation();
            void (async () => {
              const result = await readNoteWorkspaceFile(root, path);
              if (result.ok) {
                const truncated = result.content.length > FILE_PREVIEW_DISPLAY_MAX_CHARS;
                const content = truncated
                  ? result.content.slice(0, FILE_PREVIEW_DISPLAY_MAX_CHARS)
                  : result.content;
                dispatchFilePreview({
                  relativePath: path,
                  content,
                  truncated,
                });
              } else {
                dispatchFilePreview({ relativePath: path, error: result.error });
              }
            })();
            return true;
          },
        },
      }),
    ];
  },
});
