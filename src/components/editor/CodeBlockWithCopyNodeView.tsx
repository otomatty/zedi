import React, { useRef, useState, useEffect } from "react";
import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from "@tiptap/react";
import { Copy, Check } from "lucide-react";

export const CodeBlockWithCopyNodeView: React.FC<NodeViewProps> = ({ node }) => {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  const handleCopy = async () => {
    const text = preRef.current?.textContent ?? "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setCopied(true);
      timeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const language = (node.attrs.language as string) ?? "";

  return (
    <NodeViewWrapper as="div" className="group/code relative mb-4">
      <pre
        ref={preRef}
        className="overflow-x-auto rounded-lg bg-muted p-4 font-mono text-sm"
      >
        <NodeViewContent as="code" className={language ? `language-${language}` : ""} />
      </pre>
      <button
        type="button"
        contentEditable={false}
        onClick={handleCopy}
        aria-label={copied ? "Copied" : "Copy code"}
        className="absolute right-2 top-2 rounded border border-border/60 bg-muted/90 px-2 py-1 text-[11px] text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus:opacity-100 focus:outline-none group-hover/code:opacity-100"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      </button>
    </NodeViewWrapper>
  );
};
