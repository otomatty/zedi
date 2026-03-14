/**
 * Zedi Web Clipper - Popup script
 * Phase 2: OAuth + PKCE auth, POST /api/ext/clip-and-create for one-click save.
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
      const host = parsed.hostname.toLowerCase();
      if (host === "localhost" || host === "127.0.0.1") return false;
      if (/^10\.|^172\.(1[6-9]|2[0-9]|3[01])\.|^192\.168\./.test(host)) return false;
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

  function setStoredToken(accessToken, expiresIn) {
    const expiresAt = expiresIn ? Date.now() + expiresIn * 1000 : null;
    chrome.storage.local.set({
      [STORAGE_KEY]: { access_token: accessToken, expires_at: expiresAt },
    });
  }

  function clearStoredToken() {
    chrome.storage.local.remove(STORAGE_KEY);
  }

  function genRandom(len) {
    const arr = new Uint8Array(len);
    crypto.getRandomValues(arr);
    return Array.from(arr, (b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, len);
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
    const codeVerifier = genRandom(43);
    const codeChallenge = await sha256Base64url(codeVerifier);
    const state = genRandom(16);
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
            setStoredToken(data.access_token, data.expires_in);
            resolve(data.access_token);
          } catch (e) {
            reject(e);
          }
        },
      );
    });
  }

  async function clipAndCreate(url) {
    const token = await getStoredToken();
    if (!token) throw new Error("Not authenticated");
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
      clearStoredToken();
      throw new Error("Session expired");
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
          errorEl.textContent = e.message || "保存に失敗しました";
          if (e.message === "Session expired") {
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
          errorEl.textContent = e.message || "接続に失敗しました";
          connectBtn.disabled = false;
        }
      });
    }
  });
})();
