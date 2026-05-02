import { Extension } from "@tiptap/core";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { Plugin, PluginKey } from "@tiptap/pm/state";

const headingLevelClampKey = new PluginKey("headingLevelClamp");

/**
 * 本文 h1 相当 (level:1) を h2 へ。初期 doc が appendTransaction を通らないこともあるため
 * 初回は view マウント直後の queueMicrotask でも反映する
 * / Body h1 (level:1) → h2. Initial Tiptap content may not run appendTransaction;
 *     also run once in queueMicrotask after the plugin view is mounted
 */
function buildHeadingClampTr(state: EditorState): Transaction | null {
  let tr: Transaction | null = null;
  state.doc.descendants((node, pos) => {
    if (node.type.name !== "heading") return;
    const level = typeof node.attrs.level === "number" ? node.attrs.level : 1;
    if (level < 2) {
      tr ??= state.tr;
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, level: 2 });
    }
    // headings only contain inline content; no need to scan descendants further
    return false;
  });
  return tr;
}

/**
 * 旧 h1（level:1）や Y.Doc から取り込んだ低レベル見出しを h2 にクランプする Tiptap 拡張。
 * `appendTransaction` で各変更後に正規化し、初回のみ `view` マウント直後の `queueMicrotask` でも反映する。
 * Tiptap extension that clamps stray heading nodes (level &lt; 2) up to level 2.
 * Runs on every transaction via `appendTransaction`, plus once on view mount via `queueMicrotask`
 * because the initial document does not always pass through `appendTransaction`.
 */
export const HeadingLevelClamp = Extension.create({
  name: "headingLevelClamp",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: headingLevelClampKey,
        view(view) {
          queueMicrotask(() => {
            if (view.isDestroyed) return;
            const tr = buildHeadingClampTr(view.state);
            if (tr) {
              view.dispatch(tr);
            }
          });
          return {};
        },
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((tr) => tr.docChanged)) {
            return null;
          }
          return buildHeadingClampTr(newState);
        },
      }),
    ];
  },
});
