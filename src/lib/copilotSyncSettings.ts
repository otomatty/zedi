// GitHub Copilot → Zedi 同期設定管理

export interface CopilotSyncSettings {
  // 同期の有効/無効
  enabled: boolean;

  // 自動要約の有効/無効（ローカルLLM使用）
  autoSummarize: boolean;

  // Copilotセッションディレクトリ（VS Code）
  sessionDirectory: string;

  // 出力ディレクトリ（処理前のMarkdown）
  outputDirectory: string;

  // 監視間隔（秒）
  pollInterval: number;

  // 最後に同期したタイムスタンプ（セッションファイルごと）
  lastSyncedTimestamps: Record<string, number>;

  // 処理済みセッションID（重複防止）
  processedSessions: string[];

  // 作業ログのプレフィックス
  workLogPrefix: string;

  // 自動タグ付け
  autoTags: string[];
}

const STORAGE_KEY = "zedi-copilot-sync-settings";
const DEFAULT_VS_CODE_SESSION_DIR =
  "~/Library/Application Support/Code/User/workspaceStorage";

export const DEFAULT_COPILOT_SYNC_SETTINGS: CopilotSyncSettings = {
  enabled: false,
  autoSummarize: true,
  sessionDirectory: DEFAULT_VS_CODE_SESSION_DIR,
  outputDirectory: "~/zedi-copilot-logs",
  pollInterval: 5,
  lastSyncedTimestamps: {},
  processedSessions: [],
  workLogPrefix: "作業ログ",
  autoTags: ["GitHub Copilot", "作業ログ"],
};

/**
 * 同期設定を保存
 */
export function saveCopilotSyncSettings(
  settings: CopilotSyncSettings,
): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error("Failed to save Copilot sync settings:", error);
  }
}

/**
 * 同期設定を読み込み
 */
export function loadCopilotSyncSettings(): CopilotSyncSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return { ...DEFAULT_COPILOT_SYNC_SETTINGS };
    }

    const parsed = JSON.parse(stored) as Partial<CopilotSyncSettings>;
    return {
      ...DEFAULT_COPILOT_SYNC_SETTINGS,
      ...parsed,
    };
  } catch (error) {
    console.error("Failed to load Copilot sync settings:", error);
    return { ...DEFAULT_COPILOT_SYNC_SETTINGS };
  }
}

/**
 * 同期設定をクリア
 */
export function clearCopilotSyncSettings(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * 最後に同期したタイムスタンプを更新
 */
export function updateLastSyncedTimestamp(
  sessionId: string,
  timestamp: number,
): void {
  const settings = loadCopilotSyncSettings();
  settings.lastSyncedTimestamps[sessionId] = timestamp;
  saveCopilotSyncSettings(settings);
}

/**
 * セッションを処理済みとしてマーク
 */
export function markSessionAsProcessed(sessionId: string): void {
  const settings = loadCopilotSyncSettings();
  if (!settings.processedSessions.includes(sessionId)) {
    settings.processedSessions.push(sessionId);
    // 古いエントリを削除（最大1000件保持）
    if (settings.processedSessions.length > 1000) {
      settings.processedSessions = settings.processedSessions.slice(-1000);
    }
    saveCopilotSyncSettings(settings);
  }
}

/**
 * セッションが処理済みかどうか確認
 */
export function isSessionProcessed(sessionId: string): boolean {
  const settings = loadCopilotSyncSettings();
  return settings.processedSessions.includes(sessionId);
}

/**
 * パスを展開（~をホームディレクトリに置換）
 * Note: ブラウザ環境ではホームディレクトリは取得できないため、
 * この関数はNode.js環境（スクリプト）での使用を想定
 */
export function expandPath(path: string): string {
  // ブラウザ環境では展開しない
  if (typeof window !== "undefined") {
    return path;
  }

  // Node.js環境
  if (path.startsWith("~")) {
    const homedir = process.env.HOME || process.env.USERPROFILE || "";
    return path.replace("~", homedir);
  }

  return path;
}

/**
 * VS Codeのワークスペース名を取得するヘルパー
 */
export function extractWorkspaceName(sessionPath: string): string {
  // パスからワークスペースハッシュを抽出
  const match = sessionPath.match(/workspaceStorage\/([a-f0-9]+)\//);
  if (match) {
    return match[1].substring(0, 8); // ハッシュの最初の8文字
  }
  return "unknown";
}

/**
 * セッションIDをパスから抽出
 */
export function extractSessionId(sessionPath: string): string {
  // ファイル名からUUIDを抽出
  const match = sessionPath.match(
    /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.json$/i,
  );
  if (match) {
    return match[1];
  }

  // ファイル名をそのまま使用
  const filename = sessionPath.split("/").pop() || "";
  return filename.replace(".json", "");
}

/**
 * 今日の日付文字列を取得
 */
export function getTodayDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
}

/**
 * ISO形式の今日の日付を取得
 */
export function getTodayISODate(): string {
  return new Date().toISOString().split("T")[0];
}
