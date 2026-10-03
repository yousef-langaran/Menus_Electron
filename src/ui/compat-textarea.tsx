import { Description, Label, TextArea, TextField } from '@heroui/react';
import type { ComponentProps, ReactNode } from 'react';

type TAProps = Omit<ComponentProps<typeof TextArea>, 'variant' | 'value' | 'defaultValue'>;

type TextValue = string | number | readonly string[] | null | undefined;

export type CompatTextareaProps = TAProps & {
  label?: string;
  description?: ReactNode;
  onValueChange?: (v: string) => void;
  value?: TextValue;
  defaultValue?: TextValue;
  /** v2 (`bordered`/`flat`/...) پذیرفته می‌شود؛ ظاهر همیشه secondary است مگر `primary` صریح */
  variant?: 'primary' | 'secondary' | 'bordered' | 'flat' | 'faded' | 'underlined';
  /** معادل v2 برای ارتفاع اولیه؛ به `rows` نگاشت می‌شود */
  minRows?: number;
  maxRows?: number;
  /** فقط کلید `input` اعمال می‌شود */
  classNames?: { input?: string };
  size?: string;
};

function toText(v: TextValue): string | undefined {
  if (v == null) return undefined;
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return v.join(',');
}

export function Textarea({
  label,
  description,
  onValueChange,
  value,
  defaultValue,
  className,
  variant,
  minRows,
  maxRows: _maxRows,
  classNames,
  size: _size,
  rows,
  ...rest
}: CompatTextareaProps) {
  const tfProps = {
    value: toText(value),
    defaultValue: toText(defaultValue),
    onChange: onValueChange,
  };
  const mergedClassName = [className, classNames?.input].filter(Boolean).join(' ') || undefined;
  const area = (
    <TextArea
      className={mergedClassName}
      variant={variant === 'primary' ? 'primary' : 'secondary'}
      rows={rows ?? minRows}
      {...rest}
    />
  );
  if (!label && !description) {
    return <TextField {...tfProps}>{area}</TextField>;
  }
  return (
    <TextField {...tfProps}>
      {label ? <Label>{label}</Label> : null}
      {area}
      {description ? <Description>{description}</Description> : null}
    </TextField>
  );
}
