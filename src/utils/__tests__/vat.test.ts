import { describe, it, expect } from 'vitest';
import {
  DEFAULT_VAT_RATE,
  resolveVatRate,
  calculateVatAmount,
  type VatLine,
} from '../vat';

const line = (lineTotal: number, hasVat: boolean): VatLine => ({ lineTotal, hasVat });

describe('resolveVatRate', () => {
  it('falls back to the default when no rate is configured', () => {
    expect(resolveVatRate(null)).toBe(DEFAULT_VAT_RATE);
    expect(resolveVatRate(undefined)).toBe(DEFAULT_VAT_RATE);
  });

  it('accepts a configured rate inside the valid range', () => {
    expect(resolveVatRate(9)).toBe(9);
    expect(resolveVatRate(0)).toBe(0);
    expect(resolveVatRate(100)).toBe(100);
  });

  it('rejects an out-of-range rate rather than applying it', () => {
    expect(resolveVatRate(-1)).toBe(DEFAULT_VAT_RATE);
    expect(resolveVatRate(101)).toBe(DEFAULT_VAT_RATE);
  });

  it('rejects a non-numeric rate', () => {
    expect(resolveVatRate(NaN)).toBe(DEFAULT_VAT_RATE);
    expect(resolveVatRate('abc' as unknown as number)).toBe(DEFAULT_VAT_RATE);
  });

  it('accepts a numeric string, as it may arrive from settings storage', () => {
    expect(resolveVatRate('9' as unknown as number)).toBe(9);
  });
});

describe('calculateVatAmount', () => {
  it('returns 0 when the resolved rate is zero', () => {
    expect(calculateVatAmount([line(100_000, true)], 100_000, 0, 0)).toBe(0);
  });

  it('returns 0 when no line is VAT-eligible', () => {
    expect(calculateVatAmount([line(100_000, false)], 100_000, 0, 10)).toBe(0);
  });

  it('returns 0 for an empty basket', () => {
    expect(calculateVatAmount([], 0, 0, 10)).toBe(0);
  });

  it('charges the full rate when every line is eligible', () => {
    expect(calculateVatAmount([line(100_000, true)], 100_000, 0, 10)).toBe(10_000);
  });

  it('charges VAT only on the eligible share of a mixed basket', () => {
    // 60,000 of 100,000 is eligible → 10% of 60,000
    const lines = [line(60_000, true), line(40_000, false)];

    expect(calculateVatAmount(lines, 100_000, 0, 10)).toBe(6_000);
  });

  it('applies the discount before computing VAT', () => {
    // net payable 80,000, all eligible → 8,000
    expect(calculateVatAmount([line(100_000, true)], 100_000, 20_000, 10)).toBe(8_000);
  });

  it('spreads the discount proportionally across a mixed basket', () => {
    // net payable 80,000 × eligible share 0.6 × 10%
    const lines = [line(60_000, true), line(40_000, false)];

    expect(calculateVatAmount(lines, 100_000, 20_000, 10)).toBe(4_800);
  });

  it('clamps a discount larger than the subtotal instead of going negative', () => {
    expect(calculateVatAmount([line(100_000, true)], 100_000, 500_000, 10)).toBe(0);
  });

  it('ignores a negative discount', () => {
    expect(calculateVatAmount([line(100_000, true)], 100_000, -50_000, 10)).toBe(10_000);
  });

  it('uses the default rate when the restaurant has configured none', () => {
    expect(calculateVatAmount([line(100_000, true)], 100_000, 0)).toBe(
      (100_000 * DEFAULT_VAT_RATE) / 100,
    );
  });

  it('rounds to whole Rials — receipts must not carry fractions', () => {
    // 33,333 × 9% = 2,999.97
    expect(calculateVatAmount([line(33_333, true)], 33_333, 0, 9)).toBe(3_000);
  });

  it('treats a non-numeric lineTotal as zero rather than producing NaN', () => {
    const lines = [
      { lineTotal: 'abc' as unknown as number, hasVat: true },
      line(100_000, true),
    ];

    expect(calculateVatAmount(lines, 100_000, 0, 10)).toBe(10_000);
  });

  it('returns 0 when the lines add up to nothing', () => {
    expect(calculateVatAmount([line(0, true)], 0, 0, 10)).toBe(0);
  });

  it('bases VAT on the order subtotal, not the sum of the lines', () => {
    // Lines only decide the eligible *ratio*; the money comes from the subtotal.
    const lines = [line(50_000, true), line(50_000, false)];

    expect(calculateVatAmount(lines, 200_000, 0, 10)).toBe(10_000);
  });
});
