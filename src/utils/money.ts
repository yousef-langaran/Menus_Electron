function toEnglishDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

/** حذف جداکننده‌ها و ارقام فارسی/عربی — برای پارس امن ورودی مبلغ */
export function stripNumberFormatting(value: unknown): string {
  const raw = toEnglishDigits(String(value ?? '')).replace(/[,\s٬]/g, '');
  return raw.replace(/[^0-9.-]/g, '');
}

/** مقدار ورودی برای نمایش سه‌رقم‌سه‌رقم (بدون پسوند واحد) */
export function formatPriceInput(value: unknown): string {
  const stripped = stripNumberFormatting(value);
  if (!stripped) return '';
  if (stripped === '-' || stripped === '.' || stripped === '-.') return stripped;
  const [intPartRaw, decimalPart] = stripped.split('.');
  const sign = intPartRaw.startsWith('-') ? '-' : '';
  const intPart = intPartRaw.replace('-', '');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decimalPart != null ? `${sign}${grouped}.${decimalPart}` : `${sign}${grouped}`;
}

/** پارس امن مقدار ورودی مبلغ که ممکن است کاما داشته باشد */
export function parseFormattedNumber(value: unknown): number {
  const n = Number(stripNumberFormatting(value));
  return Number.isFinite(n) ? n : 0;
}
