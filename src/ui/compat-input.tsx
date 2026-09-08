import { FieldError, InputGroup, Label, TextField, Input as HeroInput } from '@heroui/react';
import { forwardRef, type ReactNode } from 'react';
import type { ComponentPropsWithRef } from 'react';

type HeroInputProps = ComponentPropsWithRef<typeof InputGroup.Input>;
type TextFieldProps = ComponentPropsWithRef<typeof TextField>;

export type CompatInputProps = Omit<HeroInputProps, 'size' | 'variant'> & {
  label?: ReactNode;
  errorMessage?: string;
  size?: string | number;
  /** v2: bordered → اینجا به secondary نگاشت می‌شود */
  variant?: 'bordered' | 'flat' | 'faded' | 'underlined' | 'primary' | 'secondary' | undefined;
  isInvalid?: boolean;
  isRequired?: boolean;
  /** v2-style prop names; translated to native disabled/readOnly on the underlying input */
  isDisabled?: boolean;
  isReadOnly?: boolean;
  onValueChange?: (value: string) => void;
  startContent?: ReactNode;
  endContent?: ReactNode;
  classNames?: { input?: string };
  textFieldProps?: Omit<TextFieldProps, 'children' | 'onChange' | 'value' | 'defaultValue' | 'variant'>;
} & Pick<TextFieldProps, 'fullWidth'>;

function toTextFieldString(v: string | number | readonly string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return v.join(',');
}

function pickTextFieldValueProps(
  value: CompatInputProps['value'],
  defaultValue: CompatInputProps['defaultValue'],
  onChange: CompatInputProps['onChange'],
  onValueChange: CompatInputProps['onValueChange'],
): Partial<Pick<TextFieldProps, 'value' | 'defaultValue' | 'onChange'>> {
  const out: Partial<Pick<TextFieldProps, 'value' | 'defaultValue' | 'onChange'>> = {};
  const vs = toTextFieldString(value);
  const dv = toTextFieldString(defaultValue);
  if (vs !== undefined) out.value = vs;
  if (dv !== undefined) out.defaultValue = dv;
  if (onValueChange) {
    out.onChange = onValueChange;
  } else if (onChange) {
    out.onChange = (val: string) => {
      const event = { target: { value: val } } as React.ChangeEvent<HTMLInputElement>;
      onChange(event);
    };
  }
  return out;
}

function mapInputVariant(v: CompatInputProps['variant']): 'primary' | 'secondary' | undefined {
  if (!v || v === 'bordered' || v === 'flat' || v === 'faded' || v === 'underlined') return 'secondary';
  if (v === 'primary' || v === 'secondary') return v;
  return 'secondary';
}

export const Input = forwardRef<HTMLInputElement, CompatInputProps>(function Input(
  {
    label,
    errorMessage,
    isInvalid,
    isRequired,
    isDisabled,
    isReadOnly,
    className,
    fullWidth,
    variant,
    size: _size,
    value,
    defaultValue,
    onChange,
    onValueChange,
    startContent,
    endContent,
    classNames,
    textFieldProps,
    disabled,
    readOnly,
    ...rest
  },
  ref,
) {
  const hasVisibleLabel = label != null && label !== '';
  const invalid = Boolean(isInvalid ?? errorMessage);
  const hasAddon = startContent != null || endContent != null;
  const textFieldValueProps = pickTextFieldValueProps(value, defaultValue, onChange, onValueChange);
  const inputVariant = mapInputVariant(variant);
  // The underlying react-aria Input/InputGroup.Input only understands the native
  // `disabled`/`readOnly` HTML attributes (InputProps extends InputHTMLAttributes),
  // while TextField (the aria wrapper) understands `isDisabled`/`isReadOnly`. Some
  // v2-style callers still pass isDisabled/isReadOnly directly to this Input, so
  // translate them to native attrs here rather than letting them fall into ...rest
  // and get silently ignored by the DOM input.
  const nativeDisabled = disabled ?? isDisabled;
  const nativeReadOnly = readOnly ?? isReadOnly;

  const inputClass = [classNames?.input, className].filter(Boolean).join(' ') || undefined;
  const inputEl = hasAddon ? (
    <InputGroup variant={inputVariant}>
      {startContent ? <InputGroup.Prefix>{startContent}</InputGroup.Prefix> : null}
      <InputGroup.Input
        ref={ref}
        className={`[&]:ps-2 [&]:pe-4 ${inputClass ?? ''}`}
        variant={inputVariant}
        disabled={nativeDisabled}
        readOnly={nativeReadOnly}
        {...rest}
      />
      {endContent ? <InputGroup.Suffix>{endContent}</InputGroup.Suffix> : null}
    </InputGroup>
  ) : (
    <HeroInput
      ref={ref}
      className={inputClass}
      variant={inputVariant}
      disabled={nativeDisabled}
      readOnly={nativeReadOnly}
      {...rest}
    />
  );

  if (!hasVisibleLabel && errorMessage == null) {
    if (Object.keys(textFieldValueProps).length > 0 || isDisabled != null || isReadOnly != null) {
      return (
        <TextField
          fullWidth={fullWidth}
          isDisabled={isDisabled}
          isReadOnly={isReadOnly}
          {...textFieldProps}
          {...textFieldValueProps}
        >
          {inputEl}
        </TextField>
      );
    }
    return inputEl;
  }

  return (
    <TextField
      fullWidth={fullWidth}
      isInvalid={invalid}
      isRequired={isRequired}
      isDisabled={isDisabled}
      isReadOnly={isReadOnly}
      validationBehavior="aria"
      {...textFieldProps}
      {...textFieldValueProps}
    >
      {hasVisibleLabel ? (
        <Label isInvalid={invalid} isRequired={isRequired} isDisabled={isDisabled}>
          {label}
        </Label>
      ) : null}
      {inputEl}
      {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
    </TextField>
  );
});
