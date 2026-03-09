import type { ReactNode } from "react";
import { useRef, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Check } from "lucide-react";

/** Code block with syntax highlighting and copy button */
export function CodeBlockWithCopy({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();
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
    } catch (err) {
      console.error("Failed to copy code to clipboard:", err);
    }
  };

  return (
    <div className="group/code relative">
      <pre ref={preRef}>{children}</pre>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? t("aiChat.actions.copiedCode") : t("aiChat.actions.copyCode")}
        className="absolute right-2 top-2 rounded border border-border/60 bg-muted/90 px-2 py-1 text-[11px] text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus:opacity-100 focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-muted group-hover/code:opacity-100"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      </button>
    </div>
  );
}
