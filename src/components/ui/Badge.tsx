import { type JSX, splitProps, createMemo } from "solid-js";

export interface BadgeProps {
  /** Badge variant style */
  variant?: "solid" | "flat" | "faded" | "shadow";
  /** Badge size */
  size?: "sm" | "md" | "lg";
  /** Badge color */
  color?: "default" | "primary" | "secondary" | "success" | "warning" | "danger";
  /** Additional class name */
  class?: string;
  /** Badge content */
  children: JSX.Element;
}

export function Badge(props: BadgeProps) {
  const [local, others] = splitProps(props, [
    "variant",
    "size",
    "color",
    "class",
    "children",
  ]);

  const variant = () => local.variant || "solid";
  const size = () => local.size || "md";
  const color = () => local.color || "default";

  const sizeClasses = createMemo(() => {
    switch (size()) {
      case "sm":
        return "px-2 py-0.5 text-xs";
      case "md":
        return "px-2.5 py-1 text-sm";
      case "lg":
        return "px-3 py-1.5 text-base";
      default:
        return "px-2.5 py-1 text-sm";
    }
  });

  const colorClasses = createMemo(() => {
    const colorMap: Record<string, Record<string, string>> = {
      default: {
        solid: "bg-neutral-500 text-white",
        flat: "bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300",
        faded: "bg-neutral-100/50 dark:bg-neutral-800/50 text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700",
        shadow: "bg-neutral-500 text-white shadow-lg shadow-neutral-500/30",
      },
      primary: {
        solid: "bg-primary-500 text-white",
        flat: "bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300",
        faded: "bg-primary-100/50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-800",
        shadow: "bg-primary-500 text-white shadow-lg shadow-primary-500/30",
      },
      secondary: {
        solid: "bg-neutral-600 text-white",
        flat: "bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200",
        faded: "bg-neutral-200/50 dark:bg-neutral-700/50 text-neutral-600 dark:text-neutral-300 border border-neutral-300 dark:border-neutral-600",
        shadow: "bg-neutral-600 text-white shadow-lg shadow-neutral-600/30",
      },
      success: {
        solid: "bg-success-500 text-white",
        flat: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
        faded: "bg-green-100/50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800",
        shadow: "bg-success-500 text-white shadow-lg shadow-green-500/30",
      },
      warning: {
        solid: "bg-warning-500 text-white",
        flat: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
        faded: "bg-amber-100/50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800",
        shadow: "bg-warning-500 text-white shadow-lg shadow-amber-500/30",
      },
      danger: {
        solid: "bg-error-500 text-white",
        flat: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300",
        faded: "bg-red-100/50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800",
        shadow: "bg-error-500 text-white shadow-lg shadow-red-500/30",
      },
    };

    return colorMap[color()]?.[variant()] || colorMap.default.solid;
  });

  return (
    <span
      class={`
        inline-flex items-center justify-center
        font-medium
        rounded-full
        whitespace-nowrap
        ${sizeClasses()}
        ${colorClasses()}
        ${local.class || ""}
      `}
      {...others}
    >
      {local.children}
    </span>
  );
}
