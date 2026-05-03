import { Button as HeroButton, Spinner } from '@heroui/react';
import type { ComponentProps, ReactNode } from 'react';

type HeroBtn = ComponentProps<typeof HeroButton>;

type LegacyColor = 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | undefined;
type LegacyVariant =
  | 'solid'
  | 'bordered'
  | 'light'
  | 'flat'
  | 'faded'
  | 'shadow'
  | 'ghost'
  | undefined;

export type CompatButtonProps = Omit<HeroBtn, 'variant' | 'children'> & {
  color?: LegacyColor;
  variant?: LegacyVariant;
  isLoading?: boolean;
  children?: ReactNode;
};

function mapToV3Variant(color?: LegacyColor, variant?: LegacyVariant): HeroBtn['variant'] {
  const v = variant ?? 'solid';
  const c = color ?? 'default';

  if (v === 'bordered') return 'outline';
  if (v === 'solid' || v === 'shadow' || v === 'faded') {
    if (c === 'danger') return 'danger';
    if (c === 'success') return 'primary';
    return 'primary';
  }
  if (v === 'flat') {
    if (c === 'danger') return 'danger-soft';
    if (c === 'primary') return 'secondary';
    if (c === 'secondary') return 'secondary';
    if (c === 'success') return 'secondary';
    if (c === 'warning') return 'outline';
    return 'ghost';
  }
  if (v === 'light') {
    if (c === 'danger') return 'danger-soft';
    return 'ghost';
  }
  if (v === 'ghost') return 'ghost';
  return 'primary';
}

export function Button({ color, variant, isLoading, children, isDisabled, ...rest }: CompatButtonProps) {
  const nextVariant = mapToV3Variant(color, variant);
  const disabled = Boolean(isDisabled || isLoading);

  return (
    <HeroButton {...rest} variant={nextVariant} isDisabled={disabled} isPending={isLoading}>
      {isLoading ? (
        <span className="inline-flex items-center justify-center gap-2">
          <Spinner size="sm" color="current" aria-label="در حال بارگذاری" />
          <span className="opacity-70">{children}</span>
        </span>
      ) : (
        children
      )}
    </HeroButton>
  );
}
