export const normalizeNameFa = (value: string | null | undefined): string =>
  String(value || '')
    .trim()
    .replace(/[يىے]/g, 'ی')
    .replace(/[كڪګ]/g, 'ک')
    .replace(/[ةۀە]/g, 'ه')
    .replace(/[آأإٱ]/g, 'ا')
    .replace(/[ؤۄۊۋ]/g, 'و')
    .replace(/[ً-ٰٟ]/g, '')
    .replace(/[​-‏‪-‮⁦-⁩﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const _toAsciiDigits = (s: string): string =>
  s
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));

// Strips spaces and normalizes number separators for fuzzy matching
export const smartNormalizeFa = (value: string | null | undefined): string =>
  _toAsciiDigits(normalizeNameFa(value))
    .replace(/[/،,]/g, '.')
    .replace(/\s+/g, '');

// Each space-separated token in query must appear somewhere in productName (fuzzy, space/separator-insensitive)
export const smartSearchMatch = (productName: string | null | undefined, query: string): boolean => {
  if (!query.trim()) return true;
  const productFuzzy = smartNormalizeFa(productName);
  const tokens = normalizeNameFa(query)
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => _toAsciiDigits(t).replace(/[/،,]/g, '.'));
  return tokens.every((token) => productFuzzy.includes(token));
};
