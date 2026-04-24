/**
 * メディア挿入用のプレースホルダーノード拡張。
 * Media-insertion placeholder node extension.
 *
 * `/image` や `/video` スラッシュコマンドで挿入されるインラインカードで、
 * ファイル選択・URL 入力・ドラッグ＆ドロップのいずれかでメディアを決定する
 * UI を表示する。確定すると、対応する `image` または `video` ノードに
 * 置き換わる。ユーザーが決定せずにキャレットを移動しても node は残るので、
 * 戻って設定を続けることもできる。
 *
 * Inline card inserted by the `/image` and `/video` slash commands. Shows
 * buttons for file selection, URL entry, and a drop zone; once the user
 * picks media the node replaces itself with a concrete `image` or `video`
 * node. The placeholder persists even if the caret moves away, so the user
 * can come back to it later.
 */
import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { MediaPlaceholderNodeView } from "../MediaPlaceholderNodeView.tsx";

/** Placeholder mode: what kind of media is being inserted. */
export type MediaPlaceholderMode = "image" | "video";

/**
 *
 */
export interface MediaPlaceholderOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    mediaPlaceholder: {
      /**
       * 指定のモード（image / video）でプレースホルダーを挿入する。
       * Insert a media placeholder in the given mode.
       */
      insertMediaPlaceholder: (options: { mode: MediaPlaceholderMode }) => ReturnType;
    };
  }
}

export /**
 *
 */
const MediaPlaceholderExtension = Node.create<MediaPlaceholderOptions>({
  name: "mediaPlaceholder",

  group: "block",

  atom: true,

  selectable: true,

  draggable: false,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      mode: {
        default: "image" as MediaPlaceholderMode,
        parseHTML: (element) => {
          /**
           *
           */
          const raw = element.getAttribute("data-mode");
          return raw === "video" ? "video" : "image";
        },
        renderHTML: (attributes) => ({
          "data-mode": (attributes.mode as MediaPlaceholderMode) ?? "image",
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="media-placeholder"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "media-placeholder",
      }),
    ];
  },

  addCommands() {
    return {
      insertMediaPlaceholder:
        ({ mode }) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { mode } }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(MediaPlaceholderNodeView);
  },
});
