import { JSX, splitProps } from "solid-js";

export type ProgressSize = "sm" | "md" | "lg";
export type ProgressColor = "default" | "primary" | "secondary" | "success" | "warning" | "danger";
export type ProgressRadius = "none" | "sm" | "md" | "lg" | "full";

export interface ProgressProps extends Omit<JSX.HTMLAttributes<HTMLDivElement>, "children"> {
  /** Current progress value (0-100) */
  value?: number;
  /** Minimum value */
  minValue?: number;
  /** Maximum value */
  maxValue?: number;
  /** Size variant */
  size?: ProgressSize;
  /** Color scheme */
  color?: ProgressColor;
  /** Border radius */
  radius?: ProgressRadius;
  /** Show value label */
  showValueLabel?: boolean;
  /** Custom label */
  label?: string;
  /** Indeterminate loading state */
  isIndeterminate?: boolean;
  /** Striped animation */
  isStriped?: boolean;
  /** Format value label */
  formatOptions?: Intl.NumberFormatOptions;
}

const sizeClasses: Record<ProgressSize, { track: string; label: string }> = {
  sm: { track: "h-1", label: "text-xs" },
  md: { track: "h-2", label: "text-sm" },
  lg: { track: "h-3", label: "text-base" },
};

const colorClasses: Record<ProgressColor, { indicator: string; track: string }> = {
  default: {
    indicator: "bg-neutral-600 dark:bg-neutral-400",
    track: "bg-neutral-200 dark:bg-neutral-700",
  },
  primary: {
    indicator: "bg-primary-500",
    track: "bg-primary-100 dark:bg-primary-900/30",
  },
  secondary: {
    indicator: "bg-neutral-500",
    track: "bg-neutral-200 dark:bg-neutral-700",
  },
  success: {
    indicator: "bg-green-500",
    track: "bg-green-100 dark:bg-green-900/30",
  },
  warning: {
    indicator: "bg-yellow-500",
    track: "bg-yellow-100 dark:bg-yellow-900/30",
  },
  danger: {
    indicator: "bg-red-500",
    track: "bg-red-100 dark:bg-red-900/30",
  },
};

const radiusClasses: Record<ProgressRadius, string> = {
  none: "rounded-none",
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  full: "rounded-full",
};

export function Progress(props: ProgressProps) {
  const [local, others] = splitProps(props, [
    "value",
    "minValue",
    "maxValue",
    "size",
    "color",
    "radius",
    "showValueLabel",
    "label",
    "isIndeterminate",
    "isStriped",
    "formatOptions",
    "class",
  ]);

  const min = local.minValue ?? 0;
  const max = local.maxValue ?? 100;
  const size = local.size || "md";
  const color = local.color || "primary";
  const radius = local.radius || "full";

  const percentage = () => {
    if (local.isIndeterminate) return 0;
    const val = local.value ?? 0;
    return Math.min(100, Math.max(0, ((val - min) / (max - min)) * 100));
  };

  const formattedValue = () => {
    const formatter = new Intl.NumberFormat(undefined, {
      style: "percent",
      ...local.formatOptions,
    });
    return formatter.format(percentage() / 100);
  };

  const stripedClass = local.isStriped
    ? "bg-stripes"
    : "";

  const indeterminateClass = local.isIndeterminate
    ? "animate-indeterminate"
    : "";

  return (
    <div
      class={`w-full ${local.class || ""}`}
      role="progressbar"
      aria-valuenow={local.isIndeterminate ? undefined : local.value}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-label={local.label}
      {...others}
    >
      {/* Label row */}
      {(local.label || local.showValueLabel) && (
        <div class={`flex justify-between mb-1.5 ${sizeClasses[size].label}`}>
          {local.label && (
            <span class="text-[var(--text-primary)] font-medium">{local.label}</span>
          )}
          {local.showValueLabel && !local.isIndeterminate && (
            <span class="text-[var(--text-secondary)]">{formattedValue()}</span>
          )}
        </div>
      )}

      {/* Track */}
      <div
        class={`
          relative overflow-hidden
          ${sizeClasses[size].track}
          ${colorClasses[color].track}
          ${radiusClasses[radius]}
        `}
      >
        {/* Indicator */}
        <div
          class={`
            absolute inset-y-0 left-0
            ${colorClasses[color].indicator}
            ${radiusClasses[radius]}
            ${stripedClass}
            ${indeterminateClass}
            transition-all duration-300 ease-out
          `}
          style={{
            width: local.isIndeterminate ? "50%" : `${percentage()}%`,
          }}
        />
      </div>

      <style>{`
        @keyframes indeterminate {
          0% { left: -50%; width: 50%; }
          100% { left: 100%; width: 50%; }
        }
        .animate-indeterminate {
          animation: indeterminate 1.5s ease-in-out infinite;
        }
        .bg-stripes {
          background-image: linear-gradient(
            45deg,
            rgba(255,255,255,0.15) 25%,
            transparent 25%,
            transparent 50%,
            rgba(255,255,255,0.15) 50%,
            rgba(255,255,255,0.15) 75%,
            transparent 75%,
            transparent
          );
          background-size: 1rem 1rem;
          animation: stripes 1s linear infinite;
        }
        @keyframes stripes {
          0% { background-position: 0 0; }
          100% { background-position: 1rem 0; }
        }
      `}</style>
    </div>
  );
}
