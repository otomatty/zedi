/**
 * GitHub App 認証ヘルパー（Epic #616 Phase 2 / Sub-issue #805）。
 *
 * - GitHub App の private key で App JWT (RS256) を発行し、
 *   `POST /app/installations/{id}/access_tokens` で installation access token を取得する。
 * - 取得した token は短命（既定 1 時間）なのでメモリにキャッシュし、
 *   有効期限 60 秒前に切れる前に再取得する。
 * - `triggerRepositoryDispatch` は `repository_dispatch` を fire-and-forget で発火する。
 * - `verifyInstallationToken` は届いた installation token を GitHub API 越しに検証し、
 *   それが当アプリのインストール (`GITHUB_APP_INSTALLATION_ID`) のものかを確認する。
 *
 * GitHub App authentication helpers (Epic #616 Phase 2 / sub-issue #805).
 *
 * - Mints an App JWT (RS256) from the configured private key, then exchanges
 *   it for an installation access token via
 *   `POST /app/installations/{id}/access_tokens`.
 * - Caches the resulting installation token in memory and refreshes 60 s
 *   before expiry to avoid stampede on every dispatch.
 * - `triggerRepositoryDispatch` fires a `repository_dispatch` event without
 *   awaiting the response on the user-visible path (errors are logged).
 * - `verifyInstallationToken` validates inbound installation tokens by calling
 *   GitHub and confirms the token's `installation.id` matches our configured
 *   `GITHUB_APP_INSTALLATION_ID`.
 *
 * @see https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app
 * @see https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event
 * @see https://github.com/otomatty/zedi/issues/616
 * @see https://github.com/otomatty/zedi/issues/805
 */
import { SignJWT, importPKCS8 } from "jose";

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const GITHUB_ACCEPT = "application/vnd.github+json";
const USER_AGENT = "zedi-api-github-app";

/**
 * App JWT の有効期間（秒）。GitHub の上限は 10 分なので余裕を見て 9 分に設定する。
 * Lifetime of an App JWT in seconds. GitHub caps at 10 minutes; we use 9 to
 * tolerate small clock skew between this server and GitHub.
 */
const APP_JWT_TTL_SEC = 9 * 60;

/**
 * Installation token の早期更新マージン（ms）。期限直前のリクエストで 401 を
 * 食らわないよう、この秒数だけ手前で再取得する。
 *
 * Refresh window (ms) before an installation token's actual `expires_at`. We
 * rotate this much earlier to avoid racing GitHub's expiry boundary on a
 * dispatch call that lands right at the cliff.
 */
const REFRESH_MARGIN_MS = 60_000;

interface CachedInstallationToken {
  token: string;
  /** ms epoch — token expiry as reported by GitHub. */
  expiresAt: number;
}

let cachedInstallationToken: CachedInstallationToken | null = null;

/**
 * 環境変数から GitHub App の設定を読み出す。各値が欠けていれば throw する。
 * Read GitHub App configuration from environment. Throws when any value is
 * missing — callers must catch and log so a misconfiguration surfaces early
 * rather than as a silent fire-and-forget failure.
 */
function readAppConfig(): {
  appId: string;
  privateKey: string;
  installationId: string;
} {
  const appId = process.env.GITHUB_APP_ID?.trim();
  const installationId = process.env.GITHUB_APP_INSTALLATION_ID?.trim();
  const rawKey = process.env.GITHUB_APP_PRIVATE_KEY;

  if (!appId) throw new Error("GITHUB_APP_ID is not configured");
  if (!installationId) throw new Error("GITHUB_APP_INSTALLATION_ID is not configured");
  if (!rawKey) throw new Error("GITHUB_APP_PRIVATE_KEY is not configured");

  // .env では改行を `\n` (リテラル) で表現することが多いので両方を受け付ける。
  // .env files commonly encode the PEM newlines as the literal two-character
  // sequence `\n`; normalize to real newlines so importPKCS8 can parse it.
  const privateKey = rawKey.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;

  return { appId, privateKey, installationId };
}

/**
 * App JWT (RS256) を発行する。`iss` はアプリ ID、`exp` は 9 分後。
 * `iat` は 60 秒前にして GitHub 側との時計ズレを許容する。
 *
 * Mint an App JWT signed with the configured private key (RS256). `iss` is the
 * GitHub App ID, `exp` is 9 minutes ahead, and `iat` is offset 60 s in the
 * past to absorb mild clock drift between this host and GitHub's API.
 */
export async function createAppJWT(): Promise<string> {
  const { appId, privateKey } = readAppConfig();
  const key = await importPKCS8(privateKey, "RS256");
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt(now - 60)
    .setIssuer(appId)
    .setExpirationTime(now + APP_JWT_TTL_SEC)
    .sign(key);
}

/**
 * Installation access token を取得する。キャッシュ済みで有効期限まで余裕があれば
 * それを返し、そうでなければ App JWT を発行して GitHub から取り直す。
 *
 * Fetch a fresh installation access token. Returns the cached value when it is
 * still valid for at least `REFRESH_MARGIN_MS`; otherwise mints a new App JWT
 * and exchanges it via `POST /app/installations/{id}/access_tokens`.
 *
 * @throws when the GitHub API responds non-2xx or returns an unparseable body.
 */
export async function getInstallationToken(): Promise<string> {
  if (
    cachedInstallationToken &&
    cachedInstallationToken.expiresAt - Date.now() > REFRESH_MARGIN_MS
  ) {
    return cachedInstallationToken.token;
  }
  const { installationId } = readAppConfig();
  const jwt = await createAppJWT();
  const res = await fetch(
    `${GITHUB_API_BASE}/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: GITHUB_ACCEPT,
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
        "User-Agent": USER_AGENT,
      },
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub installation token request failed: ${res.status} ${body}`);
  }
  const json = (await res.json()) as { token?: unknown; expires_at?: unknown };
  const token = typeof json.token === "string" ? json.token : null;
  const expiresAtIso = typeof json.expires_at === "string" ? json.expires_at : null;
  if (!token || !expiresAtIso) {
    throw new Error("GitHub installation token response missing token/expires_at");
  }
  const expiresAt = Date.parse(expiresAtIso);
  if (!Number.isFinite(expiresAt)) {
    throw new Error(`GitHub installation token returned unparseable expires_at: ${expiresAtIso}`);
  }
  cachedInstallationToken = { token, expiresAt };
  return token;
}

/**
 * テスト用: キャッシュ済み installation token をクリアする。
 * Test helper: drop the cached installation token so the next call re-fetches.
 */
export function __resetInstallationTokenCacheForTests(): void {
  cachedInstallationToken = null;
}

/**
 * dispatch 先のリポジトリを `owner/repo` 形式で読み取る。未設定なら null。
 *
 * Read the dispatch target repository in `owner/repo` form. Returns `null` when
 * `GITHUB_DISPATCH_REPOSITORY` is not configured, signaling the caller to skip
 * the dispatch (Phase 2 keeps the wiring optional so the API stays functional
 * before the GitHub Actions workflow exists).
 */
export function readDispatchRepository(): { owner: string; repo: string } | null {
  const raw = process.env.GITHUB_DISPATCH_REPOSITORY?.trim();
  if (!raw) return null;
  const [owner, repo] = raw.split("/", 2);
  if (!owner || !repo) return null;
  return { owner, repo };
}

/**
 * `repository_dispatch` を発火する。失敗時は throw する（呼び出し側はログのみで握りつぶす）。
 *
 * Fire a `repository_dispatch` event. Throws on non-2xx so the caller can log;
 * the webhook entrypoint is expected to detach this with `.catch(() => log)`
 * so user-visible Sentry webhook responses never block on this call.
 */
export async function triggerRepositoryDispatch(input: {
  eventType: string;
  clientPayload: Record<string, unknown>;
  owner?: string;
  repo?: string;
}): Promise<void> {
  const target =
    input.owner && input.repo ? { owner: input.owner, repo: input.repo } : readDispatchRepository();
  if (!target) {
    throw new Error("GITHUB_DISPATCH_REPOSITORY is not configured");
  }
  const token = await getInstallationToken();
  const res = await fetch(
    `${GITHUB_API_BASE}/repos/${encodeURIComponent(target.owner)}/${encodeURIComponent(target.repo)}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: GITHUB_ACCEPT,
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
        "User-Agent": USER_AGENT,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event_type: input.eventType,
        client_payload: input.clientPayload,
      }),
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub repository_dispatch failed: ${res.status} ${body}`);
  }
}

/**
 * 受信した installation token を GitHub 側で検証する。
 *
 * GitHub の installation token は不透明文字列（`ghs_...`）なのでローカル検証は
 * できない。`GET /installation` を当該 token で呼ぶと、その installation 自身の
 * メタデータ（`id` を含む）が返るので、`id` を `GITHUB_APP_INSTALLATION_ID`
 * と比較して一致した場合のみ有効と判定する。これにより別のインストールから
 * 盗まれた token をなりすましに使われることを防ぐ。タイムアウトは 5 秒に短く
 * 設定し、コールバック側を遅延させない。
 *
 * Validate an inbound installation access token. GitHub installation tokens are
 * opaque (`ghs_...`), so we round-trip to GitHub: hit `GET /installation`,
 * which returns the installation's own metadata (including `id`), and require
 * the returned id to equal our configured `GITHUB_APP_INSTALLATION_ID`. This
 * blocks tokens minted for any *other* installation of the same App from
 * impersonating ours. Times out at 5 s to keep the callback path responsive.
 *
 * @see https://docs.github.com/en/rest/apps/installations#get-an-installation-for-the-authenticated-app
 */
export async function verifyInstallationToken(token: string): Promise<boolean> {
  if (!token) return false;
  const { installationId } = readAppConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(`${GITHUB_API_BASE}/installation`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: GITHUB_ACCEPT,
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
        "User-Agent": USER_AGENT,
      },
      signal: controller.signal,
    });
    if (!res.ok) return false;
    const json = (await res.json().catch(() => null)) as { id?: unknown } | null;
    if (!json) return false;
    // `id` は数値で返るので文字列比較できるよう正規化する。env 側は文字列なので、
    // 両側を文字列に揃えて比較しないと `123 === "123"` が常に false になり、
    // 検証が常に失敗側へフェイルクローズしてしまう。
    // GitHub returns `id` as a number; normalize to string for comparison
    // against the env-string `installationId`. Without this, `123 === "123"`
    // would always be false and verification would silently fail closed.
    const idStr = typeof json.id === "number" || typeof json.id === "string" ? String(json.id) : "";
    return idStr.length > 0 && idStr === installationId;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
