"use client";

import { type ChangeEvent, type SyntheticEvent, useState } from "react";
import { Input, type InputProps } from "@/components/ui/input";

/**
 * Native numeric input that preserves editable drafts, including blank and invalid text.
 * Controlled callers must keep the callback value (including NaN) in state so an
 * invalid edit cannot silently reuse the last valid number. A different parent value
 * replaces the draft; echoing the callback value preserves its text.
 *
 * Choose one value callback below, or use onChange/defaultValue for registered
 * uncontrolled fields. Native required, min, max and step constraints determine
 * validity. Fields are required by default; optional permits blank values unless
 * required is explicitly supplied. Step defaults to 1; use a fractional step or
 * "any" for decimals. The keyboard hint follows step unless inputMode is supplied.
 *
 * Invalid Enter presses outside IME composition show native feedback and stop
 * submission. Composing key events are forwarded without validation. Custom save
 * buttons must also call validateNumberInputs before acting on numeric drafts.
 *
 * @example
 * <NumberInput value={quantity} onValueChange={setQuantity} min={1} />
 * <NumberInput optional value={filter} onOptionalValueChange={setFilter} />
 */
export function NumberInput({
  value,
  defaultValue,
  onValueChange,
  onOptionalValueChange,
  onTextChange,
  onChange,
  onInput,
  onBlur,
  onKeyDown,
  optional,
  emptyFallback,
  step = 1,
  inputMode = step === 1 || step === "1" ? "numeric" : "decimal",
  ...props
}: NumberInputProps) {
  const [draft, setDraft] = useState({ source: value, text: formatValue(value) });
  const [isInvalid, setIsInvalid] = useState(false);
  // Object.is treats repeated NaN values as the same draft instead of clearing its text.
  const text = Object.is(draft.source, value) ? draft.text : formatValue(value);

  const handleValueChange = (event: SyntheticEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const raw = input.value;
    const isEmpty = raw === "" && !input.validity.badInput;
    const valid = input.validity.valid;
    const next = valid && !isEmpty ? input.valueAsNumber : Number.NaN;
    setDraft({
      source: onTextChange ? raw : onOptionalValueChange && isEmpty ? undefined : next,
      text: raw,
    });
    setIsInvalid(!valid);
    onTextChange?.(raw);
    if (onOptionalValueChange) onOptionalValueChange(isEmpty ? undefined : next);
    else onValueChange?.(next);
    // Typed callbacks own the update; forwarding onChange too would overwrite their value.
    if (!onValueChange && !onOptionalValueChange && !onTextChange)
      onChange?.(event as ChangeEvent<HTMLInputElement>);
  };

  return (
    <Input
      {...props}
      type="number"
      data-number-input=""
      step={step}
      inputMode={inputMode}
      required={props.required ?? !optional}
      value={
        value === undefined && !onValueChange && !onOptionalValueChange && !onTextChange
          ? undefined
          : text
      }
      defaultValue={defaultValue}
      aria-invalid={
        props["aria-invalid"] ??
        ((Object.is(draft.source, value) && isInvalid) || undefined)
      }
      // Input also fires for incomplete prefixes whose numeric value is still empty.
      onInput={(event) => {
        handleValueChange(event);
        onInput?.(event);
      }}
      onBlur={(event) => {
        if (
          emptyFallback !== undefined &&
          event.currentTarget.value === "" &&
          !event.currentTarget.validity.badInput
        ) {
          event.currentTarget.value = String(emptyFallback);
          handleValueChange(event);
        }
        onBlur?.(event);
      }}
      onKeyDown={(event) => {
        if (
          event.key === "Enter" &&
          !event.nativeEvent.isComposing &&
          !event.currentTarget.checkValidity()
        ) {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.reportValidity();
          return;
        }
        onKeyDown?.(event);
      }}
    />
  );
}

function formatValue(value: InputProps["value"]) {
  return (typeof value === "number" && !Number.isFinite(value)) ||
    value === "NaN" ||
    value === "Infinity" ||
    value === "-Infinity"
    ? ""
    : (value ?? "").toString();
}

/**
 * Validate descendant NumberInput controls before a custom action or mutation.
 * Shows native feedback for the first invalid control and returns false, leaving
 * drafts available for correction. Returns true when all controls pass, including
 * an empty or null container. This checks DOM constraints, not domain schemas or
 * drafts whose controls are no longer rendered; validate those at the call site.
 */
export function validateNumberInputs(container: HTMLElement | null) {
  const inputs = container?.querySelectorAll<HTMLInputElement>(
    "input[data-number-input]",
  );
  for (const input of inputs ?? []) {
    if (!input.reportValidity()) return false;
  }
  return true;
}

type NumberInputProps = Omit<InputProps, "type" | "onChange"> & {
  /** Receives the original input event only when no value/text callback is supplied. */
  onChange?: InputProps["onChange"];
  /** Receives native input text without numeric conversion, even when invalid. */
  onTextChange?: (value: string) => void;
  /** Replaces a genuinely blank value on blur, then runs the same validation/callbacks. */
  emptyFallback?: number;
  /** Allows blank input by default; an explicit required prop takes precedence. */
  optional?: boolean;
  /** Receives a valid number or NaN for blank, bad-input, range or step failures. */
  onValueChange?: (value: number) => void;
  /** Receives undefined for genuinely blank input, NaN for other invalid drafts, or a number. */
  onOptionalValueChange?: (value: number | undefined) => void;
};
