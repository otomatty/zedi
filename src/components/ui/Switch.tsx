import { Switch as KobalteSwitch } from "@kobalte/core/switch";
import { type JSX, splitProps, Show, createMemo } from "solid-js";

export interface SwitchProps {
  /** Switch size */
  size?: "sm" | "md" | "lg";
  /** Switch color */
  color?: "primary" | "secondary" | "success" | "warning" | "danger";
  /** Label text */
  label?: string;
  /** Description text */
  description?: string;
  /** Whether the switch is on */
  isSelected?: boolean;
  /** Default on state */
  defaultIsSelected?: boolean;
  /** Change handler */
  onCheckedChange?: (checked: boolean) => void;
  /** Whether the switch is disabled */
  isDisabled?: boolean;
  /** Whether the switch is required */
  isRequired?: boolean;
  /** Content to show in thumb when off */
  startContent?: JSX.Element;
  /** Content to show in thumb when on */
  endContent?: JSX.Element;
  /** Icon in thumb */
  thumbIcon?: JSX.Element;
  /** Additional class name */
  class?: string;
  /** Switch name for forms */
  name?: string;
}

export function Switch(props: SwitchProps) {
  const [local, others] = splitProps(props, [
    "size",
    "color",
    "label",
    "description",
    "isSelected",
    "defaultIsSelected",
    "onCheckedChange",
    "isDisabled",
    "isRequired",
    "startContent",
    "endContent",
    "thumbIcon",
    "class",
    "name",
  ]);

  const size = () => local.size || "md";
  const color = () => local.color || "primary";

  const sizeClasses = createMemo(() => {
    switch (size()) {
      case "sm":
        return {
          track: "w-8 h-5",
          thumb: "w-3.5 h-3.5",
          thumbTranslate: "data-[checked]:translate-x-3.5",
          label: "text-sm",
          description: "text-xs",
          iconSize: "w-2 h-2",
        };
      case "md":
        return {
          track: "w-11 h-6",
          thumb: "w-4.5 h-4.5",
          thumbTranslate: "data-[checked]:translate-x-5",
          label: "text-base",
          description: "text-sm",
          iconSize: "w-2.5 h-2.5",
        };
      case "lg":
        return {
          track: "w-14 h-8",
          thumb: "w-6 h-6",
          thumbTranslate: "data-[checked]:translate-x-6",
          label: "text-lg",
          description: "text-base",
          iconSize: "w-3.5 h-3.5",
        };
      default:
        return {
          track: "w-11 h-6",
          thumb: "w-4.5 h-4.5",
          thumbTranslate: "data-[checked]:translate-x-5",
          label: "text-base",
          description: "text-sm",
          iconSize: "w-2.5 h-2.5",
        };
    }
  });

  const colorClasses = createMemo(() => {
    const colors: Record<string, string> = {
      primary: "data-[checked]:bg-primary-500",
      secondary: "data-[checked]:bg-neutral-600",
      success: "data-[checked]:bg-success-500",
      warning: "data-[checked]:bg-warning-500",
      danger: "data-[checked]:bg-error-500",
    };
    return colors[color()] || colors.primary;
  });

  return (
    <KobalteSwitch
      class={`flex items-center gap-3 group ${local.class || ""}`}
      checked={local.isSelected}
      defaultChecked={local.defaultIsSelected}
      onChange={local.onCheckedChange}
      disabled={local.isDisabled}
      required={local.isRequired}
      name={local.name}
      {...others}
    >
      <KobalteSwitch.Input class="sr-only" />
      <KobalteSwitch.Control
        class={`
          ${sizeClasses().track}
          ${colorClasses()}
          relative inline-flex items-center
          rounded-full
          bg-neutral-200 dark:bg-neutral-700
          transition-colors duration-200
          data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed
          cursor-pointer
        `}
      >
        {/* Track content icons */}
        <Show when={local.startContent}>
          <span class={`absolute left-1 ${sizeClasses().iconSize} text-neutral-500`}>
            {local.startContent}
          </span>
        </Show>
        <Show when={local.endContent}>
          <span class={`absolute right-1 ${sizeClasses().iconSize} text-white`}>
            {local.endContent}
          </span>
        </Show>

        <KobalteSwitch.Thumb
          class={`
            ${sizeClasses().thumb}
            ${sizeClasses().thumbTranslate}
            flex items-center justify-center
            bg-white
            rounded-full
            shadow-md
            translate-x-0.5
            transition-transform duration-200 ease-out
          `}
        >
          <Show when={local.thumbIcon}>
            <span class={`${sizeClasses().iconSize} text-neutral-500`}>
              {local.thumbIcon}
            </span>
          </Show>
        </KobalteSwitch.Thumb>
      </KobalteSwitch.Control>

      <Show when={local.label || local.description}>
        <div class="flex flex-col gap-0.5">
          <Show when={local.label}>
            <KobalteSwitch.Label
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
            </KobalteSwitch.Label>
          </Show>
          <Show when={local.description}>
            <KobalteSwitch.Description
              class={`${sizeClasses().description} text-[var(--text-secondary)]`}
            >
              {local.description}
            </KobalteSwitch.Description>
          </Show>
        </div>
      </Show>
    </KobalteSwitch>
  );
}
