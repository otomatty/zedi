/**
 * Secrets Manager — thumbnail keys (Custom Search) and AI keys (Gemini)
 */

import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

const client = new SecretsManagerClient({});

interface ThumbnailSecrets {
  GOOGLE_CUSTOM_SEARCH_API_KEY?: string;
  GOOGLE_CUSTOM_SEARCH_ENGINE_ID?: string;
}

interface AISecrets {
  GOOGLE_AI_API_KEY?: string;
}

let _thumbnailCache: ThumbnailSecrets | null = null;
let _thumbnailCacheAt = 0;
let _aiCache: AISecrets | null = null;
let _aiCacheAt = 0;
const CACHE_TTL = 5 * 60 * 1000;

export async function getThumbnailSecrets(secretArn: string): Promise<ThumbnailSecrets> {
  const now = Date.now();
  if (_thumbnailCache && now - _thumbnailCacheAt < CACHE_TTL) {
    return _thumbnailCache;
  }
  const command = new GetSecretValueCommand({ SecretId: secretArn });
  const response = await client.send(command);
  if (!response.SecretString) throw new Error("Thumbnail secrets not found");
  _thumbnailCache = JSON.parse(response.SecretString) as ThumbnailSecrets;
  _thumbnailCacheAt = now;
  return _thumbnailCache;
}

export async function getAISecrets(secretArn: string): Promise<AISecrets> {
  const now = Date.now();
  if (_aiCache && now - _aiCacheAt < CACHE_TTL) {
    return _aiCache;
  }
  const command = new GetSecretValueCommand({ SecretId: secretArn });
  const response = await client.send(command);
  if (!response.SecretString) throw new Error("AI secrets not found");
  _aiCache = JSON.parse(response.SecretString) as AISecrets;
  _aiCacheAt = now;
  return _aiCache;
}

export function getRequired<T>(secrets: T, key: keyof T): string {
  const value = secrets[key];
  if (value == null || String(value).trim() === "") {
    throw new Error(`Secret ${String(key)} is not configured`);
  }
  return String(value);
}
