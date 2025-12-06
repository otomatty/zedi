import { TextField } from "@kobalte/core/text-field";
import { splitProps, Show, createMemo } from "solid-js";

export interface TextareaProps {
  /** Textarea variant style */
  variant?: "flat" | "bordered" | "underlined";
  /** Textarea size */
  size?: "sm" | "md" | "lg";
  /** Label text */
  label?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Description text below textarea */
  description?: string;
  /** Error message (shown when isInvalid is true) */
  errorMessage?: string;
  /** Whether the textarea is in invalid state */
  isInvalid?: boolean;
  /** Whether the textarea is disabled */
  isDisabled?: boolean;
  /** Whether the textarea is required */
  isRequired?: boolean;
  /** Whether the textarea is read-only */
  isReadOnly?: boolean;
  /** Minimum number of rows */
  minRows?: number;
  /** Maximum number of rows */
  maxRows?: number;
  /** Textarea value */
  value?: string;
  /** Default value */
  defaultValue?: string;
  /** Change handler */
  onValueChange?: (value: string) => void;
  /** Additional class name */
  class?: string;
  /** Textarea name for forms */
  name?: string;
}

export function Textarea(props: TextareaProps) {
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
    "isReadOnly",
    "minRows",
    "maxRows",
    "value",
    "defaultValue",
    "onValueChange",
    "class",
    "name",
  ]);

  const variant = () => local.variant || "flat";
  const size = () => local.size || "md";
  const minRows = () => local.minRows || 3;

  const sizeClasses = createMemo(() => {
    switch (size()) {
      case "sm":
        return {
          textarea: "text-sm px-2.5 py-1.5",
          label: "text-xs",
        };
      case "md":
        return {
          textarea: "text-base px-3 py-2",
          label: "text-sm",
        };
      case "lg":
        return {
          textarea: "text-lg px-4 py-2.5",
          label: "text-base",
        };
      default:
        return {
          textarea: "text-base px-3 py-2",
          label: "text-sm",
        };
    }
  });

  const variantClasses = createMemo(() => {
    const base =
      "w-full rounded-xl transition-all duration-200 outline-none bg-transparent resize-y";
    const focusRing =
      "focus:ring-2 focus:ring-primary-500/50 focus:ring-offset-0";

    switch (variant()) {
      case "flat":
        return `${base} bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 border-2 border-transparent focus:border-primary-500 ${focusRing}`;
      case "bordered":
        return `${base} border-2 border-neutral-300 dark:border-neutral-600 hover:border-neutral-400 dark:hover:border-neutral-500 focus:border-primary-500 ${focusRing}`;
      case "underlined":
        return `${base} rounded-none border-b-2 border-neutral-300 dark:border-neutral-600 hover:border-neutral-400 dark:hover:border-neutral-500 focus:border-primary-500 px-0`;
      default:
        return base;
    }
  });

  const invalidClasses = () =>
    local.isInvalid
      ? "border-error-500 focus:border-error-500 focus:ring-error-500/50"
      : "";

  return (
    <TextField
      class={`flex flex-col gap-1.5 ${local.class || ""}`}
      validationState={local.isInvalid ? "invalid" : "valid"}
      disabled={local.isDisabled}
      readOnly={local.isReadOnly}
      required={local.isRequired}
      value={local.value}
      defaultValue={local.defaultValue}
      onChange={local.onValueChange}
      name={local.name}
      {...others}
    >
      <Show when={local.label}>
        <TextField.Label
          class={`font-medium text-[var(--text-primary)] ${sizeClasses().label}`}
        >
          {local.label}
          <Show when={local.isRequired}>
            <span class="text-error-500 ml-0.5">*</span>
          </Show>
        </TextField.Label>
      </Show>

      <TextField.TextArea
        placeholder={local.placeholder}
        rows={minRows()}
        class={`
          ${variantClasses()}
          ${sizeClasses().textarea}
          ${invalidClasses()}
          text-[var(--text-primary)]
          placeholder:text-[var(--text-tertiary)]
          disabled:opacity-50 disabled:cursor-not-allowed
        `}
        style={{
          "max-height": local.maxRows ? `${local.maxRows * 1.5}em` : undefined,
        }}
      />

      <Show when={local.description && !local.isInvalid}>
        <TextField.Description class="text-sm text-[var(--text-secondary)]">
          {local.description}
        </TextField.Description>
      </Show>

      <Show when={local.errorMessage && local.isInvalid}>
        <TextField.ErrorMessage class="text-sm text-error-500">
          {local.errorMessage}
        </TextField.ErrorMessage>
      </Show>
    </TextField>
  );
}
