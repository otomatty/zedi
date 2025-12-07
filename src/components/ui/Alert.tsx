import { JSX, ParentComponent, splitProps, Show, createSignal } from "solid-js";

export type AlertVariant = "flat" | "bordered" | "solid";
export type AlertColor = "default" | "primary" | "success" | "warning" | "danger";
export type AlertRadius = "none" | "sm" | "md" | "lg" | "full";

export interface AlertProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Visual variant */
  variant?: AlertVariant;
  /** Color scheme */
  color?: AlertColor;
  /** Border radius */
  radius?: AlertRadius;
  /** Alert title */
  title?: string;
  /** Icon to display */
  icon?: JSX.Element;
  /** Show close button */
  isClosable?: boolean;
  /** Callback when closed */
  onClose?: () => void;
  /** Hide initially */
  isVisible?: boolean;
}

const colorStyles: Record<AlertColor, { flat: string; bordered: string; solid: string; icon: string }> = {
  default: {
    flat: "bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200",
    bordered: "border-2 border-neutral-200 text-neutral-800 dark:border-neutral-700 dark:text-neutral-200",
    solid: "bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900",
    icon: "text-neutral-500",
  },
  primary: {
    flat: "bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-200",
    bordered: "border-2 border-primary-300 text-primary-800 dark:border-primary-700 dark:text-primary-200",
    solid: "bg-primary-500 text-white",
    icon: "text-primary-500",
  },
  success: {
    flat: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200",
    bordered: "border-2 border-green-300 text-green-800 dark:border-green-700 dark:text-green-200",
    solid: "bg-green-500 text-white",
    icon: "text-green-500",
  },
  warning: {
    flat: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200",
    bordered: "border-2 border-yellow-300 text-yellow-800 dark:border-yellow-700 dark:text-yellow-200",
    solid: "bg-yellow-500 text-white",
    icon: "text-yellow-500",
  },
  danger: {
    flat: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200",
    bordered: "border-2 border-red-300 text-red-800 dark:border-red-700 dark:text-red-200",
    solid: "bg-red-500 text-white",
    icon: "text-red-500",
  },
};

const radiusClasses: Record<AlertRadius, string> = {
  none: "rounded-none",
  sm: "rounded-md",
  md: "rounded-lg",
  lg: "rounded-xl",
  full: "rounded-2xl",
};

// Default icons for each color
const defaultIcons: Record<AlertColor, string> = {
  default: "ℹ️",
  primary: "💡",
  success: "✅",
  warning: "⚠️",
  danger: "❌",
};

export const Alert: ParentComponent<AlertProps> = (props) => {
  const [local, others] = splitProps(props, [
    "variant",
    "color",
    "radius",
    "title",
    "icon",
    "isClosable",
    "onClose",
    "isVisible",
    "class",
    "children",
  ]);

  const [visible, setVisible] = createSignal(local.isVisible !== false);

  const variant = local.variant || "flat";
  const color = local.color || "default";
  const radius = local.radius || "lg";

  const handleClose = () => {
    setVisible(false);
    local.onClose?.();
  };

  return (
    <Show when={visible()}>
      <div
        class={`
          flex items-start gap-3 p-4
          ${colorStyles[color][variant]}
          ${radiusClasses[radius]}
          transition-all duration-200
          ${local.class || ""}
        `}
        role="alert"
        {...others}
      >
        {/* Icon */}
        <Show when={local.icon !== null}>
          <span class={`shrink-0 text-lg ${variant !== "solid" ? colorStyles[color].icon : ""}`}>
            {local.icon || defaultIcons[color]}
          </span>
        </Show>

        {/* Content */}
        <div class="flex-1 min-w-0">
          <Show when={local.title}>
            <p class="font-semibold mb-1">{local.title}</p>
          </Show>
          <div class="text-sm opacity-90">{local.children}</div>
        </div>

        {/* Close button */}
        <Show when={local.isClosable}>
          <button
            type="button"
            onClick={handleClose}
            class="shrink-0 p-1 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
            aria-label="Close alert"
          >
            <svg
              class="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </Show>
      </div>
    </Show>
  );
};
