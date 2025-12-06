import { Select as KobalteSelect } from "@kobalte/core/select";
import { splitProps, Show, createMemo } from "solid-js";

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface SelectProps {
  /** Select variant style */
  variant?: "flat" | "bordered" | "underlined";
  /** Select size */
  size?: "sm" | "md" | "lg";
  /** Label text */
  label?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Description text below select */
  description?: string;
  /** Error message (shown when isInvalid is true) */
  errorMessage?: string;
  /** Whether the select is in invalid state */
  isInvalid?: boolean;
  /** Whether the select is disabled */
  isDisabled?: boolean;
  /** Whether the select is required */
  isRequired?: boolean;
  /** Options array */
  options: SelectOption[];
  /** Selected value */
  value?: string;
  /** Default selected value */
  defaultValue?: string;
  /** Change handler */
  onValueChange?: (value: string) => void;
  /** Additional class name */
  class?: string;
  /** Select name for forms */
  name?: string;
}

export function Select(props: SelectProps) {
  const [local, others] = splitProps(props, [
    "variant",
    "size",
    "label",
    "placeholder",
    "description",
    "errorMessage",
    "isInvalid",
    "isDisabled",
    "isRequired",
    "options",
    "value",
    "defaultValue",
    "onValueChange",
    "class",
    "name",
  ]);

  const variant = () => local.variant || "flat";
  const size = () => local.size || "md";

  const sizeClasses = createMemo(() => {
    switch (size()) {
      case "sm":
        return {
          trigger: "min-h-8 text-sm px-2.5 py-1.5",
          label: "text-xs",
          item: "text-sm px-2 py-1.5",
        };
      case "md":
        return {
          trigger: "min-h-10 text-base px-3 py-2",
          label: "text-sm",
          item: "text-base px-3 py-2",
        };
      case "lg":
        return {
          trigger: "min-h-12 text-lg px-4 py-2.5",
          label: "text-base",
          item: "text-lg px-4 py-2.5",
        };
      default:
        return {
          trigger: "min-h-10 text-base px-3 py-2",
          label: "text-sm",
          item: "text-base px-3 py-2",
        };
    }
  });

  const variantClasses = createMemo(() => {
    const base =
      "w-full rounded-xl transition-all duration-200 outline-none bg-transparent flex items-center justify-between gap-2";
    const focusRing =
      "focus:ring-2 focus:ring-primary-500/50 focus:ring-offset-0";

    switch (variant()) {
      case "flat":
        return `${base} bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 border-2 border-transparent focus:border-primary-500 data-[expanded]:border-primary-500 ${focusRing}`;
      case "bordered":
        return `${base} border-2 border-neutral-300 dark:border-neutral-600 hover:border-neutral-400 dark:hover:border-neutral-500 focus:border-primary-500 data-[expanded]:border-primary-500 ${focusRing}`;
      case "underlined":
        return `${base} rounded-none border-b-2 border-neutral-300 dark:border-neutral-600 hover:border-neutral-400 dark:hover:border-neutral-500 focus:border-primary-500 data-[expanded]:border-primary-500 px-0`;
      default:
        return base;
    }
  });

  const invalidClasses = () =>
    local.isInvalid
      ? "border-error-500 focus:border-error-500 focus:ring-error-500/50"
      : "";

  return (
    <KobalteSelect
      class={`flex flex-col gap-1.5 ${local.class || ""}`}
      options={local.options}
      optionValue="value"
      optionTextValue="label"
      optionDisabled="disabled"
      validationState={local.isInvalid ? "invalid" : "valid"}
      disabled={local.isDisabled}
      required={local.isRequired}
      value={local.options.find((o) => o.value === local.value)}
      defaultValue={local.options.find((o) => o.value === local.defaultValue)}
      onChange={(option) => local.onValueChange?.(option?.value ?? "")}
      name={local.name}
      placeholder={local.placeholder}
      itemComponent={(itemProps) => (
        <KobalteSelect.Item
          item={itemProps.item}
          class={`
            ${sizeClasses().item}
            flex items-center justify-between gap-2
            rounded-lg cursor-pointer
            text-[var(--text-primary)]
            hover:bg-neutral-100 dark:hover:bg-neutral-800
            focus:bg-neutral-100 dark:focus:bg-neutral-800
            data-[highlighted]:bg-primary-100 dark:data-[highlighted]:bg-primary-900/30
            data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed
            outline-none transition-colors duration-150
          `}
        >
          <div class="flex flex-col gap-0.5">
            <KobalteSelect.ItemLabel>{itemProps.item.rawValue.label}</KobalteSelect.ItemLabel>
            <Show when={itemProps.item.rawValue.description}>
              <span class="text-xs text-[var(--text-secondary)]">
                {itemProps.item.rawValue.description}
              </span>
            </Show>
          </div>
          <KobalteSelect.ItemIndicator class="text-primary-500">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </KobalteSelect.ItemIndicator>
        </KobalteSelect.Item>
      )}
      {...others}
    >
      <Show when={local.label}>
        <KobalteSelect.Label
          class={`font-medium text-[var(--text-primary)] ${sizeClasses().label}`}
        >
          {local.label}
          <Show when={local.isRequired}>
            <span class="text-error-500 ml-0.5">*</span>
          </Show>
        </KobalteSelect.Label>
      </Show>

      <KobalteSelect.Trigger
        class={`
          ${variantClasses()}
          ${sizeClasses().trigger}
          ${invalidClasses()}
          text-[var(--text-primary)]
          disabled:opacity-50 disabled:cursor-not-allowed
          cursor-pointer
        `}
      >
        <KobalteSelect.Value<SelectOption>>
          {(state) => state.selectedOption()?.label || local.placeholder}
        </KobalteSelect.Value>
        <KobalteSelect.Icon class="text-[var(--text-tertiary)]">
          <svg
            class="w-4 h-4 transition-transform duration-200 data-[expanded]:rotate-180"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </KobalteSelect.Icon>
      </KobalteSelect.Trigger>

      <Show when={local.description && !local.isInvalid}>
        <KobalteSelect.Description class="text-sm text-[var(--text-secondary)]">
          {local.description}
        </KobalteSelect.Description>
      </Show>

      <Show when={local.errorMessage && local.isInvalid}>
        <KobalteSelect.ErrorMessage class="text-sm text-error-500">
          {local.errorMessage}
        </KobalteSelect.ErrorMessage>
      </Show>

      <KobalteSelect.Portal>
        <KobalteSelect.Content
          class="
            bg-[var(--bg-card)]
            border border-[var(--border-default)]
            rounded-xl
            shadow-lg
            py-1
            z-50
            origin-top
            animate-[scale-in_0.15s_ease-out]
            overflow-hidden
          "
        >
          <KobalteSelect.Listbox class="max-h-64 overflow-y-auto p-1" />
        </KobalteSelect.Content>
      </KobalteSelect.Portal>
    </KobalteSelect>
  );
}
