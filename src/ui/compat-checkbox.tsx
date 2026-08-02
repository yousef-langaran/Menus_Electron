import { Checkbox } from '@heroui/react';
import type { ComponentProps, ReactNode } from 'react';

export type CompatCheckboxProps = Omit<ComponentProps<typeof Checkbox>, 'onChange' | 'children'> & {
  onValueChange?: (v: boolean) => void;
  children?: ReactNode;
  classNames?: { label?: string };
};

export function CheckboxCompat({ isSelected, onValueChange, children, classNames, ...rest }: CompatCheckboxProps) {
  const hasLabel = children != null && children !== '';

  // Checkbox.Content is the interactive element (React Aria's CheckboxButton); the
  // control/indicator are plain spans, so they must live inside it or nothing toggles.
  return (
    <Checkbox isSelected={isSelected} onChange={onValueChange} {...rest}>
      <Checkbox.Content>
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
        {hasLabel ? <span className={classNames?.label}>{children}</span> : null}
      </Checkbox.Content>
    </Checkbox>
  );
}
