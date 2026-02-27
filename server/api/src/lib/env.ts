export function getEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

export function getOptionalEnv(key: string, fallback = ""): string {
  return process.env[key] || fallback;
}
