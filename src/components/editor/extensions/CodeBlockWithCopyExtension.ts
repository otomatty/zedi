import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { CodeBlockWithCopyNodeView } from "../CodeBlockWithCopyNodeView";

/**
 * CodeBlockLowlight extended with a copy button on hover.
 * Renders a React NodeView that shows a copy icon in the top-right when hovering over the code block.
 */
export const CodeBlockWithCopy = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockWithCopyNodeView);
  },
});
