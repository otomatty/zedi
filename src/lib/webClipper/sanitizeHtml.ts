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

  const allElements = div.querySelectorAll("*");
  allElements.forEach((el) => {
    const attributesToRemove: string[] = [];
    for (const attr of el.attributes) {
      if (attr.name.startsWith("on") || attr.name === "style") {
        attributesToRemove.push(attr.name);
      }
    }
    attributesToRemove.forEach((attr) => el.removeAttribute(attr));
  });

  return div.innerHTML;
}
