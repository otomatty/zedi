/**
 * Zedi Web Clipper - Popup script / Zedi Web Clipper - ポップアップスクリプト
 * Phase 2: OAuth + PKCE auth, POST /api/ext/clip-and-create for one-click save.
 * フェーズ2: OAuth + PKCE 認証と、POST /api/ext/clip-and-create によるワンクリック保存。
 */
(function () {
  const STORAGE_KEY = "zedi_ext_token";

  function getApiBase() {
    return (
      (typeof window !== "undefined" && window.ZEDI_EXT_CONFIG?.API_BASE_URL) ||
      "https://zedi-note.app"
    );
  }

  function isUrlClipAllowed(url) {
    if (!url || typeof url !== "string") return false;
    const trimmed = url.trim();
    if (!trimmed) return false;
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
      let host = parsed.hostname.toLowerCase();
      if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
      if (host === "localhost" || host === "127.0.0.1" || host === "::1") return false;
      if (host === "0.0.0.0" || host === "::") return false;
      if (host.endsWith(".localhost") || host.endsWith(".local")) return false;
      if (/^10\.|^192\.168\./.test(host)) return false;
      if (/^172\.(1[6-9]|2\d|3[01])(\.|$)/.test(host)) return false;
      if (/^169\.254\./.test(host)) return false;
      if (/^fe[89ab][0-9a-f]:/i.test(host)) return false; // fe80::/10 link-local
      if (/^::ffff:/i.test(host)) return false;
      if (host.includes(":") && /^f[cd]/i.test(host)) return false; // IPv6 ULA fc00::/7
      if (/^127\./.test(host)) return false;
      if (/^(chrome|about|file)$/i.test(host)) return false;
      return true;
    } catch {
      return false;
    }
  }

  async function getStoredToken() {
    const r = await chrome.storage.local.get(STORAGE_KEY);
    const entry = r[STORAGE_KEY];
    if (!entry?.access_token) return null;
    if (entry.expires_at && Date.now() >= entry.expires_at) return null;
    return entry.access_token;
  }

  async function setStoredToken(accessToken, expiresIn) {
    const expiresAt = expiresIn ? Date.now() + expiresIn * 1000 : null;
    await chrome.storage.local.set({
      [STORAGE_KEY]: { access_token: accessToken, expires_at: expiresAt },
    });
  }

  async function clearStoredToken() {
    await chrome.storage.local.remove(STORAGE_KEY);
  }

  function genRandomBase64Url(byteLength) {
    const arr = new Uint8Array(byteLength);
    crypto.getRandomValues(arr);
    return btoa(String.fromCharCode(...arr))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  async function sha256Base64url(str) {
    const enc = new TextEncoder();
    const hash = await crypto.subtle.digest("SHA-256", enc.encode(str));
    const b64 = btoa(String.fromCharCode(...new Uint8Array(hash)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    return b64;
  }

  async function launchOAuth() {
    const codeVerifier = genRandomBase64Url(32);
    const codeChallenge = await sha256Base64url(codeVerifier);
    const state = genRandomBase64Url(16);
    const redirectUri = chrome.identity.getRedirectURL();
    const base = getApiBase();
    const params = new URLSearchParams({
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      state,
    });
    const authUrl = `${base}/auth/extension?${params.toString()}`;

    return new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(
        { url: authUrl, interactive: true },
        async (redirectUrl) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!redirectUrl) {
            reject(new Error("No redirect URL"));
            return;
          }
          try {
            const u = new URL(redirectUrl);
            const returnedState = u.searchParams.get("state");
            if (returnedState !== state) {
              reject(new Error("Invalid state: OAuth response state mismatch"));
              return;
            }
            const code = u.searchParams.get("code");
            if (!code) {
              reject(new Error("No code in redirect"));
              return;
            }
            const res = await fetch(`${base}/api/ext/session`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                grant_type: "authorization_code",
                code,
                code_verifier: codeVerifier,
                redirect_uri: redirectUri,
              }),
            });
            if (!res.ok) {
              const j = await res.json().catch(() => ({}));
              throw new Error(j.message || `Session failed: ${res.status}`);
            }
            const data = await res.json();
            await setStoredToken(data.access_token, data.expires_in);
            resolve(data.access_token);
          } catch (e) {
            reject(e);
          }
        },
      );
    });
  }

  function makeError(code, message) {
    return Object.assign(new Error(message), { code });
  }

  function toUserMessage(err, fallback) {
    switch (err?.code) {
      case "SESSION_EXPIRED":
        return "セッションの有効期限が切れました。再接続してください。";
      case "NOT_AUTHENTICATED":
        return "接続が必要です。";
      default:
        return fallback;
    }
  }

  async function clipAndCreate(url) {
    const token = await getStoredToken();
    if (!token) throw makeError("NOT_AUTHENTICATED", "Not authenticated");
    const base = getApiBase();
    const res = await fetch(`${base}/api/ext/clip-and-create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ url }),
    });
    if (res.status === 401) {
      await clearStoredToken();
      throw makeError("SESSION_EXPIRED", "Session expired");
    }
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.message || `Save failed: ${res.status}`);
    }
    return res.json();
  }

  function openZediWithClipUrl(url) {
    const params = new URLSearchParams({ clipUrl: url, from: "chrome-extension" });
    chrome.tabs.create({ url: `${getApiBase()}/home?${params.toString()}` });
    window.close();
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const urlEl = document.getElementById("url");
    const saveBtn = document.getElementById("saveBtn");
    const connectBtn = document.getElementById("connectBtn");
    const statusEl = document.getElementById("status");
    const errorEl = document.getElementById("error");

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = tab?.url ?? "";

    urlEl.textContent = url || "URL を取得できません";

    const hasValidUrl = url && isUrlClipAllowed(url);

    const token = await getStoredToken();
    const isConnected = !!token;

    if (isConnected) {
      if (connectBtn) connectBtn.style.display = "none";
      saveBtn.style.display = "";
      saveBtn.textContent = "Zediに保存";
      saveBtn.disabled = !hasValidUrl;
      if (!hasValidUrl && url) {
        errorEl.textContent = "このページは取り込みできません";
      }
      saveBtn.addEventListener("click", async () => {
        if (!hasValidUrl) return;
        saveBtn.disabled = true;
        errorEl.textContent = "";
        statusEl.textContent = "保存中…";
        try {
          const result = await clipAndCreate(url);
          statusEl.textContent = `保存しました: ${result.title || "ページ"}`;
          statusEl.classList.remove("error");
          setTimeout(() => window.close(), 800);
        } catch (e) {
          statusEl.textContent = "";
          errorEl.textContent = toUserMessage(e, "保存に失敗しました");
          if (e?.code === "SESSION_EXPIRED") {
            connectBtn.style.display = "block";
            saveBtn.style.display = "none";
          } else {
            saveBtn.disabled = false;
          }
        }
      });
    } else {
      saveBtn.style.display = "none";
      if (connectBtn) connectBtn.style.display = "";
      if (statusEl) statusEl.textContent = "ワンクリック保存するには接続してください";
      connectBtn.addEventListener("click", async () => {
        connectBtn.disabled = true;
        errorEl.textContent = "";
        statusEl.textContent = "接続中…";
        try {
          await launchOAuth();
          window.location.reload();
        } catch (e) {
          statusEl.textContent = "";
          errorEl.textContent = toUserMessage(e, "接続に失敗しました");
          connectBtn.disabled = false;
        }
      });
    }
  });
})();
