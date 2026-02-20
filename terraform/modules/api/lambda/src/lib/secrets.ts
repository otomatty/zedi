/**
 * Secrets Manager — 統合シークレット管理
 *
 * AI API キーとサムネイル API キーのキャッシュ付き取得。
 */
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({});

interface AISecrets {
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  GOOGLE_AI_API_KEY?: string;
}

interface ThumbnailSecrets {
  GOOGLE_CUSTOM_SEARCH_API_KEY?: string;
  GOOGLE_CUSTOM_SEARCH_ENGINE_ID?: string;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 分

// ── AI Secrets ──────────────────────────────────────────────────────────────
let _aiCache: AISecrets | null = null;
let _aiCacheAt = 0;

export async function getAISecrets(secretArn: string): Promise<AISecrets> {
  const now = Date.now();
  if (_aiCache && now - _aiCacheAt < CACHE_TTL) return _aiCache;
  const res = await client.send(
    new GetSecretValueCommand({ SecretId: secretArn }),
  );
  if (!res.SecretString) throw new Error('AI secrets not found');
  _aiCache = JSON.parse(res.SecretString) as AISecrets;
  _aiCacheAt = now;
  return _aiCache;
}

// ── Thumbnail Secrets ───────────────────────────────────────────────────────
let _thumbCache: ThumbnailSecrets | null = null;
let _thumbCacheAt = 0;

export async function getThumbnailSecrets(
  secretArn: string,
): Promise<ThumbnailSecrets> {
  const now = Date.now();
  if (_thumbCache && now - _thumbCacheAt < CACHE_TTL) return _thumbCache;
  const res = await client.send(
    new GetSecretValueCommand({ SecretId: secretArn }),
  );
  if (!res.SecretString) throw new Error('Thumbnail secrets not found');
  _thumbCache = JSON.parse(res.SecretString) as ThumbnailSecrets;
  _thumbCacheAt = now;
  return _thumbCache;
}

// ── Webhook Secret ──────────────────────────────────────────────────────────
let _webhookCache: string | null = null;
let _webhookCacheAt = 0;

export async function getWebhookSecret(secretArn: string): Promise<string> {
  const now = Date.now();
  if (_webhookCache && now - _webhookCacheAt < CACHE_TTL) return _webhookCache;
  const res = await client.send(
    new GetSecretValueCommand({ SecretId: secretArn }),
  );
  if (!res.SecretString) throw new Error('Webhook secret not found');
  // シークレットが JSON の場合と plain string の場合を両方サポート
  try {
    const parsed = JSON.parse(res.SecretString) as Record<string, string>;
    _webhookCache = parsed.WEBHOOK_SECRET || res.SecretString;
  } catch {
    _webhookCache = res.SecretString;
  }
  _webhookCacheAt = now;
  return _webhookCache;
}

/**
 * シークレットオブジェクトから必須キーを取り出す
 */
export function getRequired<T>(secrets: T, key: keyof T): string {
  const value = secrets[key];
  if (value == null || String(value).trim() === '') {
    throw new Error(`Secret ${String(key)} is not configured`);
  }
  return String(value);
}
