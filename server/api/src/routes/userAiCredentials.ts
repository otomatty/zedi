/**
 * `/api/user/ai-credentials` — BYOK credential registration (#951).
 *
 * 平文 API キーはレスポンスに含めない。POST body で受け取り暗号化して保存する。
 * Plaintext keys are never returned; POST accepts a key and stores ciphertext only.
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { authRequired } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";
import type { AppEnv } from "../types/index.js";
import type { UserAiCredentialProvider } from "../schema/userAiCredentials.js";
import {
  deleteUserAiCredential,
  isUserAiCredentialStorageEnabled,
  listUserAiCredentialAvailability,
  upsertUserAiCredential,
} from "../services/userAiCredentialService.js";

const PROVIDERS: readonly UserAiCredentialProvider[] = ["anthropic", "openai", "google"];

function parseProvider(value: unknown): UserAiCredentialProvider {
  if (typeof value !== "string" || !PROVIDERS.includes(value as UserAiCredentialProvider)) {
    throw new HTTPException(400, {
      message: `provider must be one of: ${PROVIDERS.join(", ")}`,
    });
  }
  return value as UserAiCredentialProvider;
}

const app = new Hono<AppEnv>();

/** GET — list configured providers (no secrets). */
app.get("/", authRequired, async (c) => {
  const userId = c.get("userId");
  const db = c.get("db");
  const storageEnabled = isUserAiCredentialStorageEnabled();
  const providers = storageEnabled
    ? await listUserAiCredentialAvailability(userId, db)
    : PROVIDERS.map((provider) => ({ provider, configured: false }));
  return c.json({ storageEnabled, providers });
});

/** PUT — upsert encrypted credential for a provider. */
app.put("/:provider", authRequired, rateLimit(), async (c) => {
  if (!isUserAiCredentialStorageEnabled()) {
    throw new HTTPException(503, {
      message: "Server-side credential storage is not configured",
    });
  }
  const userId = c.get("userId");
  const db = c.get("db");
  const provider = parseProvider(c.req.param("provider"));
  let body: { apiKey?: string };
  try {
    body = await c.req.json<{ apiKey?: string }>();
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" });
  }
  const apiKey = typeof body.apiKey === "string" ? body.apiKey : "";
  try {
    await upsertUserAiCredential(userId, provider, apiKey, db);
  } catch (err) {
    if (err instanceof Error && err.message === "API key is required") {
      throw new HTTPException(400, { message: err.message });
    }
    throw err;
  }
  return c.json({ ok: true, provider });
});

/** DELETE — remove a stored credential. */
app.delete("/:provider", authRequired, rateLimit(), async (c) => {
  const userId = c.get("userId");
  const db = c.get("db");
  const provider = parseProvider(c.req.param("provider"));
  const removed = await deleteUserAiCredential(userId, provider, db);
  return c.json({ ok: true, provider, removed });
});

export default app;
