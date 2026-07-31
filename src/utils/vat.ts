/**
 * محاسبهٔ مالیات بر ارزش افزوده — آینهٔ دقیق منطق سرور
 * (`Menus_BE/src/common/utils/vat.ts`).
 *
 * ارزش افزوده هرگز روی قیمت نمایشی محصول اثر نمی‌گذارد؛ فقط هنگام تسویه روی
 * خطوطی که دستهٔ آن‌ها `hasVat` دارد محاسبه و به مبلغ قابل پرداخت افزوده
 * می‌شود. مبنا، مبلغ مشمولِ پس از کسر سهم تخفیف است.
 *
 * صندوق آفلاین هم به همین محاسبه نیاز دارد — رسید باید همان لحظه چاپ شود،
 * پس نمی‌توان منتظر پاسخ سرور ماند. هر تغییری اینجا باید در سرور و پنل وب هم
 * تکرار شود.
 */

/** نرخ پیش‌فرض ارزش افزوده (درصد) وقتی رستوران نرخی تنظیم نکرده باشد. */
export const DEFAULT_VAT_RATE = 10;

export interface VatLine {
  /** جمع مبلغ خط (قیمت واحد × تعداد) به ریال */
  lineTotal: number;
  /** آیا دستهٔ این خط مشمول ارزش افزوده است؟ */
  hasVat: boolean;
}

export function resolveVatRate(vatRate?: number | null): number {
  if (vatRate === null || vatRate === undefined) return DEFAULT_VAT_RATE;
  const rate = Number(vatRate);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) return DEFAULT_VAT_RATE;
  return rate;
}

export function calculateVatAmount(
  lines: VatLine[],
  orderSubtotal: number,
  discountAmount: number,
  vatRate?: number | null,
): number {
  const rate = resolveVatRate(vatRate);
  if (rate <= 0) return 0;

  const linesTotal = lines.reduce(
    (sum, line) => sum + (Number(line.lineTotal) || 0),
    0,
  );
  const eligibleTotal = lines.reduce(
    (sum, line) => sum + (line.hasVat ? Number(line.lineTotal) || 0 : 0),
    0,
  );
  if (linesTotal <= 0 || eligibleTotal <= 0) return 0;

  const subtotal = Number(orderSubtotal) || 0;
  const discount = Math.min(Math.max(Number(discountAmount) || 0, 0), subtotal);
  const netPayable = Math.max(0, subtotal - discount);

  return Math.round((netPayable * (eligibleTotal / linesTotal) * rate) / 100);
}
