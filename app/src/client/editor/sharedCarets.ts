import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import {
  absolutePositionToRelativePosition,
  createDecorations,
  defaultAwarenessStateFilter,
  setMeta,
  yCursorPluginKey,
  ySyncPluginKey,
} from "@tiptap/y-tiptap";
import type { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import {
  createTrailingDebounce,
  isRemoteAwarenessChange,
  type AwarenessChange,
} from "./caretScheduling";

type User = { name: string; color: string };

function renderCaret(user: User): HTMLElement {
  const caret = document.createElement("span");
  caret.classList.add("collaboration-carets__caret");
  caret.style.borderColor = user.color;
  const label = document.createElement("div");
  label.classList.add("collaboration-carets__label");
  label.style.backgroundColor = user.color;
  label.append(user.name);
  caret.append(label);
  return caret;
}

/**
 * Shared carets for long documents. Same wire format and rendering as Tiptap's
 * CollaborationCaret (y-tiptap's cursor plugin), with two changes:
 * - the local caret is published only after typing pauses (`publishDelayMs`), so the
 *   O(position) relative-position conversion and the awareness message leave the keystroke path;
 * - remote decorations are rebuilt only when another client's awareness changes.
 * 長い文書向けのカーソル共有。Tiptap の CollaborationCaret と同じ形式・描画で、
 * 自分のカーソル送信を入力の合間にまとめ、他人の変更時だけ装飾を作り直す。
 */
export const SharedCarets = Extension.create<{
  awareness: Awareness | null;
  user: User;
  publishDelayMs: number;
}>({
  name: "sharedCarets",
  addOptions() {
    return { awareness: null, user: { name: "", color: "#2563eb" }, publishDelayMs: 150 };
  },
  addProseMirrorPlugins() {
    const { awareness, user, publishDelayMs } = this.options;
    if (!awareness) return [];
    const buildCaret = (u: User) => renderCaret(u);
    const buildSelection = (u: User) => ({
      style: `background-color: ${u.color}70`,
      class: "ProseMirror-yjs-selection",
    });

    return [
      new Plugin({
        key: yCursorPluginKey,
        state: {
          init: (_, state) =>
            createDecorations(
              state,
              awareness,
              defaultAwarenessStateFilter,
              buildCaret,
              buildSelection,
            ),
          // Local edits only map the existing decorations; they are rebuilt from awareness when a
          // remote document change or a remote caret update arrives.
          apply(tr, previous, _oldState, newState) {
            const remoteDocChange = Boolean(ySyncPluginKey.getState(newState)?.isChangeOrigin);
            if (remoteDocChange || tr.getMeta(yCursorPluginKey)?.awarenessUpdated) {
              return createDecorations(
                newState,
                awareness,
                defaultAwarenessStateFilter,
                buildCaret,
                buildSelection,
              );
            }
            return tr.docChanged ? previous.map(tr.mapping, tr.doc) : previous;
          },
        },
        props: { decorations: (state) => yCursorPluginKey.getState(state) },
        view: (view) => {
          awareness.setLocalStateField("user", user);
          const publish = () => {
            if (view.isDestroyed) return;
            const ystate = ySyncPluginKey.getState(view.state);
            if (!ystate?.binding || ystate.binding.projectionError !== null) return;
            if (!view.hasFocus()) {
              if (awareness.getLocalState()?.cursor != null)
                awareness.setLocalStateField("cursor", null);
              return;
            }
            const { anchor, head } = view.state.selection;
            const current = awareness.getLocalState()?.cursor;
            const relAnchor = absolutePositionToRelativePosition(
              anchor,
              ystate.type,
              ystate.binding.mapping,
            );
            const relHead = absolutePositionToRelativePosition(
              head,
              ystate.type,
              ystate.binding.mapping,
            );
            if (
              current == null ||
              !Y.compareRelativePositions(
                Y.createRelativePositionFromJSON(current.anchor),
                relAnchor,
              ) ||
              !Y.compareRelativePositions(Y.createRelativePositionFromJSON(current.head), relHead)
            ) {
              awareness.setLocalStateField("cursor", { anchor: relAnchor, head: relHead });
            }
          };
          const debounced = createTrailingDebounce(publish, publishDelayMs);
          const onAwareness = (change: AwarenessChange) => {
            if (!view.isDestroyed && isRemoteAwarenessChange(change, awareness.clientID)) {
              setMeta(view, yCursorPluginKey, { awarenessUpdated: true });
            }
          };
          const onFocus = () => debounced.flush();
          awareness.on("change", onAwareness);
          view.dom.addEventListener("focusin", onFocus);
          view.dom.addEventListener("focusout", onFocus);
          return {
            update: () => debounced.schedule(),
            destroy: () => {
              debounced.cancel();
              view.dom.removeEventListener("focusin", onFocus);
              view.dom.removeEventListener("focusout", onFocus);
              awareness.off("change", onAwareness);
              awareness.setLocalStateField("cursor", null);
            },
          };
        },
      }),
    ];
  },
});
