import React from "react";
import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from "@tiptap/react";
import { cn } from "@zedi/ui";
import { useClaudeCodeAvailability } from "@/components/settings/useAISettingsFormHelpers";
import type { ExecutableRunStatus } from "./extensions/ExecutableCodeBlockExtension";
import { ExecutableCodeBlockConfirmDialog } from "./executableCodeBlock/ExecutableCodeBlockConfirmDialog";
import { ExecutableCodeBlockOutputPanel } from "./executableCodeBlock/ExecutableCodeBlockOutputPanel";
import { ExecutableCodeBlockToolbar } from "./executableCodeBlock/ExecutableCodeBlockToolbar";
import { useExecutableCodeBlockController } from "./executableCodeBlock/useExecutableCodeBlockController";

/**
 * Node view for executable code blocks (Claude Code Bash).
 * 実行可能コードブロックの NodeView（Claude Code Bash）。
 */
export const ExecutableCodeBlockNodeView: React.FC<NodeViewProps> = ({
  node,
  updateAttributes,
}) => {
  const claudeAvailable = useClaudeCodeAvailability();

  const language = (node.attrs.language as string) || "bash";
  const runStatus = (node.attrs.runStatus as ExecutableRunStatus) || "idle";
  const stdout = (node.attrs.stdout as string) || "";
  const stderr = (node.attrs.stderr as string) || "";
  const exitCode = node.attrs.exitCode as number | null;
  const durationMs = node.attrs.durationMs as number | null;
  const interpretation = (node.attrs.interpretation as string) || "";
  const errorMessage = (node.attrs.errorMessage as string) || "";
  const codeText = node.textContent;

  const {
    confirmOpen,
    setConfirmOpen,
    interpretLoading,
    handleRunClick,
    handleConfirmRun,
    handleInterpret,
    runDisabled,
    interpretDisabled,
  } = useExecutableCodeBlockController({
    updateAttributes,
    language,
    codeText,
    runStatus,
    exitCode,
    stdout,
    stderr,
    claudeAvailable,
  });

  return (
    <NodeViewWrapper
      as="div"
      className="border-border bg-muted/20 my-3 rounded-lg border"
      spellCheck={false}
    >
      <ExecutableCodeBlockToolbar
        language={language}
        runStatus={runStatus}
        runDisabled={runDisabled}
        interpretDisabled={interpretDisabled}
        interpretLoading={interpretLoading}
        onLanguageChange={(value) => updateAttributes({ language: value })}
        onRunClick={handleRunClick}
        onInterpretClick={handleInterpret}
      />

      <pre className="m-0 overflow-x-auto px-3 py-2 text-sm" spellCheck={false}>
        <NodeViewContent
          as="code"
          className={cn(
            language ? `language-${language}` : "",
            "block min-h-[2.5rem] whitespace-pre",
          )}
          spellCheck={false}
        />
      </pre>

      <ExecutableCodeBlockOutputPanel
        runStatus={runStatus}
        exitCode={exitCode}
        durationMs={durationMs}
        claudeAvailable={claudeAvailable}
        errorMessage={errorMessage}
        stdout={stdout}
        stderr={stderr}
        interpretation={interpretation}
      />

      <ExecutableCodeBlockConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirmRun={handleConfirmRun}
      />
    </NodeViewWrapper>
  );
};
