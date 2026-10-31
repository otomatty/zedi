import { Hono, type Context } from "hono";
import { html } from "hono/html";
import { sha256Base64Url, signToken, verifyToken } from "./signedToken";

/**
 * Settings for the test IdP. It only ever mints identities for `emailDomain` and asks for
 * `password` on its sign-in form.
 * テスト用 IdP の設定。`emailDomain` のアドレスしか発行せず、サインイン画面で `password` を求める。
 */
export interface TestIdpOptions {
  /** HMAC key for authorization codes and access tokens. */
  secret: string;
  /** Required on the sign-in form. */
  password: string;
  /** Only `<local>@<emailDomain>` addresses can sign in. */
  emailDomain: string;
  /** The single client allowed to use this IdP. */
  clientId: string;
  now?: () => number;
}

/** The app's Better Auth callback path for this provider. */
export const CALLBACK_PATH = "/api/auth/callback/test-idp";

const CODE_TTL_MS = 60_000;
const ACCESS_TOKEN_TTL_S = 300;

interface AuthorizeRequest {
  redirectUri: string;
  state: string;
  codeChallenge: string;
}

/**
 * Validates the authorization request. The redirect must go back to the app's callback on the
 * same origin the request arrived on (the app proxies `/test-idp/authorize`), so a code can only
 * be sent to the app that asked for it.
 * 認可リクエストを検証する。戻り先は、リクエストが届いたのと同じオリジンのコールバックに限る。
 */
function readAuthorizeRequest(c: Context, clientId: string): AuthorizeRequest | null {
  const q = (name: string) => c.req.query(name) ?? "";
  if (q("response_type") !== "code" || q("client_id") !== clientId) return null;
  if (q("state") === "" || q("code_challenge") === "" || q("code_challenge_method") !== "S256") {
    return null;
  }
  let redirect: URL;
  try {
    redirect = new URL(q("redirect_uri"));
  } catch {
    return null;
  }
  const requestOrigin = new URL(c.req.url).origin;
  if (redirect.origin !== requestOrigin || redirect.pathname !== CALLBACK_PATH || redirect.search) {
    return null;
  }
  return { redirectUri: redirect.href, state: q("state"), codeChallenge: q("code_challenge") };
}

function signInPage(c: Context, error: string | null, status: 200 | 401) {
  const action = `${new URL(c.req.url).pathname}?${new URL(c.req.url).searchParams.toString()}`;
  return c.html(
    html`<!doctype html>
      <html lang="ja">
        <head>
          <meta charset="utf-8" />
          <meta name="robots" content="noindex" />
          <title>テスト用 IdP</title>
        </head>
        <body>
          <main>
            <h1>テスト用 IdP</h1>
            <p>開発・試験専用のサインインです。本番では使えません。</p>
            ${error ? html`<p role="alert">${error}</p>` : ""}
            <form method="post" action="${action}">
              <label>
                メールアドレス
                <input name="email" type="email" required data-testid="test-idp-email" />
              </label>
              <label>
                パスワード
                <input name="password" type="password" required data-testid="test-idp-password" />
              </label>
              <button type="submit" data-testid="test-idp-submit">サインイン</button>
            </form>
          </main>
        </body>
      </html>`,
    status,
  );
}

function unexpired(payload: Record<string, unknown>, now: number): boolean {
  return typeof payload.exp === "number" && payload.exp > now;
}

/**
 * A minimal OAuth 2.0 provider that stands in for Google in local runs, tests, Previews and
 * staging. It is never deployed to production.
 * ローカル・試験・Preview・staging で Google の代わりをする最小の OAuth プロバイダー。本番には置かない。
 */
export function createTestIdp(options: TestIdpOptions) {
  const now = options.now ?? Date.now;
  const app = new Hono();
  const emailPattern = new RegExp(
    `^[a-z0-9._+-]+@${options.emailDomain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
  );

  app.get("/test-idp/authorize", (c) => {
    if (!readAuthorizeRequest(c, options.clientId)) return c.text("invalid authorize request", 400);
    return signInPage(c, null, 200);
  });

  app.post("/test-idp/authorize", async (c) => {
    const request = readAuthorizeRequest(c, options.clientId);
    if (!request) return c.text("invalid authorize request", 400);
    const form = await c.req.parseBody();
    const email = typeof form.email === "string" ? form.email.trim().toLowerCase() : "";
    if (form.password !== options.password || !emailPattern.test(email)) {
      return signInPage(
        c,
        `${options.emailDomain} のアドレスと正しいパスワードを入力してください。`,
        401,
      );
    }
    const code = await signToken(options.secret, {
      typ: "code",
      email,
      cid: options.clientId,
      ru: request.redirectUri,
      cc: request.codeChallenge,
      exp: now() + CODE_TTL_MS,
    });
    const target = new URL(request.redirectUri);
    target.searchParams.set("code", code);
    target.searchParams.set("state", request.state);
    return c.redirect(target.href, 302);
  });

  app.post("/test-idp/token", async (c) => {
    const form = await c.req.parseBody();
    const field = (name: string) => (typeof form[name] === "string" ? (form[name] as string) : "");
    if (field("grant_type") !== "authorization_code") {
      return c.json({ error: "unsupported_grant_type" }, 400);
    }
    if (field("client_id") !== options.clientId) return c.json({ error: "invalid_client" }, 400);
    const code = await verifyToken(options.secret, field("code"));
    if (
      !code ||
      code.typ !== "code" ||
      !unexpired(code, now()) ||
      code.cid !== options.clientId ||
      code.ru !== field("redirect_uri") ||
      code.cc !== (await sha256Base64Url(field("code_verifier")))
    ) {
      return c.json({ error: "invalid_grant" }, 400);
    }
    const accessToken = await signToken(options.secret, {
      typ: "access",
      email: code.email,
      exp: now() + ACCESS_TOKEN_TTL_S * 1000,
    });
    return c.json({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_S,
    });
  });

  app.get("/test-idp/userinfo", async (c) => {
    const header = c.req.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
    const payload = token ? await verifyToken(options.secret, token) : null;
    if (!payload || payload.typ !== "access" || !unexpired(payload, now())) {
      return c.json({ error: "invalid_token" }, 401);
    }
    const email = String(payload.email);
    return c.json({
      sub: email,
      email,
      email_verified: true,
      name: email.slice(0, email.indexOf("@")),
    });
  });

  return app;
}
