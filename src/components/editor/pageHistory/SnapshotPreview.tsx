/**
 * スナップショットプレビュー（読み取り専用エディタ）
 * Read-only TipTap editor for previewing a snapshot
 */
import React, { useEffect, useMemo } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import * as Y from "yjs";
import { yXmlFragmentToTiptapJson } from "@/lib/ydoc/yDocToTiptapJson";
import { createSnapshotPreviewExtensions } from "../TiptapEditor/editorConfig";

interface SnapshotPreviewProps {
  /** base64-encoded Y.Doc state */
  ydocState: string;
  className?: string;
}

/**
 * Y.Doc バイナリから TipTap JSON を復元し、読み取り専用エディタで表示する。
 * Restores TipTap JSON from Y.Doc binary and renders in a read-only editor.
 */
export const SnapshotPreview: React.FC<SnapshotPreviewProps> = ({ ydocState, className }) => {
  const content = useMemo(() => {
    try {
      const doc = new Y.Doc();
      const binary = Uint8Array.from(atob(ydocState), (c) => c.charCodeAt(0));
      Y.applyUpdate(doc, binary);

      const xmlFragment = doc.getXmlFragment("default");
      return yXmlFragmentToTiptapJson(xmlFragment);
    } catch {
      return null;
    }
  }, [ydocState]);

  const editor = useEditor({
    extensions: createSnapshotPreviewExtensions(),
    editable: false,
    content: content ?? undefined,
  });

  useEffect(() => {
    if (editor && content) {
      editor.commands.setContent(content);
    }
  }, [editor, content]);

  return (
    <div className={className}>
      <EditorContent editor={editor} className="prose dark:prose-invert max-w-none text-sm" />
    </div>
  );
};
