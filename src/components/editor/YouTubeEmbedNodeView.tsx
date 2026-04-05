import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { buildYouTubeEmbedUrl } from "./extensions/YouTubeEmbedExtension";

/**
 * YouTube 動画埋め込みの NodeView コンポーネント。
 * videoId から埋め込み URL を導出してレスポンシブ iframe で表示する。
 *
 * NodeView component that renders a YouTube video embed as a responsive iframe.
 * Derives the embed URL from videoId.
 */
export function YouTubeEmbedNodeView({ node }: NodeViewProps) {
  const videoId = node.attrs.videoId as string;
  const embedSrc = videoId ? buildYouTubeEmbedUrl(videoId) : "";

  return (
    <NodeViewWrapper data-type="youtube-embed" data-video-id={videoId}>
      <div
        className="youtube-embed-wrapper my-4 overflow-hidden rounded-lg"
        style={{ position: "relative", paddingBottom: "56.25%", height: 0 }}
      >
        <iframe
          src={embedSrc}
          title={`YouTube video ${videoId}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            border: 0,
          }}
        />
      </div>
    </NodeViewWrapper>
  );
}
