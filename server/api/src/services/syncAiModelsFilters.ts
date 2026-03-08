/**
 * AI モデル同期: テキストチャット判定・最新世代・ティア・allowlist
 */
import type { AIProviderType } from "../types/index.js";

const OPENAI_TEXT_CHAT_EXCLUDE_PATTERNS = [
  "image",
  "tts",
  "audio",
  "realtime",
  "transcribe",
  "instruct",
  "codex",
  "search",
];
const GOOGLE_TEXT_CHAT_EXCLUDE_PATTERNS = [
  "imagen",
  "veo",
  "embedding",
  "tts",
  "audio",
  "image",
  "aqa",
  "robotics",
  "computer-use",
  "deep-research",
  "gemma",
  "nano-banana",
];

/**
 * テキストチャット用途のモデルかどうかを判定する。
 * 画像生成・動画生成・音声/TTS・Embedding・リアルタイム・転写・コード実行専用等を除外。
 */
export function isTextChatModel(provider: AIProviderType, modelId: string): boolean {
  const id = modelId.toLowerCase();

  if (provider === "openai") {
    return !OPENAI_TEXT_CHAT_EXCLUDE_PATTERNS.some((p) => id.includes(p));
  }
  if (provider === "google") {
    return !GOOGLE_TEXT_CHAT_EXCLUDE_PATTERNS.some((p) => id.includes(p));
  }

  return true;
}

/**
 * 最新世代のモデルのみを残す。
 * 旧世代・日付付きバージョン・冗長エイリアスを除外。
 */
export function isLatestGeneration(provider: AIProviderType, modelId: string): boolean {
  const id = modelId.toLowerCase();

  if (provider === "openai" && /\d{4}-\d{2}-\d{2}$/.test(id)) return false;
  if (provider === "anthropic" && /\d{8}$/.test(id)) return false;

  if (provider === "openai") {
    if (id.startsWith("gpt-3.5")) return false;
    if (id.endsWith("-chat-latest")) return false;
    return true;
  }

  if (provider === "anthropic") {
    if (/^claude-3(-|$)/.test(id)) return false;
    return true;
  }

  if (provider === "google") {
    if (/-(0\d{2})$/.test(id)) return false;
    if (id.endsWith("-latest")) return false;
    if (/\d{2}-\d{4}$/.test(id)) return false;
    if (id.includes("customtools")) return false;
    return true;
  }

  return true;
}

/**
 * Sonnet 系モデルかどうか（コストが高いため同期時はデフォルト非アクティブ）。
 */
export function isSonnetModel(_provider: AIProviderType, modelId: string): boolean {
  return modelId.toLowerCase().includes("sonnet");
}

/**
 * モデルの料金ティアを判定する。
 * mini/nano/flash 系は free、flagship/pro 系は pro。
 */
export function assignTier(provider: AIProviderType, modelId: string): "free" | "pro" {
  const id = modelId.toLowerCase();

  if (provider === "openai") {
    if (id.includes("mini") || id.includes("nano")) return "free";
    return "pro";
  }

  if (provider === "anthropic") {
    if (id.includes("haiku") || id.includes("sonnet")) return "free";
    return "pro";
  }

  if (provider === "google") {
    if (id.includes("pro")) return "pro";
    return "free";
  }

  return "free";
}

/** カンマ区切り環境変数を ID の Set に（空 or 未設定なら null = 全件対象） */
export function parseAllowlist(envValue: string): Set<string> | null {
  const s = envValue?.trim();
  if (!s) return null;
  const ids = s
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return ids.length > 0 ? new Set(ids) : null;
}
