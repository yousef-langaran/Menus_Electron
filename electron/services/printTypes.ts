import { type ReceiptPriceDisplayUnit } from '../database/preferences';

export type ReceiptType = 'full' | 'kitchen';

/** قالب نسخه ۲ از طراح فیش (ردیف/ستون) */
export interface ReceiptLayoutV2 {
  version: 2;
  rows: ReceiptLayoutRow[];
}

export interface ReceiptLayoutRow {
  id: string;
  type: 'single' | 'columns';
  order: number;
  blocks: ReceiptLayoutModule[] | ReceiptLayoutModule[][];
  columnCount?: number;
  /** نسبت عرض ستون‌ها (مثلاً [2, 1]) */
  columnWidths?: number[];
}

export interface ReceiptLayoutModule {
  id: string;
  type: string;
  label: string;
  visible: boolean;
  order: number;
  options?: Record<string, unknown>;
}

export interface PrinterJob {
  name: string;
  displayName?: string;
  paperWidth?: number; // mm
  paperLength?: number; // mm
  margin?: number; // mm
  receiptType?: ReceiptType;
  copies?: number;
  /** عرض ناحیه چاپ قالب (mm) — اگر قالب سرور مقدار داده باشد */
  contentWidthMm?: number;
  /** فاصله خالی سمت راست کاغذ (mm) — اگر قالب سرور مقدار داده باشد */
  shiftLeftMm?: number;
  /** اگر قالب طراح (نسخه ۲) باشد، چاپ بر اساس layout انجام می‌شود */
  layout?: ReceiptLayoutV2 | ReceiptLayoutRow[];
}
export interface ReceiptTemplateOptions {
  paperWidth?: number;
  paperLength?: number;
  margin?: number;
  receiptNumber?: number;
  /** عرض واقعی ناحیه چاپ (mm) تا محتوا بریده نشود */
  contentWidthMm?: number;
  /** فاصله خالی سمت راست کاغذ (mm) تا محتوا به چپ برود — با margin-right در CSS */
  shiftLeftMm?: number;
  /** قالب طراح (نسخه ۲) برای پیش‌نمایش/چاپ هماهنگ با چاپ واقعی */
  layout?: ReceiptLayoutV2;
  /** برای پیش‌نمایش: رسید کامل یا آشپزخانه */
  receiptType?: ReceiptType;
  /** واحد نمایش مبلغ در متن رسید (پیش‌فرض از تنظیمات محلی) */
  priceDisplayUnit?: ReceiptPriceDisplayUnit;
}

export type PrinterStatusCode = 'PRINTER_READY' | 'PRINTER_OFFLINE';
export type PrintStatusCode = 'PRINT_OK' | 'PRINT_ERROR';
export type PrintErrorCode =
  | 'PRINT_NO_PRINTER_SELECTED'
  | 'PRINT_PRINTER_DISCOVERY_FAILED'
  | 'PRINT_PRINTER_NOT_FOUND'
  | 'PRINT_PRINTER_OFFLINE'
  | 'PRINT_PRINTER_BUSY'
  | 'PRINT_JOB_DROPPED'
  | 'PRINT_JOB_FAILED'
  | 'PRINT_UNKNOWN_ERROR';

export interface PrinterDiscoveryItem {
  name: string;
  displayName: string;
  description: string;
  statusCode: PrinterStatusCode;
}

export interface PrintFailureDetail {
  printerName: string;
  receiptType: ReceiptType;
  code: PrintErrorCode;
}

export class PrintOperationError extends Error {
  readonly code: PrintErrorCode;
  readonly details: PrintFailureDetail[];

  constructor(code: PrintErrorCode, details: PrintFailureDetail[] = []) {
    super(code);
    this.code = code;
    this.details = details;
  }
}

/**
 * قالب ذخیره‌شده گاهی آرایهٔ ردیف‌ها و گاهی شیء { version: 2, rows } است.
 * بدون این نرمال‌سازی، قالبِ گرفته‌شده از سرور در مسیر چاپ نادیده گرفته می‌شد و
 * رسید با طرح پیش‌فرض چاپ می‌شد.
 */
export function normalizeReceiptLayout(raw: unknown): ReceiptLayoutV2 | undefined {
  if (!raw) return undefined;
  if (Array.isArray(raw)) {
    return raw.length > 0 ? { version: 2, rows: raw as ReceiptLayoutRow[] } : undefined;
  }
  if (typeof raw === 'object') {
    const obj = raw as { version?: unknown; rows?: unknown };
    if (obj.version === 2 && Array.isArray(obj.rows) && obj.rows.length > 0) {
      return { version: 2, rows: obj.rows as ReceiptLayoutRow[] };
    }
  }
  return undefined;
}
