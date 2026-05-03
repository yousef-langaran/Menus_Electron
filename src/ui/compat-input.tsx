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
    ...rest
  },
  ref,
) {
  const hasVisibleLabel = label != null && label !== '';
  const invalid = Boolean(isInvalid ?? errorMessage);
  const hasAddon = startContent != null || endContent != null;
  const textFieldValueProps = pickTextFieldValueProps(value, defaultValue, onChange, onValueChange);
  const inputVariant = mapInputVariant(variant);

  const inputClass = [classNames?.input, className].filter(Boolean).join(' ') || undefined;
  const inputEl = hasAddon ? (
    <InputGroup>
      {startContent ? <InputGroup.Prefix>{startContent}</InputGroup.Prefix> : null}
      <InputGroup.Input
        ref={ref}
        className={`[&]:ps-2 [&]:pe-4 ${inputClass ?? ''}`}
        variant={inputVariant}
        {...rest}
      />
      {endContent ? <InputGroup.Suffix>{endContent}</InputGroup.Suffix> : null}
    </InputGroup>
  ) : (
    <HeroInput ref={ref} className={inputClass} variant={inputVariant} {...rest} />
  );

  if (!hasVisibleLabel && errorMessage == null) {
    if (Object.keys(textFieldValueProps).length > 0) {
      return (
        <TextField fullWidth={fullWidth} {...textFieldProps} {...textFieldValueProps}>
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
      validationBehavior="aria"
      {...textFieldProps}
      {...textFieldValueProps}
    >
      {hasVisibleLabel ? (
        <Label isInvalid={invalid} isRequired={isRequired}>
          {label}
        </Label>
      ) : null}
      {inputEl}
      {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
    </TextField>
  );
});
