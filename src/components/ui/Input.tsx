import { TextField } from "@kobalte/core/text-field";
import { type JSX, splitProps, Show, createMemo } from "solid-js";

export interface InputProps {
  /** Input variant style */
  variant?: "flat" | "bordered" | "underlined";
  /** Input size */
  size?: "sm" | "md" | "lg";
  /** Label text */
  label?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Description text below input */
  description?: string;
  /** Error message (shown when isInvalid is true) */
  errorMessage?: string;
  /** Whether the input is in invalid state */
  isInvalid?: boolean;
  /** Whether the input is disabled */
  isDisabled?: boolean;
  /** Whether the input is required */
  isRequired?: boolean;
  /** Whether the input is read-only */
  isReadOnly?: boolean;
  /** Input type */
  type?: "text" | "email" | "password" | "number" | "tel" | "url" | "search";
  /** Input value */
  value?: string;
  /** Default value */
  defaultValue?: string;
  /** Change handler */
  onValueChange?: (value: string) => void;
  /** Content to display at the start of the input */
  startContent?: JSX.Element;
  /** Content to display at the end of the input */
  endContent?: JSX.Element;
  /** Additional class name */
  class?: string;
  /** Input name for forms */
  name?: string;
}

export function Input(props: InputProps) {
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
    "type",
    "value",
    "defaultValue",
    "onValueChange",
    "startContent",
    "endContent",
    "class",
    "name",
  ]);

  const variant = () => local.variant || "flat";
  const size = () => local.size || "md";

  const sizeClasses = createMemo(() => {
    switch (size()) {
      case "sm":
        return {
          wrapper: "min-h-8",
          input: "text-sm px-2.5 py-1.5",
          label: "text-xs",
        };
      case "md":
        return {
          wrapper: "min-h-10",
          input: "text-base px-3 py-2",
          label: "text-sm",
        };
      case "lg":
        return {
          wrapper: "min-h-12",
          input: "text-lg px-4 py-2.5",
          label: "text-base",
        };
      default:
        return {
          wrapper: "min-h-10",
          input: "text-base px-3 py-2",
          label: "text-sm",
        };
    }
  });

  const variantClasses = createMemo(() => {
    const base =
      "w-full rounded-xl transition-all duration-200 outline-none bg-transparent";
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

      <div
        class={`relative flex items-center ${sizeClasses().wrapper}`}
      >
        <Show when={local.startContent}>
          <span class="absolute left-3 flex items-center text-[var(--text-tertiary)]">
            {local.startContent}
          </span>
        </Show>

        <TextField.Input
          type={local.type || "text"}
          placeholder={local.placeholder}
          class={`
            ${variantClasses()}
            ${sizeClasses().input}
            ${invalidClasses()}
            ${local.startContent ? "pl-10" : ""}
            ${local.endContent ? "pr-10" : ""}
            text-[var(--text-primary)]
            placeholder:text-[var(--text-tertiary)]
            disabled:opacity-50 disabled:cursor-not-allowed
          `}
        />

        <Show when={local.endContent}>
          <span class="absolute right-3 flex items-center text-[var(--text-tertiary)]">
            {local.endContent}
          </span>
        </Show>
      </div>

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
