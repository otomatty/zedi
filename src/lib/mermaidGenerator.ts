// Mermaid Generator - AIによるダイアグラム生成機能

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { AISettings } from "@/types/ai";
import { loadAISettings } from "./aiSettings";
import i18n from "@/i18n";

// ダイアグラムタイプの定義
/** Supported Mermaid diagram kinds for the generator. */
export type MermaidDiagramType =
  | "flowchart"
  | "sequence"
  | "classDiagram"
  | "stateDiagram"
  | "erDiagram"
  | "gantt"
  | "pie"
  | "mindmap";

/** Metadata for one diagram type (label, description, example). */
export interface DiagramTypeInfo {
  id: MermaidDiagramType;
  name: string;
  description: string;
  example: string;
}

/**
 * UI・プロンプトで処理する図の順序。固定ID。
 * / Stable order and ids for diagram types.
 */
export const MERMAID_DIAGRAM_TYPE_ORDER: readonly MermaidDiagramType[] = [
  "flowchart",
  "sequence",
  "classDiagram",
  "stateDiagram",
  "erDiagram",
  "gantt",
  "pie",
  "mindmap",
] as const;

/**
 * 現在 i18n 言語のラベル・例付き図定義。旧 `DIAGRAM_TYPES` の代わり。
 * / Diagram type metadata in the current UI locale. Replaces static `DIAGRAM_TYPES`.
 */
export function getMermaidDiagramTypes(): DiagramTypeInfo[] {
  const t = i18n.getFixedT(i18n.language);
  return MERMAID_DIAGRAM_TYPE_ORDER.map((id) => ({
    id,
    name: t(`mermaid.diagramTypes.${id}.name`),
    description: t(`mermaid.diagramTypes.${id}.description`),
    example: t(`mermaid.diagramTypes.${id}.example`),
  }));
}

/**
 * 選択された図IDと本文から LLM 用ユーザープロンプトを組み立てる。
 * / Builds the Mermaid user prompt for the current locale.
 */
export function buildMermaidGeneratorUserPrompt(
  selectedDiagramTypes: MermaidDiagramType[],
  sourceText: string,
): string {
  const t = i18n.getFixedT(i18n.language);
  const all = getMermaidDiagramTypes();
  const diagramTypesList = selectedDiagramTypes
    .map((type) => {
      const info = all.find((d) => d.id === type);
      return info ? `- ${info.name} (${info.id}): ${info.description}` : "";
    })
    .filter(Boolean)
    .join("\n");
  const withTypes = t("mermaid.generatorPrompt", {
    diagramTypes: diagramTypesList,
  });
  // `sourceText` は i18n 展開に渡さない（`{{` を含みうる） / Do not pass sourceText to i18n.
  return withTypes.replace("__ZEDI_MERMAID_SOURCE__", sourceText);
}

/** Result of a successful Mermaid generation. */
export interface MermaidGeneratorResult {
  code: string;
  diagramType: MermaidDiagramType;
}

/** Streaming / completion callbacks for Mermaid generation. */
export interface MermaidGeneratorCallbacks {
  onComplete: (result: MermaidGeneratorResult) => void;
  onError: (error: Error) => void;
}

/**
 * AI設定を取得し、設定されているか確認
 * api_serverモードではシステムプロバイダーが利用可能なため常にOK
 */
export async function getAISettingsOrThrow(): Promise<AISettings> {
  const settings = await loadAISettings();

  // 設定がない場合はデフォルト(api_server)を使用
  if (!settings) {
    const { DEFAULT_AI_SETTINGS } = await import("@/types/ai");
    return { ...DEFAULT_AI_SETTINGS, isConfigured: true };
  }

  // api_serverモードならAPIキー不要 / api_server needs no user API key.
  // apiMode未設定時はapi_serverをデフォルトとする / Default to api_server when apiMode is unset.
  const effectiveMode = settings.apiMode ?? "api_server";
  if (effectiveMode === "api_server") {
    return { ...settings, isConfigured: true };
  }

  // Claude Code は API キー不要（後段で未対応エラーに分岐）
  if (settings.provider === "claude-code") {
    return { ...settings, isConfigured: true };
  }

  // user_api_keyモードではAPIキーが必要
  if (!settings.isConfigured || !settings.apiKey) {
    throw new Error("AI_NOT_CONFIGURED");
  }
  return settings;
}

/**
 * OpenAIでMermaid生成
 */
async function generateWithOpenAI(
  settings: AISettings,
  text: string,
  diagramTypes: MermaidDiagramType[],
  callbacks: MermaidGeneratorCallbacks,
): Promise<void> {
  const client = new OpenAI({
    apiKey: settings.apiKey,
    dangerouslyAllowBrowser: true,
  });

  const prompt = buildMermaidGeneratorUserPrompt(diagramTypes, text);

  try {
    const response = await client.chat.completions.create({
      model: settings.model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    });

    const code = response.choices[0]?.message?.content?.trim() || "";

    // 生成されたコードからダイアグラムタイプを検出
    const detectedType = detectDiagramType(code, diagramTypes);

    callbacks.onComplete({
      code,
      diagramType: detectedType,
    });
  } catch (error) {
    callbacks.onError(error instanceof Error ? error : new Error("OpenAI API error"));
  }
}

/**
 * AnthropicでMermaid生成
 */
async function generateWithAnthropic(
  settings: AISettings,
  text: string,
  diagramTypes: MermaidDiagramType[],
  callbacks: MermaidGeneratorCallbacks,
): Promise<void> {
  const client = new Anthropic({
    apiKey: settings.apiKey,
  });

  const prompt = buildMermaidGeneratorUserPrompt(diagramTypes, text);

  try {
    const response = await client.messages.create({
      model: settings.model,
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    const code = textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";

    const detectedType = detectDiagramType(code, diagramTypes);

    callbacks.onComplete({
      code,
      diagramType: detectedType,
    });
  } catch (error) {
    callbacks.onError(error instanceof Error ? error : new Error("Anthropic API error"));
  }
}

/**
 * Google AIでMermaid生成
 */
async function generateWithGoogle(
  settings: AISettings,
  text: string,
  diagramTypes: MermaidDiagramType[],
  callbacks: MermaidGeneratorCallbacks,
): Promise<void> {
  const client = new GoogleGenAI({ apiKey: settings.apiKey });

  const prompt = buildMermaidGeneratorUserPrompt(diagramTypes, text);

  try {
    const response = await client.models.generateContent({
      model: settings.model,
      contents: prompt,
      config: {
        temperature: 0.3,
      },
    });

    const code = response.text.trim();

    const detectedType = detectDiagramType(code, diagramTypes);

    callbacks.onComplete({
      code,
      diagramType: detectedType,
    });
  } catch (error) {
    callbacks.onError(error instanceof Error ? error : new Error("Google AI API error"));
  }
}

/**
 * 生成されたコードからダイアグラムタイプを検出
 */
function detectDiagramType(code: string, requestedTypes: MermaidDiagramType[]): MermaidDiagramType {
  const lowerCode = code.toLowerCase();

  if (lowerCode.startsWith("flowchart") || lowerCode.startsWith("graph")) {
    return "flowchart";
  }
  if (lowerCode.startsWith("sequencediagram")) {
    return "sequence";
  }
  if (lowerCode.startsWith("classdiagram")) {
    return "classDiagram";
  }
  if (lowerCode.startsWith("statediagram")) {
    return "stateDiagram";
  }
  if (lowerCode.startsWith("erdiagram")) {
    return "erDiagram";
  }
  if (lowerCode.startsWith("gantt")) {
    return "gantt";
  }
  if (lowerCode.startsWith("pie")) {
    return "pie";
  }
  if (lowerCode.startsWith("mindmap")) {
    return "mindmap";
  }

  // デフォルトは最初にリクエストされたタイプ
  return requestedTypes[0] || "flowchart";
}

/**
 * Mermaidダイアグラムを生成
 * api_serverモード: callAIService経由でサーバーに委譲
 * user_api_keyモード: 直接SDKで呼び出し（既存動作）
 */
export async function generateMermaidDiagram(
  text: string,
  diagramTypes: MermaidDiagramType[],
  callbacks: MermaidGeneratorCallbacks,
): Promise<void> {
  const settings = await getAISettingsOrThrow();
  // apiMode未設定時はapi_serverをデフォルトとする / Default to api_server when apiMode is unset.
  const effectiveMode = settings.apiMode ?? "api_server";

  // api_server / claude-code: 統一された callAIService 経由
  if (settings.provider === "claude-code" || effectiveMode === "api_server") {
    try {
      const { callAIService } = await import("@/lib/aiService");
      const prompt = buildMermaidGeneratorUserPrompt(diagramTypes, text);

      await callAIService(
        settings,
        {
          provider: settings.provider,
          model: settings.model,
          messages: [{ role: "user", content: prompt }],
          options: {
            maxTokens: 2000,
            temperature: 0.3,
            stream: false,
            feature: "mermaid_generation",
          },
        },
        {
          onComplete: (response) => {
            const code = response.content.trim();
            const detectedType = detectDiagramType(code, diagramTypes);
            callbacks.onComplete({ code, diagramType: detectedType });
          },
          onError: (error) => {
            callbacks.onError(error);
          },
        },
      );
    } catch (error) {
      callbacks.onError(error instanceof Error ? error : new Error("Unknown error"));
    }
    return;
  }

  // user_api_keyモード: 既存の直接SDK呼び出し
  switch (settings.provider) {
    case "openai":
      return generateWithOpenAI(settings, text, diagramTypes, callbacks);
    case "anthropic":
      return generateWithAnthropic(settings, text, diagramTypes, callbacks);
    case "google":
      return generateWithGoogle(settings, text, diagramTypes, callbacks);
    case "claude-code":
      callbacks.onError(
        new Error("Mermaid generation is not supported with Claude Code provider."),
      );
      break;
    default: {
      const _exhaustive: never = settings.provider;
      callbacks.onError(new Error(`Unknown provider: ${_exhaustive}`));
    }
  }
}
