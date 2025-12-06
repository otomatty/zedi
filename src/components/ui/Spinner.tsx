import { splitProps, createMemo } from "solid-js";

export interface SpinnerProps {
  /** Spinner size */
  size?: "sm" | "md" | "lg";
  /** Spinner color */
  color?: "current" | "primary" | "secondary" | "success" | "warning" | "danger" | "white";
  /** Label for screen readers */
  label?: string;
  /** Additional class name */
  class?: string;
}

export function Spinner(props: SpinnerProps) {
  const [local, others] = splitProps(props, [
    "size",
    "color",
    "label",
    "class",
  ]);

  const size = () => local.size || "md";
  const color = () => local.color || "current";

  const sizeClasses = createMemo(() => {
    switch (size()) {
      case "sm":
        return "w-4 h-4";
      case "md":
        return "w-6 h-6";
      case "lg":
        return "w-8 h-8";
      default:
        return "w-6 h-6";
    }
  });

  const colorClasses = createMemo(() => {
    const colors: Record<string, string> = {
      current: "text-current",
      primary: "text-primary-500",
      secondary: "text-neutral-500",
      success: "text-success-500",
      warning: "text-warning-500",
      danger: "text-error-500",
      white: "text-white",
    };
    return colors[color()] || colors.current;
  });

  return (
    <div
      role="status"
      aria-label={local.label || "Loading"}
      class={`inline-flex ${local.class || ""}`}
      {...others}
    >
      <svg
        class={`${sizeClasses()} ${colorClasses()} animate-spin`}
        viewBox="0 0 24 24"
        fill="none"
      >
        <circle
          class="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          stroke-width="4"
        />
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      <span class="sr-only">{local.label || "Loading"}</span>
    </div>
  );
}
