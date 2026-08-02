import { describe, it, expect } from 'vitest';
import {
  stripNumberFormatting,
  formatPriceInput,
  parseFormattedNumber,
} from '../money';

describe('stripNumberFormatting', () => {
  it('returns an empty string for nullish input', () => {
    expect(stripNumberFormatting(null)).toBe('');
    expect(stripNumberFormatting(undefined)).toBe('');
  });

  it('converts Persian digits to ASCII', () => {
    expect(stripNumberFormatting('۱۲۳۴۵')).toBe('12345');
  });

  it('converts Arabic-Indic digits to ASCII', () => {
    expect(stripNumberFormatting('١٢٣٤٥')).toBe('12345');
  });

  it('drops latin commas, Persian thousands marks and whitespace', () => {
    expect(stripNumberFormatting('1,234,567')).toBe('1234567');
    expect(stripNumberFormatting('1٬234٬567')).toBe('1234567');
    expect(stripNumberFormatting(' 1 234 ')).toBe('1234');
  });

  it('strips currency words and stray symbols but keeps sign and decimal point', () => {
    expect(stripNumberFormatting('12500 تومان')).toBe('12500');
    expect(stripNumberFormatting('-12.5ریال')).toBe('-12.5');
  });

  it('handles a numeric input as well as a string', () => {
    expect(stripNumberFormatting(12500)).toBe('12500');
  });
});

describe('formatPriceInput', () => {
  it('returns an empty string when there is nothing numeric to show', () => {
    expect(formatPriceInput('')).toBe('');
    expect(formatPriceInput('تومان')).toBe('');
    expect(formatPriceInput(null)).toBe('');
  });

  it('groups thousands with commas', () => {
    expect(formatPriceInput('1234567')).toBe('1,234,567');
    expect(formatPriceInput(1000)).toBe('1,000');
  });

  it('leaves numbers below one thousand ungrouped', () => {
    expect(formatPriceInput('999')).toBe('999');
  });

  it('keeps the decimal part untouched', () => {
    expect(formatPriceInput('1234.56')).toBe('1,234.56');
  });

  it('preserves a leading minus sign', () => {
    expect(formatPriceInput('-1234567')).toBe('-1,234,567');
  });

  // While typing, the field may legitimately hold just a sign or a dot; the
  // formatter must not swallow those or the caret jumps.
  it.each(['-', '.', '-.'])('passes the in-progress input %p straight through', (partial) => {
    expect(formatPriceInput(partial)).toBe(partial);
  });

  it('re-formats an already formatted value idempotently', () => {
    expect(formatPriceInput(formatPriceInput('1234567'))).toBe('1,234,567');
  });

  it('formats Persian digits after normalising them', () => {
    expect(formatPriceInput('۱۲۳۴۵۶۷')).toBe('1,234,567');
  });
});

describe('parseFormattedNumber', () => {
  it('parses a comma-grouped amount', () => {
    expect(parseFormattedNumber('1,234,567')).toBe(1234567);
  });

  it('parses Persian digits', () => {
    expect(parseFormattedNumber('۱۲٬۵۰۰')).toBe(12500);
  });

  it('parses a negative amount', () => {
    expect(parseFormattedNumber('-1,500')).toBe(-1500);
  });

  it('parses a decimal amount', () => {
    expect(parseFormattedNumber('1,234.5')).toBe(1234.5);
  });

  // A price field must never propagate NaN into an order total.
  it.each(['', 'abc', null, undefined, '-', '.'])(
    'falls back to 0 for the unusable input %p',
    (input) => {
      expect(parseFormattedNumber(input)).toBe(0);
    },
  );

  it('round-trips through formatPriceInput without drift', () => {
    expect(parseFormattedNumber(formatPriceInput(9876543))).toBe(9876543);
  });
});
