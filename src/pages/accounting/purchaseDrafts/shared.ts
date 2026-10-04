import { toShamsiDate } from '../../../utils/date';

export const SYNC_STATUS_CONFIG: Record<
  string,
  { label: string; color: 'warning' | 'success' | 'danger' | 'default' }
> = {
  pending: { label: 'در صف ارسال', color: 'warning' },
  syncing: { label: 'در حال ارسال', color: 'default' },
  synced: { label: 'سینک شده', color: 'success' },
  failed: { label: 'ارسال ناموفق', color: 'danger' },
};

export const INVOICE_STATUS_CONFIG: Record<
  string,
  { label: string; color: 'warning' | 'success' | 'danger' | 'default' | 'primary' }
> = {
  draft: { label: 'پیش‌نویس', color: 'default' },
  pending_approval: { label: 'در انتظار تایید', color: 'warning' },
  approved: { label: 'تایید شده', color: 'success' },
  rejected: { label: 'رد شده', color: 'danger' },
};

export const normalizePriceInput = (value: string) =>
  String(value || '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[^\d]/g, '');

export const normalizeBarcode = (value: string) =>
  String(value || '')
    .replace(/[‌‏‪-‮]/g, '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/\s+/g, '')
    .replace(/^\/+|\/+$/g, '')
    .trim();

export const formatPriceInput = (value: string) => {
  const digits = normalizePriceInput(value);
  if (!digits) return '';
  return new Intl.NumberFormat('en-US').format(Number(digits));
};

export const formatCurrency = (n: number) =>
  new Intl.NumberFormat('fa-IR').format(Math.round(n)) + ' ریال';

export const toJalali = (isoDate?: string) => toShamsiDate(isoDate);

export type ItemType = 'raw_material' | 'final_product';

export type DraftItem = {
  type: ItemType;
  /** accounting rawMaterial ID */
  rawMaterialId: string;
  /** menu product ID — shown in UI for final_product rows */
  menuProductId: string;
  /** accounting FinalProduct ID — resolved on save / loaded on edit */
  finalProductId: string;
  quantity: string;
  /** قیمت کل خرید این ردیف (کاربر کل را وارد می‌کند؛ قیمت تکی = کل ÷ مقدار) */
  totalPrice: string;
  /** قیمت فروش (اختیاری) */
  salePrice: string;
};

export const emptyItem = (): DraftItem => ({
  type: 'raw_material',
  rawMaterialId: '',
  menuProductId: '',
  finalProductId: '',
  quantity: '1',
  totalPrice: '0',
  salePrice: '',
});
