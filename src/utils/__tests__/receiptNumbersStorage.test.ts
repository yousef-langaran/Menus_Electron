import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getNextReceiptNumberBrowser,
  getReceiptNumbersMapFromStorage,
  saveReceiptNumbersToStorage,
} from '../receiptNumbersStorage';

const NEXT_NUMBER_KEY = 'menus-receipt-next-number';
const STORAGE_KEY = 'menus-receipt-numbers-map';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getNextReceiptNumberBrowser', () => {
  it('starts at 1 on a fresh install', () => {
    expect(getNextReceiptNumberBrowser()).toBe(1);
  });

  it('advances the counter so two receipts never share a number', () => {
    expect(getNextReceiptNumberBrowser()).toBe(1);
    expect(getNextReceiptNumberBrowser()).toBe(2);
    expect(getNextReceiptNumberBrowser()).toBe(3);
  });

  it('persists the next number for the following session', () => {
    getNextReceiptNumberBrowser();

    expect(localStorage.getItem(NEXT_NUMBER_KEY)).toBe('2');
  });

  it('resumes from a stored counter', () => {
    localStorage.setItem(NEXT_NUMBER_KEY, '42');

    expect(getNextReceiptNumberBrowser()).toBe(42);
    expect(localStorage.getItem(NEXT_NUMBER_KEY)).toBe('43');
  });

  it('recovers from a corrupted counter instead of returning NaN', () => {
    localStorage.setItem(NEXT_NUMBER_KEY, 'not-a-number');

    expect(getNextReceiptNumberBrowser()).toBe(1);
  });

  it('never issues a number below 1 even if the counter was tampered with', () => {
    localStorage.setItem(NEXT_NUMBER_KEY, '-5');

    expect(getNextReceiptNumberBrowser()).toBe(1);
  });

  it('falls back to 1 when localStorage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });

    expect(getNextReceiptNumberBrowser()).toBe(1);
  });
});

describe('getReceiptNumbersMapFromStorage', () => {
  it('returns an empty map when nothing is stored', () => {
    expect(getReceiptNumbersMapFromStorage()).toEqual({});
  });

  it('reads back a stored map', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ 'order-1': 7 }));

    expect(getReceiptNumbersMapFromStorage()).toEqual({ 'order-1': 7 });
  });

  it('returns an empty map for malformed JSON rather than throwing', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');

    expect(getReceiptNumbersMapFromStorage()).toEqual({});
  });

  it('drops entries whose value is not a receipt number', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ good: 3, bad: 'x', zero: 0, negative: -1 }),
    );

    expect(getReceiptNumbersMapFromStorage()).toEqual({ good: 3 });
  });

  it('returns an empty map when the stored value is not an object', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify('nope'));

    expect(getReceiptNumbersMapFromStorage()).toEqual({});
  });
});

describe('saveReceiptNumbersToStorage', () => {
  it('maps every supplied order key to the same receipt number', () => {
    saveReceiptNumbersToStorage(['order-1', 'order-2'], 5);

    expect(getReceiptNumbersMapFromStorage()).toEqual({ 'order-1': 5, 'order-2': 5 });
  });

  it('merges into the existing map instead of replacing it', () => {
    saveReceiptNumbersToStorage(['order-1'], 5);
    saveReceiptNumbersToStorage(['order-2'], 6);

    expect(getReceiptNumbersMapFromStorage()).toEqual({ 'order-1': 5, 'order-2': 6 });
  });

  it('overwrites the number for a key that is saved again', () => {
    saveReceiptNumbersToStorage(['order-1'], 5);
    saveReceiptNumbersToStorage(['order-1'], 9);

    expect(getReceiptNumbersMapFromStorage()).toEqual({ 'order-1': 9 });
  });

  it('ignores an empty key list', () => {
    saveReceiptNumbersToStorage([], 5);

    expect(getReceiptNumbersMapFromStorage()).toEqual({});
  });

  it('ignores an invalid receipt number', () => {
    saveReceiptNumbersToStorage(['order-1'], 0);

    expect(getReceiptNumbersMapFromStorage()).toEqual({});
  });

  it('skips blank keys inside an otherwise valid batch', () => {
    saveReceiptNumbersToStorage(['order-1', ''], 5);

    expect(getReceiptNumbersMapFromStorage()).toEqual({ 'order-1': 5 });
  });

  it('does not throw when localStorage rejects the write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    expect(() => saveReceiptNumbersToStorage(['order-1'], 5)).not.toThrow();
  });
});
