/**
 * クライアント側 Video ノード拡張。
 * Client-side Video node extension.
 *
 * HTML5 `<video>` タグで動画をインライン再生するブロック atom ノード。
 * サーバー側 `videoServerExtension.ts` とスキーマを揃えることで、Tiptap JSON
 * を Y.Doc に変換しても互換を保つ（ウェルカムページ生成や更新情報ページの
 * 配信で利用）。
 *
 * Block atom node that renders an inline HTML5 `<video>` element. Mirrors
 * the server-side `videoServerExtension.ts` schema so Tiptap JSON ↔ Y.Doc
 * round-trips (used by welcome-page generation and future update notices).
 */
import { Node, mergeAttributes } from "@tiptap/core";

/**
 * Options accepted by {@link VideoExtension} (passed via `.configure()`).
 */
export interface VideoOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    video: {
      /**
       * 指定の src / alt で video ノードを挿入する。
       * Insert a video node with the given src / alt.
       */
      setVideo: (options: { src: string; alt?: string; poster?: string | null }) => ReturnType;
    };
  }
}

/**
 * Video ノード拡張。再生は HTML ネイティブのコントロールに委ねる。
 * Video node extension. Playback is handled by the browser's native
 * `<video controls>` UI so we don't ship our own player.
 */
export const VideoExtension = Node.create<VideoOptions>({
  name: "video",

  group: "block",

  atom: true,

  draggable: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element) => element.getAttribute("src") || null,
        renderHTML: (attributes) => (attributes.src ? { src: attributes.src as string } : {}),
      },
      alt: {
        default: null,
        parseHTML: (element) => element.getAttribute("alt") || null,
        renderHTML: (attributes) => (attributes.alt ? { alt: attributes.alt as string } : {}),
      },
      poster: {
        default: null,
        parseHTML: (element) => element.getAttribute("poster") || null,
        renderHTML: (attributes) =>
          attributes.poster ? { poster: attributes.poster as string } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "video" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "video",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        controls: "true",
        preload: "metadata",
        playsinline: "true",
      }),
    ];
  },

  addCommands() {
    return {
      setVideo:
        ({ src, alt, poster }) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { src, alt: alt ?? null, poster: poster ?? null },
          });
        },
    };
  },
});
