import { type JSX, splitProps, createMemo, Show, children as resolveChildren } from "solid-js";

export interface SkeletonProps {
  /** Skeleton variant */
  variant?: "text" | "circular" | "rectangular";
  /** Width (CSS value) */
  width?: string;
  /** Height (CSS value) */
  height?: string;
  /** Whether content is loaded (hides skeleton when true) */
  isLoaded?: boolean;
  /** Additional class name */
  class?: string;
  /** Children to show when loaded */
  children?: JSX.Element;
}

export function Skeleton(props: SkeletonProps) {
  const [local, others] = splitProps(props, [
    "variant",
    "width",
    "height",
    "isLoaded",
    "class",
    "children",
  ]);

  const variant = () => local.variant || "text";

  const variantClasses = createMemo(() => {
    switch (variant()) {
      case "text":
        return "h-4 rounded-md";
      case "circular":
        return "rounded-full aspect-square";
      case "rectangular":
        return "rounded-xl";
      default:
        return "rounded-md";
    }
  });

  const resolved = resolveChildren(() => local.children);

  return (
    <Show when={!local.isLoaded} fallback={resolved()}>
      <div
        class={`
          ${variantClasses()}
          bg-neutral-200 dark:bg-neutral-700
          animate-pulse
          ${local.class || ""}
        `}
        style={{
          width: local.width,
          height: local.height,
        }}
        {...others}
      />
    </Show>
  );
}

// Convenience wrapper for loading content
export interface SkeletonTextProps {
  /** Number of lines */
  lines?: number;
  /** Additional class name */
  class?: string;
}

export function SkeletonText(props: SkeletonTextProps) {
  const lines = () => props.lines || 3;

  return (
    <div class={`flex flex-col gap-2 ${props.class || ""}`}>
      {Array.from({ length: lines() }).map((_, i) => (
        <Skeleton
          variant="text"
          width={i === lines() - 1 ? "60%" : "100%"}
        />
      ))}
    </div>
  );
}
