/**
 * Claude アーティファクト HTML で使用される CSS 変数のデフォルト値。
 * Claude のテーマシステムと互換性を保つために定義する。
 *
 * Default CSS variable values used in Claude artifact HTML.
 * Defined to maintain compatibility with Claude's theme system.
 */

/** ライトモード用の CSS 変数 / Light mode CSS variables */
export const LIGHT_THEME_VARS: Record<string, string> = {
  "--color-text-primary": "#1a1a1a",
  "--color-text-secondary": "#6b7280",
  "--color-text-tertiary": "#9ca3af",
  "--color-bg-primary": "#ffffff",
  "--color-bg-secondary": "#f9fafb",
  "--color-bg-tertiary": "#f3f4f6",
  "--color-border-primary": "#d1d5db",
  "--color-border-secondary": "#e5e7eb",
  "--color-border-tertiary": "#e5e7eb",
  "--color-accent": "#2563eb",
  "--border-radius-sm": "4px",
  "--border-radius-md": "8px",
  "--border-radius-lg": "12px",
  "--font-mono": "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
  "--font-sans": "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
};

/** ダークモード用の CSS 変数 / Dark mode CSS variables */
export const DARK_THEME_VARS: Record<string, string> = {
  "--color-text-primary": "#f3f4f6",
  "--color-text-secondary": "#9ca3af",
  "--color-text-tertiary": "#6b7280",
  "--color-bg-primary": "#111827",
  "--color-bg-secondary": "#1f2937",
  "--color-bg-tertiary": "#374151",
  "--color-border-primary": "#4b5563",
  "--color-border-secondary": "#374151",
  "--color-border-tertiary": "#374151",
  "--color-accent": "#3b82f6",
};

/**
 * CSS 変数マップを :root セレクタ用の CSS 文字列に変換する。
 * Converts a CSS variable map to a CSS string for the :root selector.
 */
export function buildCssVarBlock(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join("\n");
}

/**
 * Claude SVG ダイアグラムで使用されるクラス定義。
 * Class definitions used in Claude SVG diagrams.
 */
export const SVG_DIAGRAM_STYLES = `
/* Claude SVG diagram class definitions */
.c-blue rect { fill: #dbeafe; stroke: #3b82f6; }
.c-blue text { fill: #1e40af; }
.c-coral rect { fill: #fee2e2; stroke: #ef4444; }
.c-coral text { fill: #991b1b; }
.c-teal rect { fill: #ccfbf1; stroke: #14b8a6; }
.c-teal text { fill: #065f46; }
.c-purple rect { fill: #ede9fe; stroke: #8b5cf6; }
.c-purple text { fill: #5b21b6; }
.c-amber rect { fill: #fef3c7; stroke: #f59e0b; }
.c-amber text { fill: #92400e; }
.c-green rect { fill: #dcfce7; stroke: #22c55e; }
.c-green text { fill: #166534; }
text.th { font-size: 14px; font-weight: 600; }
text.ts { font-size: 11px; fill: var(--color-text-secondary); }
`;
