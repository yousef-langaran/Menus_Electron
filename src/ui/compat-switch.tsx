import { Switch } from '@heroui/react';
import type { ComponentProps, ReactNode } from 'react';

export type CompatSwitchProps = Omit<ComponentProps<typeof Switch>, 'children' | 'onChange'> & {
  onValueChange?: (v: boolean) => void;
  children?: ReactNode;
};

export function SwitchCompat({ isSelected, onValueChange, children, ...rest }: CompatSwitchProps) {
  // Switch.Content is the interactive element (React Aria's SwitchButton); the
  // control/thumb are plain spans, so they must live inside it or nothing toggles.
  return (
    <Switch isSelected={isSelected} onChange={onValueChange} {...rest}>
      <Switch.Content>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
        {children}
      </Switch.Content>
    </Switch>
  );
}
