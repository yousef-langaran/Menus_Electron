import { describe, it, expect } from 'vitest';
import { normalizeIranMobile, isValidIranMobile, sanitizeMobileInput } from '../iranMobile';

describe('normalizeIranMobile', () => {
  it('leaves an already normalised number alone', () => {
    expect(normalizeIranMobile('09121234567')).toBe('09121234567');
  });

  it.each([
    ['00989121234567', '09121234567'],
    ['+989121234567', '09121234567'],
    ['989121234567', '09121234567'],
    ['9121234567', '09121234567'],
  ])('normalises the %s prefix form', (input, expected) => {
    expect(normalizeIranMobile(input)).toBe(expected);
  });

  it('converts Persian and Arabic digits', () => {
    expect(normalizeIranMobile('۰۹۱۲۱۲۳۴۵۶۷')).toBe('09121234567');
    expect(normalizeIranMobile('٠٩١٢١٢٣٤٥٦٧')).toBe('09121234567');
  });

  it('strips separators typed by the user', () => {
    expect(normalizeIranMobile('0912-123-4567')).toBe('09121234567');
    expect(normalizeIranMobile('0912 123 4567')).toBe('09121234567');
    expect(normalizeIranMobile('(0912) 1234567')).toBe('09121234567');
  });

  it('returns an empty string for nullish input', () => {
    expect(normalizeIranMobile(null as unknown as string)).toBe('');
    expect(normalizeIranMobile('')).toBe('');
  });

  it('does not prefix a 9-leading number of the wrong length', () => {
    expect(normalizeIranMobile('912123456')).toBe('912123456');
  });
});

describe('isValidIranMobile', () => {
  it.each([
    '09121234567',
    '+989121234567',
    '00989121234567',
    '9121234567',
    '۰۹۱۲۱۲۳۴۵۶۷',
    '0912-123-4567',
    '09351234567',
  ])('accepts %s', (input) => {
    expect(isValidIranMobile(input)).toBe(true);
  });

  it.each([
    ['', 'empty'],
    ['0912123456', 'one digit short'],
    ['091212345678', 'one digit too long'],
    ['08121234567', 'does not start with 09'],
    ['02112345678', 'a landline'],
    ['abcdefghijk', 'not numeric'],
  ])('rejects %s (%s)', (input) => {
    expect(isValidIranMobile(input)).toBe(false);
  });
});

describe('sanitizeMobileInput', () => {
  it('keeps only digits', () => {
    expect(sanitizeMobileInput('0912-123-4567')).toBe('09121234567');
    expect(sanitizeMobileInput('+98 912 1234567')).toBe('989121234567'.slice(0, 11));
  });

  it('converts Persian digits before filtering', () => {
    expect(sanitizeMobileInput('۰۹۱۲۱۲۳۴۵۶۷')).toBe('09121234567');
  });

  it('caps the value at 11 characters so the field cannot overflow', () => {
    expect(sanitizeMobileInput('091212345679999')).toBe('09121234567');
  });

  it('returns an empty string when there is no digit at all', () => {
    expect(sanitizeMobileInput('abc')).toBe('');
  });
});
