/**
 * サーバー側 YouTube 埋め込みノード拡張（React 依存なし）。
 * Server-side YouTube embed node extension (no React dependency).
 *
 * クライアント側の YouTubeEmbedExtension.ts と同一スキーマだが、
 * addNodeView (ReactNodeViewRenderer) を使用しない。
 * サーバー側での Tiptap JSON → Y.Doc 変換に必要。
 *
 * Same schema as the client-side YouTubeEmbedExtension.ts, but without
 * addNodeView (ReactNodeViewRenderer). Required for server-side
 * Tiptap JSON → Y.Doc conversion.
 */
import { Node, mergeAttributes } from "@tiptap/core";

/**
 * YouTube 埋め込みノードのオプション（サーバー版）。
 * Options for the server-side YouTube embed node extension.
 */
export interface YouTubeEmbedServerOptions {
  HTMLAttributes: Record<string, unknown>;
}

/**
 * videoId から埋め込み URL を導出する。
 * Derives the embed URL from a video ID.
 */
function buildYouTubeEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}`;
}

/**
 * サーバー側 YouTube 埋め込みノード拡張。
 * Server-side YouTube embed node extension for Y.Doc conversion.
 */
export const YouTubeEmbedServer = Node.create<YouTubeEmbedServerOptions>({
  name: "youtubeEmbed",

  group: "block",

  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      videoId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-video-id") || null,
        renderHTML: (attributes) =>
          attributes.videoId ? { "data-video-id": attributes.videoId } : {},
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="youtube-embed"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const videoId = HTMLAttributes["data-video-id"] as string | undefined;
    const embedSrc = videoId ? buildYouTubeEmbedUrl(videoId) : "";
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "youtube-embed",
      }),
      [
        "iframe",
        {
          src: embedSrc,
          style: "border:0",
          allowfullscreen: true,
          allow:
            "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
        },
      ],
    ];
  },
});
