/**
 * HTML サニタイズ（危険なタグ・属性を除去）。
 * Sanitizes HTML by removing dangerous tags and attributes.
 */

/**
 * 危険な要素・属性を除去した HTML を返す。
 * Returns HTML with dangerous elements and attributes removed.
 */
export function sanitizeHtml(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;

  const unwantedSelectors = [
    "script",
    "style",
    "iframe",
    "noscript",
    "object",
    "embed",
    "form",
    "input",
    "button",
    "select",
    "textarea",
    "[onclick]",
    "[onerror]",
    "[onload]",
  ];

  unwantedSelectors.forEach((selector) => {
    const elements = div.querySelectorAll(selector);
    elements.forEach((el) => el.remove());
  });

  const DANGEROUS_SCHEMES = /^(javascript:|data:|vbscript:)/i;
  const URL_ATTRS = ["href", "src", "xlink:href", "formaction", "poster", "cite", "srcset"];

  /** スキーム判定用に ASCII 制御文字・空白を除去して正規化。Bypass 防止（e.g. java\\nscript:）。 */
  function normalizedScheme(value: string): string {
    let s = "";
    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i);
      if (code > 0x20 && code !== 0x7f) s += value[i];
    }
    return s.trim().toLowerCase();
  }

  const allElements = div.querySelectorAll("*");
  allElements.forEach((el) => {
    const attributesToRemove: string[] = [];
    for (const attr of el.attributes) {
      const name = attr.name.toLowerCase();
      const value = attr.value ?? "";
      if (name.startsWith("on") || name === "style") {
        attributesToRemove.push(attr.name);
      } else if (URL_ATTRS.includes(name) && DANGEROUS_SCHEMES.test(normalizedScheme(value))) {
        attributesToRemove.push(attr.name);
      }
    }
    for (const name of attributesToRemove) {
      el.removeAttribute(name);
    }
  });

  return div.innerHTML;
}
