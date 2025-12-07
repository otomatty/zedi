import { JSX, ParentComponent, splitProps, createSignal, createContext, useContext, For, Show } from "solid-js";
import { Portal } from "solid-js/web";

// ============================================
// Toast Types and Context
// ============================================

export type ToastVariant = "flat" | "bordered" | "solid";
export type ToastColor = "default" | "primary" | "success" | "warning" | "danger";
export type ToastPlacement = "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right";

export interface ToastData {
  id: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
  color?: ToastColor;
  duration?: number;
  icon?: JSX.Element;
  isClosable?: boolean;
}

interface ToastContextValue {
  toasts: () => ToastData[];
  addToast: (toast: Omit<ToastData, "id">) => string;
  removeToast: (id: string) => void;
  removeAll: () => void;
}

const ToastContext = createContext<ToastContextValue>();

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

// ============================================
// Toast Provider
// ============================================

export interface ToastProviderProps {
  /** Maximum number of toasts to show */
  maxToasts?: number;
  /** Default duration in ms */
  defaultDuration?: number;
  /** Placement of toast container */
  placement?: ToastPlacement;
}

const placementClasses: Record<ToastPlacement, string> = {
  "top-left": "top-4 left-4 items-start",
  "top-center": "top-4 left-1/2 -translate-x-1/2 items-center",
  "top-right": "top-4 right-4 items-end",
  "bottom-left": "bottom-4 left-4 items-start",
  "bottom-center": "bottom-4 left-1/2 -translate-x-1/2 items-center",
  "bottom-right": "bottom-4 right-4 items-end",
};

export const ToastProvider: ParentComponent<ToastProviderProps> = (props) => {
  const [local] = splitProps(props, [
    "maxToasts",
    "defaultDuration",
    "placement",
    "children",
  ]);

  const maxToasts = local.maxToasts ?? 5;
  const defaultDuration = local.defaultDuration ?? 5000;
  const placement = local.placement ?? "bottom-right";

  const [toasts, setToasts] = createSignal<ToastData[]>([]);

  const addToast = (toast: Omit<ToastData, "id">) => {
    const id = crypto.randomUUID();
    const newToast: ToastData = {
      id,
      variant: "flat",
      color: "default",
      duration: defaultDuration,
      isClosable: true,
      ...toast,
    };

    setToasts((prev) => {
      const updated = [...prev, newToast];
      return updated.slice(-maxToasts);
    });

    // Auto remove after duration
    if (newToast.duration && newToast.duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, newToast.duration);
    }

    return id;
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const removeAll = () => {
    setToasts([]);
  };

  const contextValue: ToastContextValue = {
    toasts,
    addToast,
    removeToast,
    removeAll,
  };

  return (
    <ToastContext.Provider value={contextValue}>
      {local.children}
      <Portal>
        <div
          class={`
            fixed z-[9999] flex flex-col gap-2 pointer-events-none
            ${placementClasses[placement]}
          `}
        >
          <For each={toasts()}>
            {(toast) => (
              <ToastItem
                {...toast}
                onClose={() => removeToast(toast.id)}
              />
            )}
          </For>
        </div>
      </Portal>
    </ToastContext.Provider>
  );
};

// ============================================
// Toast Item
// ============================================

interface ToastItemProps extends ToastData {
  onClose: () => void;
}

const colorStyles: Record<ToastColor, { flat: string; bordered: string; solid: string; icon: string }> = {
  default: {
    flat: "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-lg border border-[var(--border-subtle)]",
    bordered: "bg-[var(--bg-card)] border-2 border-neutral-300 text-[var(--text-primary)]",
    solid: "bg-neutral-800 text-white dark:bg-neutral-200 dark:text-neutral-900",
    icon: "text-neutral-500",
  },
  primary: {
    flat: "bg-primary-50 text-primary-900 dark:bg-primary-900/40 dark:text-primary-100 shadow-lg",
    bordered: "bg-[var(--bg-card)] border-2 border-primary-400 text-primary-700 dark:text-primary-300",
    solid: "bg-primary-500 text-white shadow-lg",
    icon: "text-primary-500",
  },
  success: {
    flat: "bg-green-50 text-green-900 dark:bg-green-900/40 dark:text-green-100 shadow-lg",
    bordered: "bg-[var(--bg-card)] border-2 border-green-400 text-green-700 dark:text-green-300",
    solid: "bg-green-500 text-white shadow-lg",
    icon: "text-green-500",
  },
  warning: {
    flat: "bg-yellow-50 text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-100 shadow-lg",
    bordered: "bg-[var(--bg-card)] border-2 border-yellow-400 text-yellow-700 dark:text-yellow-300",
    solid: "bg-yellow-500 text-white shadow-lg",
    icon: "text-yellow-500",
  },
  danger: {
    flat: "bg-red-50 text-red-900 dark:bg-red-900/40 dark:text-red-100 shadow-lg",
    bordered: "bg-[var(--bg-card)] border-2 border-red-400 text-red-700 dark:text-red-300",
    solid: "bg-red-500 text-white shadow-lg",
    icon: "text-red-500",
  },
};

const defaultIcons: Record<ToastColor, string> = {
  default: "ℹ️",
  primary: "💡",
  success: "✅",
  warning: "⚠️",
  danger: "❌",
};

function ToastItem(props: ToastItemProps) {
  const [local] = splitProps(props, [
    "id",
    "title",
    "description",
    "variant",
    "color",
    "icon",
    "isClosable",
    "onClose",
  ]);

  const variant = local.variant || "flat";
  const color = local.color || "default";

  return (
    <div
      class={`
        pointer-events-auto
        flex items-start gap-3 p-4 rounded-xl
        min-w-[300px] max-w-[420px]
        animate-slide-in
        ${colorStyles[color][variant]}
      `}
      role="alert"
    >
      {/* Icon */}
      <span class={`shrink-0 text-lg ${variant !== "solid" ? colorStyles[color].icon : ""}`}>
        {local.icon || defaultIcons[color]}
      </span>

      {/* Content */}
      <div class="flex-1 min-w-0">
        <Show when={local.title}>
          <p class="font-semibold">{local.title}</p>
        </Show>
        <Show when={local.description}>
          <p class="text-sm opacity-90 mt-0.5">{local.description}</p>
        </Show>
      </div>

      {/* Close button */}
      <Show when={local.isClosable}>
        <button
          type="button"
          onClick={local.onClose}
          class="shrink-0 p-1 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          aria-label="Close"
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

      <style>{`
        @keyframes slide-in {
          from {
            opacity: 0;
            transform: translateX(100%);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}

// ============================================
// Standalone Toast Component (for simple use)
// ============================================

export interface ToastProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Visual variant */
  variant?: ToastVariant;
  /** Color scheme */
  color?: ToastColor;
  /** Toast title */
  title?: string;
  /** Toast description */
  description?: string;
  /** Icon to display */
  icon?: JSX.Element;
  /** Show close button */
  isClosable?: boolean;
  /** Callback when closed */
  onClose?: () => void;
}

export const Toast: ParentComponent<ToastProps> = (props) => {
  const [local, others] = splitProps(props, [
    "variant",
    "color",
    "title",
    "description",
    "icon",
    "isClosable",
    "onClose",
    "class",
    "children",
  ]);

  const variant = local.variant || "flat";
  const color = local.color || "default";

  return (
    <div
      class={`
        flex items-start gap-3 p-4 rounded-xl
        ${colorStyles[color][variant]}
        ${local.class || ""}
      `}
      role="alert"
      {...others}
    >
      {/* Icon */}
      <span class={`shrink-0 text-lg ${variant !== "solid" ? colorStyles[color].icon : ""}`}>
        {local.icon || defaultIcons[color]}
      </span>

      {/* Content */}
      <div class="flex-1 min-w-0">
        <Show when={local.title}>
          <p class="font-semibold">{local.title}</p>
        </Show>
        <Show when={local.description}>
          <p class="text-sm opacity-90 mt-0.5">{local.description}</p>
        </Show>
        {local.children}
      </div>

      {/* Close button */}
      <Show when={local.isClosable}>
        <button
          type="button"
          onClick={local.onClose}
          class="shrink-0 p-1 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          aria-label="Close"
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
  );
};
