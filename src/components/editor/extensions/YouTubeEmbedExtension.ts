import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { YouTubeEmbedNodeView } from "../YouTubeEmbedNodeView";

/**
 * YouTube 埋め込みノードのオプション。
 * Options for the YouTube embed node extension.
 */
export interface YouTubeEmbedOptions {
  HTMLAttributes: Record<string, unknown>;
}

/** YouTube 動画 ID のバリデーション / Validate a YouTube video ID (11 alphanumeric + _ + -) */
const YOUTUBE_VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;

/**
 * videoId から埋め込み URL を導出する。
 * Derives the embed URL from a video ID.
 */
export function buildYouTubeEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}`;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    youtubeEmbed: {
      /**
       * YouTube 動画を埋め込む（videoId のみ指定）。
       * Insert a YouTube video embed (videoId only; embed URL is derived).
       */
      insertYouTubeEmbed: (attrs: { videoId: string }) => ReturnType;
    };
  }
}

/**
 * YouTube 動画をiframeで埋め込み表示するノード拡張。
 * videoId のみをスキーマに保持し、埋め込み URL は常に videoId から導出する。
 *
 * Node extension that renders YouTube videos as iframe embeds.
 * Only stores videoId in the schema; the embed URL is always derived from it.
 */
export const YouTubeEmbed = Node.create<YouTubeEmbedOptions>({
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
          allowfullscreen: "true",
          allow:
            "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
        },
      ],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(YouTubeEmbedNodeView);
  },

  addCommands() {
    return {
      insertYouTubeEmbed:
        ({ videoId }) =>
        ({ commands }) => {
          // videoId のバリデーション / Validate videoId format
          if (!videoId || !YOUTUBE_VIDEO_ID_PATTERN.test(videoId)) {
            return false;
          }
          return commands.insertContent({
            type: this.name,
            attrs: { videoId },
          });
        },
    };
  },
});
