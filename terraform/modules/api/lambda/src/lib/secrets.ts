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

// ── Polar Secrets ───────────────────────────────────────────────────────────
interface PolarSecrets {
  POLAR_ACCESS_TOKEN: string;
  POLAR_WEBHOOK_SECRET: string;
}

let _polarCache: PolarSecrets | null = null;
let _polarCacheAt = 0;

export async function getPolarSecrets(secretArn: string): Promise<PolarSecrets> {
  const now = Date.now();
  if (_polarCache && now - _polarCacheAt < CACHE_TTL) return _polarCache;
  const res = await client.send(
    new GetSecretValueCommand({ SecretId: secretArn }),
  );
  if (!res.SecretString) throw new Error('Polar secrets not found');
  _polarCache = JSON.parse(res.SecretString) as PolarSecrets;
  _polarCacheAt = now;
  return _polarCache;
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
