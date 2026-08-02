import { describe, it, expect } from 'vitest';
import { normalizeNameFa, smartNormalizeFa, smartSearchMatch } from '../persian';

describe('normalizeNameFa', () => {
  it('returns an empty string for nullish input', () => {
    expect(normalizeNameFa(null)).toBe('');
    expect(normalizeNameFa(undefined)).toBe('');
  });

  it('unifies the Arabic yeh and keheh with their Persian forms', () => {
    expect(normalizeNameFa('چاي')).toBe('چای');
    expect(normalizeNameFa('كباب')).toBe('کباب');
  });

  it('unifies teh-marbuta and alef variants', () => {
    expect(normalizeNameFa('میوة')).toBe('میوه');
    expect(normalizeNameFa('آب')).toBe('اب');
    expect(normalizeNameFa('أنار')).toBe('انار');
  });

  it('strips diacritics', () => {
    expect(normalizeNameFa('سَلاد')).toBe('سلاد');
  });

  it('strips zero-width and bidi control characters', () => {
    expect(normalizeNameFa('نوشیدنی‌ها')).toBe('نوشیدنیها');
  });

  it('collapses runs of whitespace and trims the ends', () => {
    expect(normalizeNameFa('  کباب    کوبیده  ')).toBe('کباب کوبیده');
  });

  it('is idempotent', () => {
    const once = normalizeNameFa('  چاي   سَبز ');
    expect(normalizeNameFa(once)).toBe(once);
  });
});

describe('smartNormalizeFa', () => {
  it('converts Persian and Arabic digits to ASCII', () => {
    expect(smartNormalizeFa('۱۲۳')).toBe('123');
    expect(smartNormalizeFa('١٢٣')).toBe('123');
  });

  it('unifies separators to a dot', () => {
    expect(smartNormalizeFa('1/5')).toBe('1.5');
    expect(smartNormalizeFa('1،5')).toBe('1.5');
    expect(smartNormalizeFa('1,5')).toBe('1.5');
  });

  it('removes every space so spacing cannot break a match', () => {
    expect(smartNormalizeFa('کباب کوبیده')).toBe('کبابکوبیده');
  });
});

describe('smartSearchMatch', () => {
  it('matches everything for a blank query', () => {
    expect(smartSearchMatch('کباب کوبیده', '')).toBe(true);
    expect(smartSearchMatch('کباب کوبیده', '   ')).toBe(true);
  });

  it('matches a contiguous substring', () => {
    expect(smartSearchMatch('کباب کوبیده', 'کوبیده')).toBe(true);
  });

  it('requires every query token to be present', () => {
    expect(smartSearchMatch('کباب کوبیده', 'کباب کوبیده')).toBe(true);
    expect(smartSearchMatch('کباب کوبیده', 'کباب برگ')).toBe(false);
  });

  it('matches regardless of token order', () => {
    expect(smartSearchMatch('کباب کوبیده', 'کوبیده کباب')).toBe(true);
  });

  it('ignores spacing differences between query and product name', () => {
    expect(smartSearchMatch('کباب کوبیده', 'کبابکوبیده')).toBe(true);
  });

  it('matches across Arabic/Persian character variants', () => {
    expect(smartSearchMatch('چاي سبز', 'چای')).toBe(true);
    expect(smartSearchMatch('كباب', 'کباب')).toBe(true);
  });

  it('matches a Persian-digit query against a latin-digit name', () => {
    expect(smartSearchMatch('نوشابه 500', '۵۰۰')).toBe(true);
  });

  it('treats 1/5 and 1.5 as the same token', () => {
    expect(smartSearchMatch('دوغ 1.5 لیتری', '1/5')).toBe(true);
  });

  it('returns false for a nullish product name with a real query', () => {
    expect(smartSearchMatch(null, 'کباب')).toBe(false);
    expect(smartSearchMatch(undefined, 'کباب')).toBe(false);
  });

  it('returns true for a nullish product name when the query is blank', () => {
    expect(smartSearchMatch(null, '')).toBe(true);
  });
});
