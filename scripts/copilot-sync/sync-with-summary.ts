#!/usr/bin/env npx tsx

/**
 * GitHub Copilot → Zedi 同期スクリプト（要約機能付き）
 *
 * このスクリプトはGitHub Copilot Chatの会話を監視し、
 * ローカルLLM（Ollama）を使用して作業ログに要約してからZediに保存します。
 *
 * セキュリティ:
 * - すべての処理はローカルで完結
 * - ネットワークアクセスはOllamaのローカルエンドポイントのみ
 * - 会話データは外部に送信されません
 *
 * 使用方法:
 *   npx tsx sync-with-summary.ts watch     # 監視モード
 *   npx tsx sync-with-summary.ts sync      # 一度だけ同期
 *   npx tsx sync-with-summary.ts sync-all  # 全セッション同期
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// ==================== 設定 ====================

interface Config {
  // VS Code Copilot セッションディレクトリ
  sessionDirectory: string;
  // 出力ディレクトリ（要約前のMarkdown）
  rawOutputDirectory: string;
  // 要約済み出力ディレクトリ
  summaryOutputDirectory: string;
  // Ollamaエンドポイント
  ollamaEndpoint: string;
  // 使用するモデル
  ollamaModel: string;
  // 監視間隔（秒）
  pollInterval: number;
  // 最大コンテキスト長
  maxContextLength: number;
  // 状態ファイルパス
  stateFilePath: string;
}

const DEFAULT_CONFIG: Config = {
  sessionDirectory: path.join(
    os.homedir(),
    "Library/Application Support/Code/User/workspaceStorage"
  ),
  rawOutputDirectory: path.join(os.homedir(), "zedi-copilot-logs/raw"),
  summaryOutputDirectory: path.join(os.homedir(), "zedi-copilot-logs/summary"),
  ollamaEndpoint: process.env.OLLAMA_ENDPOINT || "http://localhost:11434",
  ollamaModel: process.env.OLLAMA_MODEL || "qwen2.5:7b",
  pollInterval: parseInt(process.env.POLL_INTERVAL || "5", 10),
  maxContextLength: 8000,
  stateFilePath: path.join(os.homedir(), ".zedi-copilot-sync-state.json"),
};

// ==================== 型定義 ====================

interface CopilotSession {
  version: number;
  requesterUsername: string;
  responderUsername: string;
  requests: CopilotRequest[];
}

interface CopilotRequest {
  requestId: string;
  message: {
    text?: string;
    parts?: Array<{ text?: string }>;
  };
  response: Array<{ value?: string; text?: string }>;
}

interface SyncState {
  lastSyncedTimestamps: Record<string, number>;
  processedSessions: string[];
}

interface WorkLog {
  date: string;
  project: string;
  summary: string;
  keyPoints: string[];
  codeChanges: string[];
  decisions: string[];
  todos: string[];
  tags: string[];
}

interface Conversation {
  userMessage: string;
  assistantMessage: string;
}

// ==================== ユーティリティ ====================

function log(message: string, level: "info" | "success" | "warn" | "error" = "info"): void {
  const prefix = {
    info: "ℹ",
    success: "✓",
    warn: "⚠",
    error: "✗",
  };
  const timestamp = new Date().toLocaleTimeString("ja-JP");
  console.log(`[${timestamp}] ${prefix[level]} ${message}`);
}

function loadState(config: Config): SyncState {
  try {
    if (fs.existsSync(config.stateFilePath)) {
      const content = fs.readFileSync(config.stateFilePath, "utf-8");
      return JSON.parse(content);
    }
  } catch (error) {
    log(`状態ファイルの読み込みに失敗: ${error}`, "warn");
  }
  return {
    lastSyncedTimestamps: {},
    processedSessions: [],
  };
}

function saveState(state: SyncState, config: Config): void {
  try {
    fs.writeFileSync(config.stateFilePath, JSON.stringify(state, null, 2));
  } catch (error) {
    log(`状態ファイルの保存に失敗: ${error}`, "error");
  }
}

function ensureDirectory(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getTodayDate(): string {
  const now = new Date();
  return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
}

function getTodayISODate(): string {
  return new Date().toISOString().split("T")[0];
}

// ==================== セッション検索 ====================

function findSessionFiles(config: Config, maxAgeMinutes: number = 60): string[] {
  const sessionFiles: string[] = [];
  const cutoffTime = Date.now() - maxAgeMinutes * 60 * 1000;

  function walkDir(dir: string): void {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // subagentsディレクトリはスキップ
        if (entry.name !== "subagents") {
          walkDir(fullPath);
        }
      } else if (entry.isFile() && entry.name.endsWith(".json")) {
        // chatSessionsディレクトリ内のファイルのみ
        if (fullPath.includes("/chatSessions/")) {
          try {
            const stat = fs.statSync(fullPath);
            if (maxAgeMinutes === -1 || stat.mtimeMs > cutoffTime) {
              sessionFiles.push(fullPath);
            }
          } catch {
            // ファイルアクセスエラーは無視
          }
        }
      }
    }
  }

  walkDir(config.sessionDirectory);
  return sessionFiles;
}

// ==================== ワークスペース名取得 ====================

function getWorkspaceName(sessionPath: string, config: Config): string {
  // パスからワークスペースハッシュを抽出
  const match = sessionPath.match(/workspaceStorage\/([a-f0-9]+)\//);
  if (!match) return "unknown";

  const workspaceHash = match[1];
  const workspaceDir = path.join(
    config.sessionDirectory,
    workspaceHash
  );
  const workspaceJsonPath = path.join(workspaceDir, "workspace.json");

  try {
    if (fs.existsSync(workspaceJsonPath)) {
      const content = fs.readFileSync(workspaceJsonPath, "utf-8");
      const workspace = JSON.parse(content);
      if (workspace.folder) {
        // file:///path/to/project からプロジェクト名を抽出
        const folderPath = workspace.folder.replace(/^file:\/\//, "");
        return path.basename(folderPath);
      }
    }
  } catch {
    // エラーは無視してハッシュを返す
  }

  return workspaceHash.substring(0, 8);
}

// ==================== セッション解析 ====================

function parseSession(sessionPath: string): Conversation[] {
  try {
    const content = fs.readFileSync(sessionPath, "utf-8");
    const session: CopilotSession = JSON.parse(content);

    return (session.requests || [])
      .map((request) => {
        // ユーザーメッセージを抽出
        let userMessage = request.message?.text || "";
        if (!userMessage && request.message?.parts) {
          userMessage = request.message.parts
            .map((p) => p.text || "")
            .join("")
            .trim();
        }

        // アシスタントメッセージを抽出
        const assistantMessage = (request.response || [])
          .map((r) => r.value || r.text || "")
          .join("")
          .trim();

        return { userMessage, assistantMessage };
      })
      .filter((conv) => conv.userMessage && conv.assistantMessage);
  } catch (error) {
    log(`セッションの解析に失敗: ${sessionPath} - ${error}`, "error");
    return [];
  }
}

// ==================== Markdown生成 ====================

function conversationsToMarkdown(
  conversations: Conversation[],
  project: string,
  date: string
): string {
  const lines: string[] = [
    `# ${date} GitHub Copilot との会話`,
    "",
    `## プロジェクト: ${project}`,
    "",
    "---",
    "",
  ];

  for (const conv of conversations) {
    lines.push("### 💬 ユーザー");
    lines.push("");
    lines.push(conv.userMessage);
    lines.push("");
    lines.push("### 🤖 GitHub Copilot");
    lines.push("");
    lines.push(conv.assistantMessage);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

// ==================== Ollama API ====================

async function checkOllamaAvailable(config: Config): Promise<boolean> {
  try {
    const response = await fetch(`${config.ollamaEndpoint}/api/version`);
    return response.ok;
  } catch {
    return false;
  }
}

async function checkModelAvailable(config: Config): Promise<boolean> {
  try {
    const response = await fetch(`${config.ollamaEndpoint}/api/tags`);
    if (!response.ok) return false;

    const data = await response.json();
    const models = (data.models || []).map((m: { name: string }) => m.name);
    const modelBase = config.ollamaModel.split(":")[0];

    return models.some((m: string) => m.startsWith(modelBase));
  } catch {
    return false;
  }
}

async function summarizeWithOllama(
  conversations: Conversation[],
  project: string,
  config: Config
): Promise<WorkLog | null> {
  // プロンプトを構築
  const conversationText = conversations
    .slice(0, 20) // 最大20会話まで
    .map(
      (conv) =>
        `**ユーザー**: ${conv.userMessage.substring(0, 500)}\n\n**Copilot**: ${conv.assistantMessage.substring(0, 1000)}`
    )
    .join("\n\n---\n\n");

  const prompt = `あなたは優秀な技術ドキュメント作成者です。
以下のGitHub Copilotとの会話履歴を分析し、作業ログとして整理してください。

## 入力
プロジェクト: ${project}
日付: ${getTodayDate()}

## 会話履歴
${conversationText}

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

注意: JSON以外の文章は出力しないでください。`;

  try {
    const response = await fetch(`${config.ollamaEndpoint}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.ollamaModel,
        messages: [
          {
            role: "system",
            content:
              "あなたは作業ログを整理するアシスタントです。必ずJSON形式で出力してください。",
          },
          { role: "user", content: prompt },
        ],
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 2048,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const data = await response.json();
    const responseText = data.message?.content || "";

    // JSONを抽出
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      log("JSONの抽出に失敗しました", "warn");
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      date: getTodayDate(),
      project,
      summary: parsed.summary || "要約なし",
      keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
      codeChanges: Array.isArray(parsed.codeChanges) ? parsed.codeChanges : [],
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
      todos: Array.isArray(parsed.todos) ? parsed.todos : [],
      tags: Array.isArray(parsed.tags)
        ? [...parsed.tags, "GitHub Copilot", "作業ログ"]
        : ["GitHub Copilot", "作業ログ"],
    };
  } catch (error) {
    log(`要約の生成に失敗: ${error}`, "error");
    return null;
  }
}

// ==================== 作業ログをMarkdownに変換 ====================

function workLogToMarkdown(workLog: WorkLog): string {
  const lines: string[] = [
    `# 作業ログ: ${workLog.date}`,
    "",
    `## プロジェクト: ${workLog.project}`,
    "",
  ];

  // タグ（WikiLink形式）
  if (workLog.tags.length > 0) {
    lines.push(`**タグ**: ${workLog.tags.map((t) => `[[${t}]]`).join(" ")}`);
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
    workLog.keyPoints.forEach((p) => lines.push(`- ${p}`));
    lines.push("");
  }

  // コード変更
  if (workLog.codeChanges.length > 0) {
    lines.push("## 実装内容");
    lines.push("");
    workLog.codeChanges.forEach((c) => lines.push(`- ${c}`));
    lines.push("");
  }

  // 決定事項
  if (workLog.decisions.length > 0) {
    lines.push("## 決定事項");
    lines.push("");
    workLog.decisions.forEach((d) => lines.push(`- ${d}`));
    lines.push("");
  }

  // TODO
  if (workLog.todos.length > 0) {
    lines.push("## TODO");
    lines.push("");
    workLog.todos.forEach((t) => lines.push(`- [ ] ${t}`));
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("*このログは GitHub Copilot との会話から自動生成されました*");

  return lines.join("\n");
}

// ==================== 作業ログをTiptap JSONに変換（Zedi用） ====================

function workLogToTiptapJson(workLog: WorkLog): string {
  const content: unknown[] = [];

  // タイトル
  content.push({
    type: "heading",
    attrs: { level: 1 },
    content: [{ type: "text", text: `作業ログ: ${workLog.date}` }],
  });

  // プロジェクト
  content.push({
    type: "heading",
    attrs: { level: 2 },
    content: [{ type: "text", text: `プロジェクト: ${workLog.project}` }],
  });

  // タグ（WikiLink形式）
  if (workLog.tags.length > 0) {
    const tagContent: unknown[] = [
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

    content.push({ type: "paragraph", content: tagContent });
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

  // リストセクション追加ヘルパー
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
        content: [{ type: "paragraph", content: [{ type: "text", text: item }] }],
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
        content: [{ type: "paragraph", content: [{ type: "text", text: todo }] }],
      })),
    });
  }

  // フッター
  content.push({ type: "horizontalRule" });
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

  return JSON.stringify({ type: "doc", content }, null, 2);
}

// ==================== メイン処理 ====================

async function syncSession(
  sessionPath: string,
  config: Config,
  state: SyncState,
  summarize: boolean
): Promise<boolean> {
  const sessionId = path.basename(sessionPath, ".json");

  // ファイルの変更時刻をチェック
  const stat = fs.statSync(sessionPath);
  const lastSynced = state.lastSyncedTimestamps[sessionId] || 0;

  if (stat.mtimeMs <= lastSynced) {
    return false; // 変更なし
  }

  // 会話を解析
  const conversations = parseSession(sessionPath);
  if (conversations.length === 0) {
    return false;
  }

  const project = getWorkspaceName(sessionPath, config);
  const date = getTodayDate();
  const isoDate = getTodayISODate();

  log(`同期中: ${project} (${conversations.length}件の会話)`);

  // 1. 生のMarkdownを保存（バックアップ）
  ensureDirectory(config.rawOutputDirectory);
  const rawFilename = `${isoDate}_${project}_${sessionId}.md`;
  const rawPath = path.join(config.rawOutputDirectory, rawFilename);
  const rawMarkdown = conversationsToMarkdown(conversations, project, date);
  fs.writeFileSync(rawPath, rawMarkdown);

  // 2. 要約して保存
  if (summarize) {
    log(`要約生成中: ${config.ollamaModel}...`);
    const workLog = await summarizeWithOllama(conversations, project, config);

    if (workLog) {
      ensureDirectory(config.summaryOutputDirectory);

      // Markdown形式
      const summaryMdPath = path.join(
        config.summaryOutputDirectory,
        `${isoDate}_${project}_summary.md`
      );
      fs.writeFileSync(summaryMdPath, workLogToMarkdown(workLog));

      // Tiptap JSON形式（Zediインポート用）
      const summaryJsonPath = path.join(
        config.summaryOutputDirectory,
        `${isoDate}_${project}_summary.json`
      );
      fs.writeFileSync(summaryJsonPath, workLogToTiptapJson(workLog));

      log(`要約完了: ${summaryMdPath}`, "success");
    } else {
      log("要約の生成に失敗しました。生のMarkdownのみ保存しました。", "warn");
    }
  }

  // 状態を更新
  state.lastSyncedTimestamps[sessionId] = stat.mtimeMs;
  saveState(state, config);

  return true;
}

async function watchLoop(config: Config): Promise<void> {
  console.log("===================================================");
  console.log("GitHub Copilot → Zedi 同期サービス（要約機能付き）");
  console.log("===================================================");
  console.log(`監視対象:     ${config.sessionDirectory}`);
  console.log(`生データ出力: ${config.rawOutputDirectory}`);
  console.log(`要約出力:     ${config.summaryOutputDirectory}`);
  console.log(`モデル:       ${config.ollamaModel}`);
  console.log(`間隔:         ${config.pollInterval}秒`);
  console.log("===================================================");
  console.log("");

  // Ollamaの確認
  const ollamaAvailable = await checkOllamaAvailable(config);
  if (!ollamaAvailable) {
    log(
      "Ollamaに接続できません。要約なしで同期します。",
      "warn"
    );
    log(`Ollamaを起動してください: ollama serve`, "info");
  } else {
    const modelAvailable = await checkModelAvailable(config);
    if (!modelAvailable) {
      log(
        `モデル "${config.ollamaModel}" がインストールされていません。`,
        "warn"
      );
      log(`インストール: ollama pull ${config.ollamaModel}`, "info");
    } else {
      log(`Ollama接続OK: ${config.ollamaModel}`, "success");
    }
  }

  console.log("");
  log("監視を開始します。Ctrl+C で停止。");
  console.log("");

  const state = loadState(config);
  const summarize = ollamaAvailable && (await checkModelAvailable(config));

  while (true) {
    const sessionFiles = findSessionFiles(config, 60);

    for (const sessionPath of sessionFiles) {
      try {
        await syncSession(sessionPath, config, state, summarize);
      } catch (error) {
        log(`セッション同期エラー: ${error}`, "error");
      }
    }

    await new Promise((resolve) =>
      setTimeout(resolve, config.pollInterval * 1000)
    );
  }
}

async function syncOnce(config: Config, all: boolean = false): Promise<void> {
  log(all ? "全セッションを同期中..." : "最近のセッションを同期中...");

  // Ollamaの確認
  const ollamaAvailable = await checkOllamaAvailable(config);
  const modelAvailable = ollamaAvailable && (await checkModelAvailable(config));

  if (!modelAvailable) {
    log("Ollamaが利用できないため、要約なしで同期します。", "warn");
  }

  const state = loadState(config);
  const sessionFiles = findSessionFiles(config, all ? -1 : 60);

  log(`${sessionFiles.length}件のセッションファイルを検出`);

  let syncedCount = 0;
  for (const sessionPath of sessionFiles) {
    try {
      const synced = await syncSession(
        sessionPath,
        config,
        state,
        modelAvailable
      );
      if (synced) syncedCount++;
    } catch (error) {
      log(`セッション同期エラー: ${error}`, "error");
    }
  }

  log(`同期完了: ${syncedCount}件のセッションを処理しました`, "success");
}

function showHelp(): void {
  console.log(`
使用方法: npx tsx sync-with-summary.ts [コマンド]

コマンド:
  watch      セッションの監視を開始（デフォルト）
  sync       最近のセッションを一度だけ同期
  sync-all   全セッションを同期
  help       このヘルプを表示

環境変数:
  OLLAMA_ENDPOINT  Ollamaエンドポイント（デフォルト: http://localhost:11434）
  OLLAMA_MODEL     使用するモデル（デフォルト: qwen2.5:7b）
  POLL_INTERVAL    監視間隔（秒、デフォルト: 5）

例:
  npx tsx sync-with-summary.ts                    # 監視モード
  npx tsx sync-with-summary.ts sync               # 一度だけ同期
  OLLAMA_MODEL=llama3.2:latest npx tsx sync-with-summary.ts watch  # モデル指定

セキュリティ:
  - すべての処理はローカルで完結します
  - ネットワークアクセスはOllamaのローカルエンドポイントのみです
  - 会話データは外部に送信されません
`);
}

// ==================== エントリーポイント ====================

async function main(): Promise<void> {
  const config = DEFAULT_CONFIG;
  const command = process.argv[2] || "watch";

  switch (command) {
    case "watch":
      await watchLoop(config);
      break;
    case "sync":
      await syncOnce(config, false);
      break;
    case "sync-all":
      await syncOnce(config, true);
      break;
    case "help":
    case "--help":
    case "-h":
      showHelp();
      break;
    default:
      console.error(`不明なコマンド: ${command}`);
      showHelp();
      process.exit(1);
  }
}

main().catch((error) => {
  console.error("エラー:", error);
  process.exit(1);
});
