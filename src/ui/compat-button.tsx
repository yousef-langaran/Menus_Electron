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

export type CompatButtonProps = Omit<HeroBtn, 'variant' | 'children' | 'disabled'> & {
  color?: LegacyColor;
  variant?: LegacyVariant;
  isLoading?: boolean;
  /** v2-style plain prop; unioned with isDisabled before forwarding to HeroButton */
  disabled?: boolean;
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

/**
 * v3 Button هیچ variant اختصاصی برای success ندارد (فقط danger/danger-soft/ghost/outline/
 * primary/secondary/tertiary — نگاه کنید به @heroui/styles button.styles.ts)، برای همین
 * mapToV3Variant قبلاً color="success" را بی‌صدا با primary/secondary یکی می‌کرد و دکمه‌های
 * تأیید/پرداخت از دکمه‌های اصلی قابل تشخیص نبودند. اینجا از همان توکن‌های رنگ success که
 * خود HeroUI به Chip/Toast می‌دهد (--color-success, --color-success-soft, ...) به‌عنوان
 * className override استفاده می‌کنیم تا ظاهر success واقعاً سبز/متمایز بماند.
 */
function successClassName(variant?: LegacyVariant): string {
  const v = variant ?? 'solid';
  if (v === 'bordered') return '!border-success !text-success hover:!bg-success-soft';
  if (v === 'light' || v === 'ghost') return '!text-success hover:!bg-success-soft';
  if (v === 'flat') return '!bg-success-soft !text-success-soft-foreground hover:!bg-success-soft-hover';
  return '!bg-success !text-success-foreground hover:!bg-success-hover';
}

export function Button({ color, variant, isLoading, children, isDisabled, disabled: plainDisabled, className, ...rest }: CompatButtonProps) {
  const nextVariant = mapToV3Variant(color, variant);
  const disabled = Boolean(isDisabled || plainDisabled || isLoading);
  const mergedClassName = [color === 'success' ? successClassName(variant) : '', className]
    .filter(Boolean)
    .join(' ') || undefined;

  return (
    <HeroButton
      {...rest}
      variant={nextVariant}
      isDisabled={disabled}
      isPending={isLoading}
      className={mergedClassName}
    >
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
