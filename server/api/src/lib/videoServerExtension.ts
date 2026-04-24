/**
 * サーバー側 Video ノード拡張（React 依存なし）。
 * Server-side Video node extension (no React dependency).
 *
 * クライアント側 VideoExtension と同じスキーマ（src / alt / poster 属性を
 * 持つ block atom ノード）を提供する。addNodeView を使用しないため
 * サーバーで Tiptap JSON → Y.Doc 変換に利用できる。
 *
 * Mirrors the client-side VideoExtension (a block atom node with src / alt /
 * poster attributes) without addNodeView, so it can be used for server-side
 * Tiptap JSON → Y.Doc conversion (welcome page generation, update notices).
 */
import { Node, mergeAttributes } from "@tiptap/core";

/**
 * Video ノードのオプション（サーバー版）。
 * Options for the server-side video node extension.
 */
export interface VideoServerOptions {
  HTMLAttributes: Record<string, unknown>;
}

/**
 * サーバー側 Video ノード拡張。
 * Server-side Video node extension for Y.Doc conversion.
 */
export const VideoServer = Node.create<VideoServerOptions>({
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
});
