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

function clearStoredToken() {
  chrome.storage.local.remove(STORAGE_KEY);
}

async function clipAndCreate(url) {
  const token = await getStoredToken();
  if (!token) return false;
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
    return false;
  }
  return res.ok;
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
