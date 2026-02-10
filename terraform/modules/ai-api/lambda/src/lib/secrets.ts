/**
 * Secrets Manager client — caches AI provider API keys
 */

import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

const client = new SecretsManagerClient({});

interface AISecrets {
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  GOOGLE_AI_API_KEY?: string;
}

let _cached: AISecrets | null = null;
let _cachedAt = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getAISecrets(secretArn: string): Promise<AISecrets> {
  const now = Date.now();
  if (_cached && now - _cachedAt < CACHE_TTL) {
    return _cached;
  }

  const command = new GetSecretValueCommand({ SecretId: secretArn });
  const response = await client.send(command);

  if (!response.SecretString) {
    throw new Error("AI secrets not found");
  }

  _cached = JSON.parse(response.SecretString) as AISecrets;
  _cachedAt = now;
  return _cached;
}

export function getRequiredSecret(
  secrets: AISecrets,
  key: keyof AISecrets
): string {
  const value = secrets[key];
  if (!value) {
    throw new Error(`AI secret ${key} is not configured`);
  }
  return value;
}
