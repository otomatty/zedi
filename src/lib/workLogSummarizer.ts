// 作業ログ要約機能 - ローカルLLMを使用してGitHub Copilot会話を作業ログに整理

import { OllamaClient } from "./aiClient";
import { AISettings, getOllamaModelInfo } from "@/types/ai";

export interface CopilotConversation {
  timestamp: string;
  project: string;
  userMessage: string;
  assistantMessage: string;
}

export interface WorkLogEntry {
  date: string;
  project: string;
  summary: string;
  keyPoints: string[];
  codeChanges: string[];
  decisions: string[];
  todos: string[];
  tags: string[];
}

export interface WorkLogSummaryResult {
  success: boolean;
  workLog?: WorkLogEntry;
  error?: string;
  processingTime?: number;
}

// 作業ログ要約用のプロンプトテンプレート
const SUMMARIZE_PROMPT = `あなたは優秀な技術ドキュメント作成者です。
以下のGitHub Copilotとの会話履歴を分析し、作業ログとして整理してください。

## 入力形式
- プロジェクト名と日付
- ユーザーとCopilotの会話履歴

## 出力形式（JSON）
必ず以下のJSON形式で出力してください。他の文章は含めないでください。

{
  "summary": "この日の作業内容を2-3文で要約",
  "keyPoints": ["重要なポイント1", "重要なポイント2"],
  "codeChanges": ["実装または変更したコード/機能の説明"],
  "decisions": ["決定した技術的な選択や方針"],
  "todos": ["残っているタスクや次回やること"],
  "tags": ["関連するタグ（技術名、機能名など）"]
}

## 注意事項
- 会話の本質的な内容のみを抽出してください
- コードブロックは概要のみ記載（詳細なコードは不要）
- 機密情報（APIキー、パスワードなど）は除外してください
- 日本語で出力してください
- JSON以外の文章は出力しないでください

---

## 会話履歴

`;

/**
 * GitHub Copilot会話のMarkdownファイルをパースする
 */
export function parseCopilotMarkdown(markdown: string): CopilotConversation[] {
  const conversations: CopilotConversation[] = [];

  // ヘッダーから日付とプロジェクトを抽出
  const dateMatch = markdown.match(/# (\d{4}年\d{1,2}月\d{1,2}日)/);
  const projectMatch = markdown.match(/## プロジェクト: (.+)/);

  const date = dateMatch?.[1] ?? new Date().toLocaleDateString("ja-JP");
  const project = projectMatch?.[1] ?? "Unknown";

  // 会話ブロックを分割
  const blocks = markdown.split(/---\n+/).filter((block) => block.trim());

  for (const block of blocks) {
    // ユーザーメッセージを抽出
    const userMatch = block.match(
      /### 💬 ユーザー\s*\n+([\s\S]*?)(?=### 🤖|$)/,
    );
    const assistantMatch = block.match(
      /### 🤖 GitHub Copilot\s*\n+([\s\S]*?)(?=### 💬|---|\n*$)/,
    );

    if (userMatch && assistantMatch) {
      conversations.push({
        timestamp: date,
        project,
        userMessage: userMatch[1].trim(),
        assistantMessage: assistantMatch[1].trim(),
      });
    }
  }

  return conversations;
}

/**
 * 会話履歴をプロンプト用のテキストに変換
 */
function formatConversationsForPrompt(
  conversations: CopilotConversation[],
  maxLength: number = 8000,
): string {
  if (conversations.length === 0) {
    return "";
  }

  const project = conversations[0].project;
  const date = conversations[0].timestamp;

  let result = `プロジェクト: ${project}\n日付: ${date}\n\n`;

  for (const conv of conversations) {
    const entry = `**ユーザー**: ${truncateText(conv.userMessage, 500)}\n\n**Copilot**: ${truncateText(conv.assistantMessage, 1000)}\n\n---\n\n`;

    if (result.length + entry.length > maxLength) {
      break;
    }

    result += entry;
  }

  return result;
}

/**
 * テキストを指定文字数で切り詰める
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength) + "...（省略）";
}

/**
 * LLMの出力からJSONを抽出
 */
function extractJson(text: string): Record<string, unknown> | null {
  // JSONブロックを探す
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1].trim());
    } catch {
      // パースエラー
    }
  }

  // 直接JSONを探す
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");

  if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
    try {
      return JSON.parse(text.substring(jsonStart, jsonEnd + 1));
    } catch {
      // パースエラー
    }
  }

  return null;
}

/**
 * 作業ログを要約する（メイン関数）
 */
export async function summarizeWorkLog(
  conversations: CopilotConversation[],
  settings: AISettings,
): Promise<WorkLogSummaryResult> {
  const startTime = Date.now();

  if (conversations.length === 0) {
    return {
      success: false,
      error: "会話履歴がありません",
    };
  }

  if (settings.provider !== "ollama") {
    return {
      success: false,
      error:
        "ローカルLLM（Ollama）のみサポートしています。セキュリティのため、外部APIへの送信は行いません。",
    };
  }

  try {
    const client = new OllamaClient(
      settings.ollamaEndpoint || "http://localhost:11434",
    );

    // モデルが利用可能か確認
    const isAvailable = await client.isModelAvailable(settings.model);
    if (!isAvailable) {
      return {
        success: false,
        error: `モデル "${settings.model}" がインストールされていません。Ollamaでモデルをダウンロードしてください: ollama pull ${settings.model}`,
      };
    }

    // プロンプトを構築
    const conversationText = formatConversationsForPrompt(conversations);
    const prompt = SUMMARIZE_PROMPT + conversationText;

    // LLMで要約を生成
    const modelInfo = getOllamaModelInfo(settings.model);
    const maxTokens = modelInfo?.category === "lightweight" ? 1024 : 2048;

    const response = await client.chat(
      settings.model,
      [
        {
          role: "system",
          content:
            "あなたは作業ログを整理するアシスタントです。必ずJSON形式で出力してください。",
        },
        { role: "user", content: prompt },
      ],
      {
        temperature: 0.3, // より決定論的な出力
        maxTokens,
      },
    );

    // JSONをパース
    const parsed = extractJson(response);

    if (!parsed) {
      // JSONパースに失敗した場合、シンプルな要約を生成
      return {
        success: true,
        workLog: {
          date: conversations[0].timestamp,
          project: conversations[0].project,
          summary: response.substring(0, 500),
          keyPoints: [],
          codeChanges: [],
          decisions: [],
          todos: [],
          tags: [],
        },
        processingTime: Date.now() - startTime,
      };
    }

    const workLog: WorkLogEntry = {
      date: conversations[0].timestamp,
      project: conversations[0].project,
      summary: (parsed.summary as string) || "要約なし",
      keyPoints: Array.isArray(parsed.keyPoints)
        ? (parsed.keyPoints as string[])
        : [],
      codeChanges: Array.isArray(parsed.codeChanges)
        ? (parsed.codeChanges as string[])
        : [],
      decisions: Array.isArray(parsed.decisions)
        ? (parsed.decisions as string[])
        : [],
      todos: Array.isArray(parsed.todos) ? (parsed.todos as string[]) : [],
      tags: Array.isArray(parsed.tags) ? (parsed.tags as string[]) : [],
    };

    return {
      success: true,
      workLog,
      processingTime: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "作業ログの生成中にエラーが発生しました",
      processingTime: Date.now() - startTime,
    };
  }
}

/**
 * 作業ログをMarkdown形式に変換
 */
export function workLogToMarkdown(workLog: WorkLogEntry): string {
  const lines: string[] = [];

  lines.push(`# 作業ログ: ${workLog.date}`);
  lines.push("");
  lines.push(`## プロジェクト: ${workLog.project}`);
  lines.push("");

  // タグ
  if (workLog.tags.length > 0) {
    lines.push(
      `**タグ**: ${workLog.tags.map((t) => `[[${t}]]`).join(" ")}`,
    );
    lines.push("");
  }

  // 要約
  lines.push("## 概要");
  lines.push("");
  lines.push(workLog.summary);
  lines.push("");

  // 重要なポイント
  if (workLog.keyPoints.length > 0) {
    lines.push("## 重要なポイント");
    lines.push("");
    for (const point of workLog.keyPoints) {
      lines.push(`- ${point}`);
    }
    lines.push("");
  }

  // コード変更
  if (workLog.codeChanges.length > 0) {
    lines.push("## 実装内容");
    lines.push("");
    for (const change of workLog.codeChanges) {
      lines.push(`- ${change}`);
    }
    lines.push("");
  }

  // 決定事項
  if (workLog.decisions.length > 0) {
    lines.push("## 決定事項");
    lines.push("");
    for (const decision of workLog.decisions) {
      lines.push(`- ${decision}`);
    }
    lines.push("");
  }

  // TODO
  if (workLog.todos.length > 0) {
    lines.push("## TODO");
    lines.push("");
    for (const todo of workLog.todos) {
      lines.push(`- [ ] ${todo}`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push(`*このログは GitHub Copilot との会話から自動生成されました*`);

  return lines.join("\n");
}

/**
 * 作業ログをTiptap JSON形式に変換（Zediへの直接インポート用）
 */
export function workLogToTiptapJson(workLog: WorkLogEntry): string {
  const content: Record<string, unknown>[] = [];

  // タイトル（H1）
  content.push({
    type: "heading",
    attrs: { level: 1 },
    content: [{ type: "text", text: `作業ログ: ${workLog.date}` }],
  });

  // プロジェクト（H2）
  content.push({
    type: "heading",
    attrs: { level: 2 },
    content: [{ type: "text", text: `プロジェクト: ${workLog.project}` }],
  });

  // タグ（WikiLink形式）
  if (workLog.tags.length > 0) {
    const tagContent: Record<string, unknown>[] = [
      { type: "text", text: "タグ: ", marks: [{ type: "bold" }] },
    ];

    workLog.tags.forEach((tag, index) => {
      tagContent.push({
        type: "wikiLink",
        attrs: { href: tag },
      });
      if (index < workLog.tags.length - 1) {
        tagContent.push({ type: "text", text: " " });
      }
    });

    content.push({
      type: "paragraph",
      content: tagContent,
    });
  }

  // 概要
  content.push({
    type: "heading",
    attrs: { level: 2 },
    content: [{ type: "text", text: "概要" }],
  });

  content.push({
    type: "paragraph",
    content: [{ type: "text", text: workLog.summary }],
  });

  // 箇条書きセクションを追加するヘルパー
  const addListSection = (title: string, items: string[]) => {
    if (items.length === 0) return;

    content.push({
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: title }],
    });

    content.push({
      type: "bulletList",
      content: items.map((item) => ({
        type: "listItem",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: item }],
          },
        ],
      })),
    });
  };

  addListSection("重要なポイント", workLog.keyPoints);
  addListSection("実装内容", workLog.codeChanges);
  addListSection("決定事項", workLog.decisions);

  // TODO（タスクリスト）
  if (workLog.todos.length > 0) {
    content.push({
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "TODO" }],
    });

    content.push({
      type: "taskList",
      content: workLog.todos.map((todo) => ({
        type: "taskItem",
        attrs: { checked: false },
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: todo }],
          },
        ],
      })),
    });
  }

  // フッター
  content.push({
    type: "horizontalRule",
  });

  content.push({
    type: "paragraph",
    content: [
      {
        type: "text",
        text: "このログは GitHub Copilot との会話から自動生成されました",
        marks: [{ type: "italic" }],
      },
    ],
  });

  return JSON.stringify({
    type: "doc",
    content,
  });
}

/**
 * Markdownファイルから作業ログを生成してZedi用コンテンツを返す
 */
export async function processMarkdownToWorkLog(
  markdownContent: string,
  settings: AISettings,
): Promise<{
  success: boolean;
  title?: string;
  content?: string; // Tiptap JSON
  markdown?: string; // Markdown形式
  error?: string;
}> {
  // 会話をパース
  const conversations = parseCopilotMarkdown(markdownContent);

  if (conversations.length === 0) {
    return {
      success: false,
      error: "会話が見つかりませんでした",
    };
  }

  // 作業ログを生成
  const result = await summarizeWorkLog(conversations, settings);

  if (!result.success || !result.workLog) {
    return {
      success: false,
      error: result.error,
    };
  }

  // タイトルを生成
  const title = `作業ログ: ${result.workLog.project} (${result.workLog.date})`;

  return {
    success: true,
    title,
    content: workLogToTiptapJson(result.workLog),
    markdown: workLogToMarkdown(result.workLog),
  };
}
