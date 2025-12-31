import { useState, useCallback } from "react";
import {
  generateMermaidDiagram,
  getAISettingsOrThrow,
  MermaidDiagramType,
  MermaidGeneratorResult,
} from "@/lib/mermaidGenerator";

export type MermaidGeneratorStatus =
  | "idle"
  | "generating"
  | "completed"
  | "error";

interface UseMermaidGeneratorReturn {
  status: MermaidGeneratorStatus;
  result: MermaidGeneratorResult | null;
  error: Error | null;
  isAIConfigured: boolean | null;
  generate: (text: string, diagramTypes: MermaidDiagramType[]) => Promise<void>;
  reset: () => void;
  checkAIConfigured: () => Promise<boolean>;
}

export function useMermaidGenerator(): UseMermaidGeneratorReturn {
  const [status, setStatus] = useState<MermaidGeneratorStatus>("idle");
  const [result, setResult] = useState<MermaidGeneratorResult | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isAIConfigured, setIsAIConfigured] = useState<boolean | null>(null);

  const checkAIConfigured = useCallback(async (): Promise<boolean> => {
    try {
      await getAISettingsOrThrow();
      setIsAIConfigured(true);
      return true;
    } catch {
      setIsAIConfigured(false);
      return false;
    }
  }, []);

  const generate = useCallback(
    async (text: string, diagramTypes: MermaidDiagramType[]) => {
      if (!text.trim()) {
        setError(new Error("テキストが空です"));
        setStatus("error");
        return;
      }

      if (diagramTypes.length === 0) {
        setError(new Error("ダイアグラムタイプを選択してください"));
        setStatus("error");
        return;
      }

      setStatus("generating");
      setError(null);
      setResult(null);

      try {
        await generateMermaidDiagram(text, diagramTypes, {
          onComplete: (generatedResult) => {
            setResult(generatedResult);
            setStatus("completed");
          },
          onError: (err) => {
            setError(err);
            setStatus("error");
          },
        });
      } catch (err) {
        const error =
          err instanceof Error
            ? err
            : new Error("生成中にエラーが発生しました");
        setError(error);
        setStatus("error");
      }
    },
    []
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setResult(null);
    setError(null);
  }, []);

  return {
    status,
    result,
    error,
    isAIConfigured,
    generate,
    reset,
    checkAIConfigured,
  };
}
