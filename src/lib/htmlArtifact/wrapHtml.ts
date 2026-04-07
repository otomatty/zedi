/**
 * Claude アーティファクト HTML フラグメントを完全な HTML ドキュメントに変換する。
 * sandboxed iframe の srcdoc として使用される。
 *
 * Wraps a Claude artifact HTML fragment into a full HTML document
 * for use as the srcdoc of a sandboxed iframe.
 */

import {
  LIGHT_THEME_VARS,
  DARK_THEME_VARS,
  SVG_DIAGRAM_STYLES,
  buildCssVarBlock,
} from "./defaultTheme";

/**
 * HTML フラグメントを完全なドキュメントにラップする。
 * Claude テーマ CSS 変数のデフォルト値と iframe 高さ自動調整スクリプトを注入する。
 *
 * Wraps an HTML fragment into a complete document.
 * Injects Claude theme CSS variable defaults and an iframe height auto-resize script.
 *
 * @param fragmentHtml - 生の HTML フラグメント / Raw HTML fragment
 * @returns 完全な HTML ドキュメント文字列 / Full HTML document string
 */
export function wrapArtifactHtml(fragmentHtml: string): string {
  const lightVars = buildCssVarBlock(LIGHT_THEME_VARS);
  const darkVars = buildCssVarBlock(DARK_THEME_VARS);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    :root {
${lightVars}
    }
    @media (prefers-color-scheme: dark) {
      :root {
${darkVars}
      }
    }
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 16px;
      font-family: var(--font-sans);
      color: var(--color-text-primary);
      background: var(--color-bg-primary);
    }
${SVG_DIAGRAM_STYLES}
  </style>
</head>
<body>
  ${fragmentHtml}
  <script>
    new ResizeObserver(function() {
      parent.postMessage(
        { type: 'zedi-artifact-resize', height: document.body.scrollHeight },
        '*'
      );
    }).observe(document.body);
  </script>
</body>
</html>`;
}
