import { FieldError, ListBox, ListBoxItem, Label, Select as HeroSelect } from '@heroui/react';
import { Children, cloneElement, isValidElement } from 'react';
import type { ComponentProps, ReactNode } from 'react';

type BaseSelectProps = ComponentProps<typeof HeroSelect>;

export function SelectItem({
  children,
  value,
  textValue,
  id: explicitId,
  ...rest
}: {
  children: React.ReactNode;
  value?: string | number;
  textValue?: string;
  id?: string;
} & Omit<ComponentProps<typeof ListBoxItem>, 'id' | 'children'>) {
  const labelText = textValue ?? (typeof children === 'string' ? children : String(children ?? ''));
  const id =
    explicitId ??
    (value != null && String(value) !== ''
      ? String(value)
      : `opt-${labelText.replace(/\s+/g, '-').slice(0, 80)}`);
  return (
    <ListBoxItem id={id} textValue={labelText} {...rest}>
      {children}
    </ListBoxItem>
  );
}

export type LegacySelectProps = Omit<
  BaseSelectProps,
  'children' | 'selectedKey' | 'onSelectionChange' | 'selectedKeys'
> & {
  label?: string;
  placeholder?: string;
  errorMessage?: string;
  selectedKeys?: string[] | readonly string[] | Iterable<string>;
  onSelectionChange?: (keys: Set<string>) => void;
  children: React.ReactNode;
};

export function Select({
  label,
  placeholder,
  selectedKeys,
  onSelectionChange,
  children,
  isRequired,
  className,
  errorMessage,
  isInvalid,
  ...rest
}: LegacySelectProps) {
  const arr = selectedKeys ? Array.from(selectedKeys) : [];
  const selectedKey = arr.length ? arr[0] : null;
  const invalid = Boolean(isInvalid ?? errorMessage);
  const normalizeReactKey = (k: string) => k.replace(/^\.\$/, '').replace(/^\./, '');
  const ensureIdsFromKeys = (node: ReactNode): ReactNode => {
    if (!isValidElement(node)) return node;
    const maybeKey = node.key != null ? normalizeReactKey(String(node.key)) : '';
    const nextChildren = node.props?.children
      ? Children.map(node.props.children, (c) => ensureIdsFromKeys(c))
      : node.props?.children;
    const shouldInjectId = node.type === SelectItem && !(node.props as { id?: string })?.id && maybeKey;
    if (shouldInjectId) {
      return cloneElement(node, { id: maybeKey, children: nextChildren } as Record<string, unknown>);
    }
    if (nextChildren !== node.props?.children) {
      return cloneElement(node, { children: nextChildren } as Record<string, unknown>);
    }
    return node;
  };
  const processedChildren = Children.map(children, (c) => ensureIdsFromKeys(c));

  const extractSelectionKey = (key: unknown): string | null => {
    if (key == null) return null;
    if (typeof key === 'string' || typeof key === 'number') return String(key);
    if (key instanceof Set) {
      const first = Array.from(key)[0];
      return first == null ? null : String(first);
    }
    if (typeof key === 'object' && key !== null) {
      const o = key as Record<string, unknown>;
      const candidate =
        o.currentKey ?? o.anchorKey ?? o.id ?? o.key ?? (Array.isArray(o.keys) ? o.keys[0] : undefined);
      if (candidate != null) return String(candidate);
    }
    return String(key);
  };

  const vrest = { ...rest } as Record<string, unknown>;
  if (vrest.variant === 'bordered') {
    vrest.variant = 'secondary';
  }

  return (
    <HeroSelect
      {...(vrest as BaseSelectProps)}
      selectedKey={selectedKey ?? undefined}
      onSelectionChange={(key) => {
        const resolved = extractSelectionKey(key);
        onSelectionChange?.(new Set(resolved != null && resolved !== '' ? [resolved] : []));
      }}
      isRequired={isRequired}
      isInvalid={invalid}
      className={className}
    >
      {label ? (
        <Label isInvalid={invalid} isRequired={isRequired}>
          {label}
        </Label>
      ) : null}
      <HeroSelect.Trigger>
        <HeroSelect.Value placeholder={placeholder} />
        <HeroSelect.Indicator />
      </HeroSelect.Trigger>
      <HeroSelect.Popover>
        <ListBox>{processedChildren}</ListBox>
      </HeroSelect.Popover>
      {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
    </HeroSelect>
  );
}
