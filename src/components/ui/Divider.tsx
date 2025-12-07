import { JSX, ParentComponent, splitProps, Show } from "solid-js";

export type DividerOrientation = "horizontal" | "vertical";
export type DividerVariant = "solid" | "dashed" | "dotted";

export interface DividerProps extends JSX.HTMLAttributes<HTMLDivElement> {
  /** Orientation of the divider */
  orientation?: DividerOrientation;
  /** Line style variant */
  variant?: DividerVariant;
  /** Label text to display in the middle */
  label?: string;
  /** Label position */
  labelPosition?: "start" | "center" | "end";
  /** Custom color */
  color?: "default" | "primary" | "secondary";
}

const variantClasses: Record<DividerVariant, string> = {
  solid: "border-solid",
  dashed: "border-dashed",
  dotted: "border-dotted",
};

const colorClasses: Record<string, string> = {
  default: "border-[var(--border-subtle)]",
  primary: "border-primary-300 dark:border-primary-700",
  secondary: "border-neutral-300 dark:border-neutral-600",
};

const labelPositionClasses: Record<string, string> = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
};

export const Divider: ParentComponent<DividerProps> = (props) => {
  const [local, others] = splitProps(props, [
    "orientation",
    "variant",
    "label",
    "labelPosition",
    "color",
    "class",
    "children",
  ]);

  const orientation = local.orientation || "horizontal";
  const variant = local.variant || "solid";
  const color = local.color || "default";
  const labelPosition = local.labelPosition || "center";

  // Horizontal with label
  if (orientation === "horizontal" && (local.label || local.children)) {
    return (
      <div
        class={`flex items-center gap-4 ${labelPositionClasses[labelPosition]} ${local.class || ""}`}
        role="separator"
        aria-orientation="horizontal"
        {...others}
      >
        <Show when={labelPosition !== "start"}>
          <div class={`flex-1 border-t ${variantClasses[variant]} ${colorClasses[color]}`} />
        </Show>
        <span class="text-sm text-[var(--text-tertiary)] px-2 shrink-0">
          {local.label || local.children}
        </span>
        <Show when={labelPosition !== "end"}>
          <div class={`flex-1 border-t ${variantClasses[variant]} ${colorClasses[color]}`} />
        </Show>
      </div>
    );
  }

  // Simple horizontal divider
  if (orientation === "horizontal") {
    return (
      <hr
        class={`border-t ${variantClasses[variant]} ${colorClasses[color]} ${local.class || ""}`}
        role="separator"
        aria-orientation="horizontal"
        {...(others as JSX.HTMLAttributes<HTMLHRElement>)}
      />
    );
  }

  // Vertical divider
  return (
    <div
      class={`inline-block h-full min-h-[1em] border-l ${variantClasses[variant]} ${colorClasses[color]} ${local.class || ""}`}
      role="separator"
      aria-orientation="vertical"
      {...others}
    />
  );
};
