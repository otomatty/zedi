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
  const tr = state.tr;
  let modified = false;
  state.doc.descendants((node, pos) => {
    if (node.type.name !== "heading") return;
    const level = typeof node.attrs.level === "number" ? node.attrs.level : 1;
    if (level < 2) {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, level: 2 });
      modified = true;
    }
  });
  return modified ? tr : null;
}

export /**
 *
 */
const HeadingLevelClamp = Extension.create({
  name: "headingLevelClamp",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: headingLevelClampKey,
        view(view) {
          queueMicrotask(() => {
            if (view.isDestroyed) return;
            /**
             *
             */
            const tr = buildHeadingClampTr(view.state);
            if (tr) {
              view.dispatch(tr);
            }
          });
          return {};
        },
        appendTransaction(_transactions, _oldState, newState) {
          return buildHeadingClampTr(newState);
        },
      }),
    ];
  },
});
