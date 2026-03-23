import React, { useRef, useState, useEffect } from "react";
import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from "@tiptap/react";
import { Copy, Check } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 *
 */
export /**
 *
 */
const CodeBlockWithCopyNodeView: React.FC<NodeViewProps> = ({ node }) => {
  /**
   *
   */
  const { t } = useTranslation();
  /**
   *
   */
  const preRef = useRef<HTMLPreElement>(null);
  /**
   *
   */
  const [copied, setCopied] = useState(false);
  /**
   *
   */
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  /**
   *
   */
  const handleCopy = async () => {
    /**
     *
     */
    const text = preRef.current?.textContent ?? "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setCopied(true);
      timeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code to clipboard:", err);
    }
  };

  /**
   *
   */
  const language = (node.attrs.language as string) ?? "";

  return (
    <NodeViewWrapper as="div" className="group/code relative">
      <pre ref={preRef} className="overflow-x-auto">
        <NodeViewContent as="code" className={language ? `language-${language}` : ""} />
      </pre>
      <button
        type="button"
        contentEditable={false}
        onClick={handleCopy}
        aria-label={copied ? t("aiChat.actions.copiedCode") : t("aiChat.actions.copyCode")}
        className="border-border/60 bg-muted/90 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring focus-visible:ring-offset-muted absolute top-2 right-2 rounded border px-2 py-1 text-[11px] opacity-0 transition-opacity group-hover/code:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      </button>
    </NodeViewWrapper>
  );
};
