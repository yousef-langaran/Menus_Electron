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

export const normalizePriceInput = (value: string) =>
  String(value || '')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[^\d]/g, '');

export const formatPriceInput = (value: string) => {
  const digits = normalizePriceInput(value);
  if (!digits) return '';
  return new Intl.NumberFormat('en-US').format(Number(digits));
};
