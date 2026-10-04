export const PAGE_SIZE = 20;

export const PRODUCT_UNITS = [
  'عدد',
  'کیلوگرم',
  'گرم',
  'لیتر',
  'میلی‌لیتر',
  'متر',
  'سانتی‌متر',
  'بسته',
  'جعبه',
  'پرس',
  'وعده',
  'پیمانه',
  'قوطی',
  'بطری',
];

export const SCALE_UNITS = ['کیلوگرم', 'گرم'];

export type ProductForm = {
  id?: number;
  barcode: string;
  name_fa: string;
  name: string;
  price: string;
  category_id: string;
  unit: string;
  useScaleForWeight: boolean;
};

export const emptyForm: ProductForm = {
  barcode: '',
  name_fa: '',
  name: '',
  price: '',
  category_id: '',
  unit: 'عدد',
  useScaleForWeight: false,
};

export const normalizeBarcode = (value: string) =>
  String(value || '')
    .replace(/[‌‏‪-‮]/g, '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/\s+/g, '')
    .replace(/^\/+|\/+$/g, '')
    .trim();

export const normalizeDigits = (value: string) =>
  String(value || '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776));

export const normalizePriceInput = (value: string) => normalizeDigits(value).replace(/[^\d]/g, '');

export const formatPriceInput = (value: string) => {
  const digits = normalizePriceInput(value);
  if (!digits) return '';
  return new Intl.NumberFormat('en-US').format(Number(digits));
};
