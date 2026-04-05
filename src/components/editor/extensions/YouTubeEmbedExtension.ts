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

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    youtubeEmbed: {
      /**
       * YouTube 動画を埋め込む / Insert a YouTube video embed
       */
      insertYouTubeEmbed: (attrs: { videoId: string; src: string }) => ReturnType;
    };
  }
}

/**
 * YouTube 動画をiframeで埋め込み表示するノード拡張。
 * Node extension that renders YouTube videos as iframe embeds.
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
      src: {
        default: null,
        parseHTML: (element) => {
          const iframe = element.querySelector("iframe");
          return iframe?.getAttribute("src") || null;
        },
        renderHTML: () => ({}),
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
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "youtube-embed",
      }),
      [
        "iframe",
        {
          src: HTMLAttributes.src || "",
          frameborder: "0",
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
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs,
          });
        },
    };
  },
});
