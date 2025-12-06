import { JSX, ParentComponent, splitProps } from "solid-js";

// ============================================
// Typography - Heading
// ============================================

export type HeadingLevel = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
export type HeadingSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl";

export interface HeadingProps extends JSX.HTMLAttributes<HTMLHeadingElement> {
  /** The heading level (h1-h6) */
  as?: HeadingLevel;
  /** Visual size override */
  size?: HeadingSize;
  /** Color variant */
  color?: "default" | "primary" | "secondary" | "success" | "warning" | "danger";
  /** Gradient text effect */
  isGradient?: boolean;
}

const headingSizeClasses: Record<HeadingSize, string> = {
  xs: "text-xs font-semibold",
  sm: "text-sm font-semibold",
  md: "text-base font-semibold",
  lg: "text-lg font-semibold",
  xl: "text-xl font-bold",
  "2xl": "text-2xl font-bold",
  "3xl": "text-3xl font-bold",
  "4xl": "text-4xl font-bold",
};

const defaultSizeByLevel: Record<HeadingLevel, HeadingSize> = {
  h1: "4xl",
  h2: "3xl",
  h3: "2xl",
  h4: "xl",
  h5: "lg",
  h6: "md",
};

const headingColorClasses: Record<string, string> = {
  default: "text-[var(--text-primary)]",
  primary: "text-primary-500",
  secondary: "text-neutral-500",
  success: "text-success-500",
  warning: "text-warning-500",
  danger: "text-error-500",
};

export const Heading: ParentComponent<HeadingProps> = (props) => {
  const [local, others] = splitProps(props, [
    "as",
    "size",
    "color",
    "isGradient",
    "class",
    "children",
  ]);

  const Tag = local.as || "h2";
  const size = local.size || defaultSizeByLevel[Tag];
  const color = local.color || "default";

  const gradientClass = local.isGradient
    ? "bg-gradient-to-r from-primary-400 to-accent-500 bg-clip-text text-transparent"
    : "";

  return (
    <Tag
      class={`${headingSizeClasses[size]} ${!local.isGradient ? headingColorClasses[color] : ""} ${gradientClass} leading-tight tracking-tight ${local.class || ""}`}
      {...others}
    >
      {local.children}
    </Tag>
  );
};

// ============================================
// Typography - Text
// ============================================

export type TextSize = "xs" | "sm" | "md" | "lg";
export type TextWeight = "normal" | "medium" | "semibold" | "bold";

export interface TextProps extends JSX.HTMLAttributes<HTMLParagraphElement> {
  /** Text size */
  size?: TextSize;
  /** Font weight */
  weight?: TextWeight;
  /** Color variant */
  color?: "default" | "secondary" | "tertiary" | "primary" | "success" | "warning" | "danger";
  /** Render as span instead of p */
  as?: "p" | "span" | "div" | "label";
  /** Truncate text with ellipsis */
  isTruncated?: boolean;
}

const textSizeClasses: Record<TextSize, string> = {
  xs: "text-xs",
  sm: "text-sm",
  md: "text-base",
  lg: "text-lg",
};

const textWeightClasses: Record<TextWeight, string> = {
  normal: "font-normal",
  medium: "font-medium",
  semibold: "font-semibold",
  bold: "font-bold",
};

const textColorClasses: Record<string, string> = {
  default: "text-[var(--text-primary)]",
  secondary: "text-[var(--text-secondary)]",
  tertiary: "text-[var(--text-tertiary)]",
  primary: "text-primary-500",
  success: "text-success-500",
  warning: "text-warning-500",
  danger: "text-error-500",
};

export const Text: ParentComponent<TextProps> = (props) => {
  const [local, others] = splitProps(props, [
    "size",
    "weight",
    "color",
    "as",
    "isTruncated",
    "class",
    "children",
  ]);

  const Tag = local.as || "p";
  const size = local.size || "md";
  const weight = local.weight || "normal";
  const color = local.color || "default";

  const truncateClass = local.isTruncated ? "truncate" : "";

  return (
    <Tag
      class={`${textSizeClasses[size]} ${textWeightClasses[weight]} ${textColorClasses[color]} ${truncateClass} leading-relaxed ${local.class || ""}`}
      {...others}
    >
      {local.children}
    </Tag>
  );
};

// ============================================
// Typography - Code
// ============================================

export interface CodeProps extends JSX.HTMLAttributes<HTMLElement> {
  /** Inline or block display */
  variant?: "inline" | "block";
  /** Color/style variant */
  color?: "default" | "primary" | "success" | "warning" | "danger";
}

const codeColorClasses: Record<string, string> = {
  default: "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200",
  primary: "bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300",
  success: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  warning: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  danger: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

export const Code: ParentComponent<CodeProps> = (props) => {
  const [local, others] = splitProps(props, [
    "variant",
    "color",
    "class",
    "children",
  ]);

  const variant = local.variant || "inline";
  const color = local.color || "default";

  if (variant === "block") {
    return (
      <pre
        class={`${codeColorClasses[color]} font-mono text-sm p-4 rounded-xl overflow-x-auto ${local.class || ""}`}
        {...others}
      >
        <code>{local.children}</code>
      </pre>
    );
  }

  return (
    <code
      class={`${codeColorClasses[color]} font-mono text-sm px-1.5 py-0.5 rounded-md ${local.class || ""}`}
      {...others}
    >
      {local.children}
    </code>
  );
};
