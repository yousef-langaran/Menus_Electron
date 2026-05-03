import { Checkbox } from '@heroui/react';
import type { ComponentProps, ReactNode } from 'react';

export type CompatCheckboxProps = Omit<ComponentProps<typeof Checkbox>, 'onChange' | 'children'> & {
  onValueChange?: (v: boolean) => void;
  children?: ReactNode;
  classNames?: { label?: string };
};

export function CheckboxCompat({ isSelected, onValueChange, children, classNames, ...rest }: CompatCheckboxProps) {
  return (
    <Checkbox isSelected={isSelected} onChange={onValueChange} {...rest}>
      <Checkbox.Control>
        <Checkbox.Indicator />
      </Checkbox.Control>
      {children != null && children !== '' ? (
        <Checkbox.Content className={classNames?.label}>{children}</Checkbox.Content>
      ) : null}
    </Checkbox>
  );
}
