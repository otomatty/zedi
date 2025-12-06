import { Checkbox as KobalteCheckbox } from "@kobalte/core/checkbox";
import { splitProps, Show, createMemo } from "solid-js";

export interface CheckboxProps {
  /** Checkbox size */
  size?: "sm" | "md" | "lg";
  /** Checkbox color */
  color?: "primary" | "secondary" | "success" | "warning" | "danger";
  /** Label text */
  label?: string;
  /** Description text */
  description?: string;
  /** Whether the checkbox is checked */
  isSelected?: boolean;
  /** Default checked state */
  defaultIsSelected?: boolean;
  /** Change handler */
  onCheckedChange?: (checked: boolean) => void;
  /** Whether the checkbox is disabled */
  isDisabled?: boolean;
  /** Whether the checkbox is in indeterminate state */
  isIndeterminate?: boolean;
  /** Whether the checkbox is required */
  isRequired?: boolean;
  /** Additional class name */
  class?: string;
  /** Checkbox name for forms */
  name?: string;
  /** Checkbox value for forms */
  value?: string;
}

export function Checkbox(props: CheckboxProps) {
  const [local, others] = splitProps(props, [
    "size",
    "color",
    "label",
    "description",
    "isSelected",
    "defaultIsSelected",
    "onCheckedChange",
    "isDisabled",
    "isIndeterminate",
    "isRequired",
    "class",
    "name",
    "value",
  ]);

  const size = () => local.size || "md";
  const color = () => local.color || "primary";

  const sizeClasses = createMemo(() => {
    switch (size()) {
      case "sm":
        return {
          control: "w-4 h-4",
          icon: "w-2.5 h-2.5",
          label: "text-sm",
          description: "text-xs",
        };
      case "md":
        return {
          control: "w-5 h-5",
          icon: "w-3 h-3",
          label: "text-base",
          description: "text-sm",
        };
      case "lg":
        return {
          control: "w-6 h-6",
          icon: "w-4 h-4",
          label: "text-lg",
          description: "text-base",
        };
      default:
        return {
          control: "w-5 h-5",
          icon: "w-3 h-3",
          label: "text-base",
          description: "text-sm",
        };
    }
  });

  const colorClasses = createMemo(() => {
    const colors: Record<string, string> = {
      primary: "data-[checked]:bg-primary-500 data-[checked]:border-primary-500",
      secondary: "data-[checked]:bg-neutral-600 data-[checked]:border-neutral-600",
      success: "data-[checked]:bg-success-500 data-[checked]:border-success-500",
      warning: "data-[checked]:bg-warning-500 data-[checked]:border-warning-500",
      danger: "data-[checked]:bg-error-500 data-[checked]:border-error-500",
    };
    return colors[color()] || colors.primary;
  });

  return (
    <KobalteCheckbox
      class={`flex items-start gap-3 group ${local.class || ""}`}
      checked={local.isSelected}
      defaultChecked={local.defaultIsSelected}
      onChange={local.onCheckedChange}
      disabled={local.isDisabled}
      indeterminate={local.isIndeterminate}
      required={local.isRequired}
      name={local.name}
      value={local.value}
      {...others}
    >
      <KobalteCheckbox.Input class="sr-only" />
      <KobalteCheckbox.Control
        class={`
          ${sizeClasses().control}
          ${colorClasses()}
          flex items-center justify-center
          rounded-md border-2 border-neutral-300 dark:border-neutral-600
          bg-transparent
          transition-all duration-200
          group-hover:border-neutral-400 dark:group-hover:border-neutral-500
          data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed
          focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:ring-offset-2
        `}
      >
        <KobalteCheckbox.Indicator class="text-white">
          <Show
            when={!local.isIndeterminate}
            fallback={
              <svg
                class={sizeClasses().icon}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="3"
                stroke-linecap="round"
              >
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            }
          >
            <svg
              class={sizeClasses().icon}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </Show>
        </KobalteCheckbox.Indicator>
      </KobalteCheckbox.Control>

      <Show when={local.label || local.description}>
        <div class="flex flex-col gap-0.5">
          <Show when={local.label}>
            <KobalteCheckbox.Label
              class={`
                ${sizeClasses().label}
                font-medium text-[var(--text-primary)]
                cursor-pointer
                data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed
              `}
            >
              {local.label}
              <Show when={local.isRequired}>
                <span class="text-error-500 ml-0.5">*</span>
              </Show>
            </KobalteCheckbox.Label>
          </Show>
          <Show when={local.description}>
            <KobalteCheckbox.Description
              class={`${sizeClasses().description} text-[var(--text-secondary)]`}
            >
              {local.description}
            </KobalteCheckbox.Description>
          </Show>
        </div>
      </Show>
    </KobalteCheckbox>
  );
}
