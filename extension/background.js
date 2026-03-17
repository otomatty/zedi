/**
 * Zedi Web Clipper - Background service worker
 * Phase 2: When token exists, call clip-and-create. Otherwise open Zedi with clipUrl.
 */
importScripts("config.worker.js");

const STORAGE_KEY = "zedi_ext_token";

function getApiBase() {
  return (
    (typeof self !== "undefined" && self.ZEDI_EXT_CONFIG?.API_BASE_URL) || "https://zedi-note.app"
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

function clearStoredToken() {
  chrome.storage.local.remove(STORAGE_KEY);
}

async function clipAndCreate(url) {
  const token = await getStoredToken();
  if (!token) return false;
  const base = getApiBase();
  try {
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
      return false;
    }
    return res.ok;
  } catch {
    return false;
  }
}

function openZediWithClipUrl(url) {
  const params = new URLSearchParams({ clipUrl: url, from: "chrome-extension" });
  chrome.tabs.create({ url: `${getApiBase()}/home?${params.toString()}` });
}

async function savePage(url) {
  const ok = await clipAndCreate(url);
  if (!ok) {
    openZediWithClipUrl(url);
  }
}

chrome.contextMenus.create({
  id: "zedi-save-page",
  title: "このページをZediに保存",
  contexts: ["page"],
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "zedi-save-page" || !tab?.url) return;
  if (!isUrlClipAllowed(tab.url)) return;
  await savePage(tab.url);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "save-page") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !isUrlClipAllowed(tab.url)) return;
  await savePage(tab.url);
});
