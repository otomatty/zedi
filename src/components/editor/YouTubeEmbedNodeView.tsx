import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

/**
 * YouTube 動画埋め込みの NodeView コンポーネント。
 * NodeView component that renders a YouTube video embed as a responsive iframe.
 */
export function YouTubeEmbedNodeView({ node }: NodeViewProps) {
  const { src, videoId } = node.attrs as { src: string; videoId: string };

  return (
    <NodeViewWrapper data-type="youtube-embed" data-video-id={videoId}>
      <div
        className="youtube-embed-wrapper my-4 overflow-hidden rounded-lg"
        style={{ position: "relative", paddingBottom: "56.25%", height: 0 }}
      >
        <iframe
          src={src}
          title={`YouTube video ${videoId}`}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
          }}
        />
      </div>
    </NodeViewWrapper>
  );
}
