const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

function toEnglishDigits(input: string): string {
  let result = input;
  for (let i = 0; i < 10; i += 1) {
    result = result
      .replace(new RegExp(PERSIAN_DIGITS[i], 'g'), String(i))
      .replace(new RegExp(ARABIC_DIGITS[i], 'g'), String(i));
  }
  return result;
}

export function normalizeIranMobile(input: string): string {
  let value = toEnglishDigits(String(input || ''))
    .replace(/[^\d+]/g, '')
    .trim();

  if (value.startsWith('0098')) value = `0${value.slice(4)}`;
  else if (value.startsWith('+98')) value = `0${value.slice(3)}`;
  else if (value.startsWith('98')) value = `0${value.slice(2)}`;
  else if (value.startsWith('9') && value.length === 10) value = `0${value}`;

  return value;
}

export function isValidIranMobile(input: string): boolean {
  const normalized = normalizeIranMobile(input);
  return /^09\d{9}$/.test(normalized);
}

export function sanitizeMobileInput(input: string): string {
  return toEnglishDigits(input).replace(/\D/g, '').slice(0, 11);
}
