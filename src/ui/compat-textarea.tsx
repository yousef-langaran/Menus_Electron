import { Label, TextArea, TextField } from '@heroui/react';
import type { ComponentProps } from 'react';

type TAProps = ComponentProps<typeof TextArea>;

export type CompatTextareaProps = TAProps & {
  label?: string;
  onValueChange?: (v: string) => void;
};

export function Textarea({ label, onValueChange, value, defaultValue, className, ...rest }: CompatTextareaProps) {
  const tf = {
    value,
    defaultValue,
    onChange: onValueChange,
  };
  const area = <TextArea className={className} variant="secondary" {...tf} {...rest} />;
  if (!label) {
    return <TextField {...tf}>{area}</TextField>;
  }
  return (
    <TextField {...tf}>
      <Label>{label}</Label>
      {area}
    </TextField>
  );
}
