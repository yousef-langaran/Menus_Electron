import { Chip as HeroChip } from '@heroui/react';
import type { ComponentProps } from 'react';

/**
 * Chip نسخهٔ ۲ (`variant="flat"`، `color="primary"` ...) را به معادل v3 نگاشت می‌کند.
 * مقدار ناشناختهٔ variant در v3 هیچ کلاسی نمی‌گیرد و چیپ بی‌استایل رندر می‌شد.
 * جدول نگاشت مطابق راهنمای رسمی مهاجرت است:
 * https://www.heroui.com/docs/react/migration/chip
 */
type ChipBase = ComponentProps<typeof HeroChip>;

type V3Variant = 'primary' | 'secondary' | 'tertiary' | 'soft';
type V3Color = 'accent' | 'danger' | 'default' | 'success' | 'warning';
type LegacyVariant = 'solid' | 'flat' | 'bordered' | 'light' | 'faded' | 'shadow' | 'dot';
type LegacyColor =
  | 'primary'
  | 'secondary'
  | 'default'
  | 'success'
  | 'warning'
  | 'danger'
  | 'accent';

export type CompatChipProps = Omit<ChipBase, 'variant' | 'color'> & {
  variant?: V3Variant | LegacyVariant;
  color?: V3Color | LegacyColor;
  title?: string;
};

const V3_VARIANTS: readonly string[] = ['primary', 'secondary', 'tertiary', 'soft'];
const V3_COLORS: readonly string[] = ['accent', 'danger', 'default', 'success', 'warning'];

function mapVariant(variant: string | undefined): V3Variant | undefined {
  if (variant === undefined) return undefined;
  if (V3_VARIANTS.includes(variant)) return variant as V3Variant;
  switch (variant as LegacyVariant) {
    case 'solid':
    case 'shadow':
      return 'primary';
    case 'bordered':
    case 'faded':
      return 'secondary';
    case 'flat':
      return 'tertiary';
    case 'light':
    case 'dot':
      return 'soft';
    default:
      return undefined;
  }
}

function mapColor(color: string | undefined): V3Color | undefined {
  if (color === undefined) return undefined;
  if (V3_COLORS.includes(color)) return color as V3Color;
  return color === 'primary' ? 'accent' : 'default';
}

function CompatChip({ variant, color, ...props }: CompatChipProps) {
  return <HeroChip variant={mapVariant(variant)} color={mapColor(color)} {...props} />;
}

/** با زیرکامپوننت‌های v3 (Chip.Label ...) */
export const Chip = Object.assign(CompatChip, HeroChip);
