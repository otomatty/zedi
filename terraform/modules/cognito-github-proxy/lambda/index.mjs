/**
 * Cognito GitHub OAuth Proxy
 * Serves OIDC discovery, token exchange, and userinfo so Cognito can use GitHub as OIDC IdP.
 * GitHub does not expose /.well-known/openid-configuration; this proxy provides it and forwards
 * token/user requests to GitHub.
 */

const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USER_URL = "https://api.github.com/user";
const GITHUB_USER_EMAILS_URL = "https://api.github.com/user/emails";

function json(body, status = 200) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function getBaseUrl(requestContext) {
  const host = requestContext?.domainName ?? "";
  return `https://${host}`;
}

export async function handler(event) {
  const method = event.requestContext?.http?.method ?? event.httpMethod ?? "GET";
  const path = event.rawPath ?? event.path ?? "";
  const baseUrl = getBaseUrl(event.requestContext);

  // GET /.well-known/openid-configuration
  if (method === "GET" && (path === "/.well-known/openid-configuration" || path.endsWith(".well-known/openid-configuration"))) {
    return json({
      issuer: baseUrl,
      authorization_endpoint: "https://github.com/login/oauth/authorize",
      token_endpoint: `${baseUrl}/token`,
      userinfo_endpoint: `${baseUrl}/user`,
      jwks_uri: `${baseUrl}/.well-known/jwks.json`,
      scopes_supported: ["user:email", "read:user"],
      response_types_supported: ["code"],
    });
  }

  // GET /.well-known/jwks.json (Cognito may request; GitHub OAuth does not use JWTs for user endpoint)
  if (method === "GET" && (path === "/.well-known/jwks.json" || path.endsWith(".well-known/jwks.json"))) {
    return json({ keys: [] });
  }

  // POST /token - exchange code for access_token
  if (method === "POST" && (path === "/token" || path.endsWith("/token"))) {
    let bodyRaw = event.body ?? "";
    if (event.isBase64Encoded && bodyRaw) {
      try {
        bodyRaw = Buffer.from(bodyRaw, "base64").toString("utf8");
      } catch {
        bodyRaw = "";
      }
    }
    const bodyStr = typeof bodyRaw === "string" ? bodyRaw : "";
    const params = new URLSearchParams(bodyStr);
    const code = params.get("code");
    // Prefer env so proxy works even if Cognito does not forward client_id/client_secret in body
    const client_id = params.get("client_id") || process.env.GITHUB_CLIENT_ID || "";
    const client_secret = params.get("client_secret") || process.env.GITHUB_CLIENT_SECRET || "";
    const redirect_uri = params.get("redirect_uri");

    if (!code) {
      return json({ error: "invalid_request", error_description: "missing code" }, 400);
    }
    if (!client_id || !client_secret) {
      return json({
        error: "invalid_request",
        error_description: "GitHub proxy missing client_id or client_secret (set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in Lambda env)",
      }, 400);
    }

    const res = await fetch(GITHUB_TOKEN_URL, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id,
        client_secret,
        code,
        redirect_uri: redirect_uri || "",
      }).toString(),
    });

    const data = await res.json().catch(() => ({}));
    if (data.error) {
      return json({ error: data.error, error_description: data.error_description || "token exchange failed" }, 400);
    }
    return json(data);
  }

  // GET /user - userinfo with Bearer token; add sub for Cognito username
  if (method === "GET" && (path === "/user" || path.endsWith("/user"))) {
    const auth = event.headers?.authorization || event.headers?.Authorization || "";
    const token = auth.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return json({ error: "unauthorized", error_description: "missing Authorization header" }, 401);
    }

    const res = await fetch(GITHUB_USER_URL, {
      method: "GET",
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      return json({ error: "invalid_token", error_description: "GitHub API error" }, 401);
    }

    const user = await res.json();
    let email = user.email || null;
    if (!email) {
      const emailsRes = await fetch(GITHUB_USER_EMAILS_URL, {
        method: "GET",
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/json",
        },
      });
      if (emailsRes.ok) {
        const emails = await emailsRes.json().catch(() => []);
        const primary = emails.find((e) => e.primary && e.verified);
        const verified = emails.find((e) => e.verified);
        email = (primary || verified || emails[0])?.email ?? null;
      }
    }
    return json({
      sub: String(user.id),
      id: user.id,
      login: user.login,
      name: user.name,
      email,
      avatar_url: user.avatar_url,
    });
  }

  return json({ error: "not_found" }, 404);
}
