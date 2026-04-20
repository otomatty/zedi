/**
 * クリップボードへテキストをコピーする共通ユーティリティ。
 * Shared utility for copying text to the clipboard.
 *
 * モダンブラウザの `navigator.clipboard.writeText` を優先し、失敗したときや
 * 非セキュアコンテキスト (HTTP / 埋め込み) では `document.execCommand("copy")`
 * を用いた `textarea` フォールバックに切り替える。
 *
 * Prefers the modern `navigator.clipboard.writeText` API and falls back to a
 * `textarea` + `document.execCommand("copy")` approach when the clipboard API
 * is unavailable (e.g. insecure contexts, older browsers, some in-app webviews).
 *
 * @returns コピーに成功したら `true`、失敗したら `false`。
 *          `true` when the text was copied, `false` otherwise.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to execCommand path.
  }
  if (typeof document === "undefined") return false;
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "absolute";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
