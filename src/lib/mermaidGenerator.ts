// Mermaid Generator - AIによるダイアグラム生成機能

import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { AISettings } from "@/types/ai";
import { loadAISettings } from "./aiSettings";

// ダイアグラムタイプの定義
export type MermaidDiagramType =
  | "flowchart"
  | "sequence"
  | "classDiagram"
  | "stateDiagram"
  | "erDiagram"
  | "gantt"
  | "pie"
  | "mindmap";

export interface DiagramTypeInfo {
  id: MermaidDiagramType;
  name: string;
  description: string;
  example: string;
}

export const DIAGRAM_TYPES: DiagramTypeInfo[] = [
  {
    id: "flowchart",
    name: "フローチャート",
    description: "処理の流れや手順を表現",
    example:
      "flowchart TD\n    A[開始] --> B{条件}\n    B -->|Yes| C[処理]\n    B -->|No| D[終了]",
  },
  {
    id: "sequence",
    name: "シーケンス図",
    description: "オブジェクト間のやり取りを時系列で表現",
    example:
      "sequenceDiagram\n    participant A as ユーザー\n    participant B as システム\n    A->>B: リクエスト\n    B-->>A: レスポンス",
  },
  {
    id: "classDiagram",
    name: "クラス図",
    description: "クラスの構造と関係を表現",
    example:
      "classDiagram\n    class Animal {\n        +String name\n        +eat()\n    }\n    class Dog {\n        +bark()\n    }\n    Animal <|-- Dog",
  },
  {
    id: "stateDiagram",
    name: "状態遷移図",
    description: "状態の変化と遷移条件を表現",
    example:
      "stateDiagram-v2\n    [*] --> 待機中\n    待機中 --> 処理中: 開始\n    処理中 --> 完了: 終了\n    完了 --> [*]",
  },
  {
    id: "erDiagram",
    name: "ER図",
    description: "エンティティ間の関係を表現",
    example:
      "erDiagram\n    USER ||--o{ ORDER : places\n    ORDER ||--|{ ITEM : contains\n    USER {\n        int id\n        string name\n    }",
  },
  {
    id: "gantt",
    name: "ガントチャート",
    description: "プロジェクトのスケジュールを表現",
    example:
      "gantt\n    title プロジェクト計画\n    dateFormat YYYY-MM-DD\n    section フェーズ1\n    タスク1 :a1, 2024-01-01, 7d\n    タスク2 :after a1, 5d",
  },
  {
    id: "pie",
    name: "円グラフ",
    description: "割合や構成比を表現",
    example:
      'pie title 構成比\n    "項目A" : 40\n    "項目B" : 30\n    "項目C" : 30',
  },
  {
    id: "mindmap",
    name: "マインドマップ",
    description: "アイデアや概念の関連を表現",
    example:
      "mindmap\n  root((中心テーマ))\n    トピック1\n      サブトピック1\n      サブトピック2\n    トピック2\n      サブトピック3",
  },
];

// プロンプトテンプレート
const MERMAID_GENERATOR_PROMPT = `あなたはMermaidダイアグラムの専門家です。
与えられたテキストの内容を分析し、指定されたダイアグラムタイプで適切なMermaidコードを生成してください。

## ダイアグラムタイプ
{{diagramTypes}}

## 入力テキスト
{{text}}

## 出力要件
1. Mermaidの構文として正しいコードのみを出力
2. コードブロック(\`\`\`)で囲まないこと
3. 日本語のラベルを使用可能
4. シンプルで読みやすい構造にする
5. 余分な説明は不要、Mermaidコードのみを出力

## 出力形式
Mermaidコードのみを出力してください。`;

export interface MermaidGeneratorResult {
  code: string;
  diagramType: MermaidDiagramType;
}

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

  // api_serverモードならAPIキー不要
  const effectiveMode = settings.apiMode || (settings.apiKey ? "user_api_key" : "api_server");
  if (effectiveMode === "api_server") {
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
  callbacks: MermaidGeneratorCallbacks
): Promise<void> {
  const client = new OpenAI({
    apiKey: settings.apiKey,
    dangerouslyAllowBrowser: true,
  });

  const diagramTypesInfo = diagramTypes
    .map((type) => {
      const info = DIAGRAM_TYPES.find((d) => d.id === type);
      return info ? `- ${info.name} (${info.id}): ${info.description}` : "";
    })
    .filter(Boolean)
    .join("\n");

  const prompt = MERMAID_GENERATOR_PROMPT.replace(
    "{{diagramTypes}}",
    diagramTypesInfo
  ).replace("{{text}}", text);

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
    callbacks.onError(
      error instanceof Error ? error : new Error("OpenAI API error")
    );
  }
}

/**
 * AnthropicでMermaid生成
 */
async function generateWithAnthropic(
  settings: AISettings,
  text: string,
  diagramTypes: MermaidDiagramType[],
  callbacks: MermaidGeneratorCallbacks
): Promise<void> {
  const client = new Anthropic({
    apiKey: settings.apiKey,
  });

  const diagramTypesInfo = diagramTypes
    .map((type) => {
      const info = DIAGRAM_TYPES.find((d) => d.id === type);
      return info ? `- ${info.name} (${info.id}): ${info.description}` : "";
    })
    .filter(Boolean)
    .join("\n");

  const prompt = MERMAID_GENERATOR_PROMPT.replace(
    "{{diagramTypes}}",
    diagramTypesInfo
  ).replace("{{text}}", text);

  try {
    const response = await client.messages.create({
      model: settings.model,
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    const code =
      textBlock && textBlock.type === "text" ? textBlock.text.trim() : "";

    const detectedType = detectDiagramType(code, diagramTypes);

    callbacks.onComplete({
      code,
      diagramType: detectedType,
    });
  } catch (error) {
    callbacks.onError(
      error instanceof Error ? error : new Error("Anthropic API error")
    );
  }
}

/**
 * Google AIでMermaid生成
 */
async function generateWithGoogle(
  settings: AISettings,
  text: string,
  diagramTypes: MermaidDiagramType[],
  callbacks: MermaidGeneratorCallbacks
): Promise<void> {
  const client = new GoogleGenAI({ apiKey: settings.apiKey });

  const diagramTypesInfo = diagramTypes
    .map((type) => {
      const info = DIAGRAM_TYPES.find((d) => d.id === type);
      return info ? `- ${info.name} (${info.id}): ${info.description}` : "";
    })
    .filter(Boolean)
    .join("\n");

  const prompt = MERMAID_GENERATOR_PROMPT.replace(
    "{{diagramTypes}}",
    diagramTypesInfo
  ).replace("{{text}}", text);

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
    callbacks.onError(
      error instanceof Error ? error : new Error("Google AI API error")
    );
  }
}

/**
 * 生成されたコードからダイアグラムタイプを検出
 */
function detectDiagramType(
  code: string,
  requestedTypes: MermaidDiagramType[]
): MermaidDiagramType {
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
  callbacks: MermaidGeneratorCallbacks
): Promise<void> {
  const settings = await getAISettingsOrThrow();
  const effectiveMode = settings.apiMode || (settings.apiKey ? "user_api_key" : "api_server");

  // api_serverモード: 統一されたcallAIService経由
  if (effectiveMode === "api_server") {
    try {
      const { callAIService } = await import("@/lib/aiService");
      const diagramTypeStr = diagramTypes.join(", ");
      const prompt = MERMAID_GENERATOR_PROMPT
        .replace("{{text}}", text)
        .replace("{{diagramTypes}}", diagramTypeStr);

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
        }
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
    default:
      callbacks.onError(new Error(`Unknown provider: ${settings.provider}`));
  }
}
