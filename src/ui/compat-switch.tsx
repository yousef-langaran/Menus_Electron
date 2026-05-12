import { Switch } from '@heroui/react';
import type { ComponentProps, ReactNode } from 'react';

export type CompatSwitchProps = Omit<ComponentProps<typeof Switch>, 'children' | 'onChange'> & {
  onValueChange?: (v: boolean) => void;
  children?: ReactNode;
};

export function SwitchCompat({ isSelected, onValueChange, children, ...rest }: CompatSwitchProps) {
  return (
    <Switch isSelected={isSelected} onChange={onValueChange} {...rest}>
      <Switch.Control>
        <Switch.Thumb />
      </Switch.Control>
      {children ? <Switch.Content>{children}</Switch.Content> : null}
    </Switch>
  );
}
