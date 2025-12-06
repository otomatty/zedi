import { splitProps, createMemo, Show } from "solid-js";

export interface AvatarProps {
  /** Image source URL */
  src?: string;
  /** Alt text for image */
  alt?: string;
  /** Name for fallback initials */
  name?: string;
  /** Avatar size */
  size?: "sm" | "md" | "lg";
  /** Border radius */
  radius?: "none" | "sm" | "md" | "lg" | "full";
  /** Whether to show border */
  isBordered?: boolean;
  /** Border/accent color */
  color?: "default" | "primary" | "secondary" | "success" | "warning" | "danger";
  /** Additional class name */
  class?: string;
}

export function Avatar(props: AvatarProps) {
  const [local, others] = splitProps(props, [
    "src",
    "alt",
    "name",
    "size",
    "radius",
    "isBordered",
    "color",
    "class",
  ]);

  const size = () => local.size || "md";
  const radius = () => local.radius || "full";
  const color = () => local.color || "default";

  const sizeClasses = createMemo(() => {
    switch (size()) {
      case "sm":
        return { container: "w-8 h-8", text: "text-xs" };
      case "md":
        return { container: "w-10 h-10", text: "text-sm" };
      case "lg":
        return { container: "w-14 h-14", text: "text-lg" };
      default:
        return { container: "w-10 h-10", text: "text-sm" };
    }
  });

  const radiusClasses = createMemo(() => {
    switch (radius()) {
      case "none":
        return "rounded-none";
      case "sm":
        return "rounded-sm";
      case "md":
        return "rounded-md";
      case "lg":
        return "rounded-xl";
      case "full":
        return "rounded-full";
      default:
        return "rounded-full";
    }
  });

  const colorClasses = createMemo(() => {
    if (!local.isBordered) return "";
    
    const colors: Record<string, string> = {
      default: "ring-2 ring-neutral-300 dark:ring-neutral-600",
      primary: "ring-2 ring-primary-500",
      secondary: "ring-2 ring-neutral-500",
      success: "ring-2 ring-success-500",
      warning: "ring-2 ring-warning-500",
      danger: "ring-2 ring-error-500",
    };
    return colors[color()] || colors.default;
  });

  const getInitials = (name: string) => {
    const words = name.trim().split(/\s+/);
    if (words.length === 1) {
      return words[0].slice(0, 2).toUpperCase();
    }
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  };

  const fallbackBgColor = createMemo(() => {
    // Generate consistent color based on name
    if (!local.name) return "bg-neutral-200 dark:bg-neutral-700";
    
    const colors = [
      "bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300",
      "bg-accent-100 dark:bg-accent-900/30 text-accent-700 dark:text-accent-300",
      "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
      "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
      "bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300",
      "bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300",
    ];
    
    let hash = 0;
    for (let i = 0; i < local.name.length; i++) {
      hash = local.name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  });

  return (
    <div
      class={`
        ${sizeClasses().container}
        ${radiusClasses()}
        ${colorClasses()}
        inline-flex items-center justify-center
        overflow-hidden
        flex-shrink-0
        ${local.class || ""}
      `}
      {...others}
    >
      <Show
        when={local.src}
        fallback={
          <span
            class={`
              w-full h-full
              flex items-center justify-center
              font-semibold
              ${sizeClasses().text}
              ${fallbackBgColor()}
            `}
          >
            {local.name ? getInitials(local.name) : (
              <svg class="w-1/2 h-1/2 text-neutral-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              </svg>
            )}
          </span>
        }
      >
        <img
          src={local.src}
          alt={local.alt || local.name || "Avatar"}
          class="w-full h-full object-cover"
        />
      </Show>
    </div>
  );
}
