import type { PrinterConfig, ReceiptConfig } from '../store/printerSettingsStore';

/** اسنپ‌شات قالب چاپ که از سرور گرفته و در تنظیمات محلی ذخیره شده است */
export interface PrintTemplateSnapshot {
  id: number;
  name: string;
  receiptType?: 'full' | 'kitchen';
  paperWidth?: number;
  paperLength?: number;
  margin?: number;
  contentWidthMm?: number | null;
  shiftLeftMm?: number | null;
  /** یا آرایهٔ ردیف‌ها (شکل قدیمی) یا شیء نسخه ۲ */
  layout?: unknown;
}

export interface ReceiptLayoutV2 {
  version: 2;
  rows: any[];
}

/**
 * سرور layout را گاهی به‌صورت آرایهٔ ردیف‌ها و گاهی به‌صورت { version: 2, rows }
 * برمی‌گرداند. مسیر چاپ فقط شکل نسخه ۲ را می‌شناسد، پس همیشه نرمال می‌کنیم تا
 * قالب انتخاب‌شده در چاپ نادیده گرفته نشود.
 */
export function normalizeTemplateLayout(raw: unknown): ReceiptLayoutV2 | undefined {
  if (!raw) return undefined;
  if (Array.isArray(raw)) {
    return raw.length > 0 ? { version: 2, rows: raw } : undefined;
  }
  if (typeof raw === 'object') {
    const obj = raw as { version?: unknown; rows?: unknown };
    if (obj.version === 2 && Array.isArray(obj.rows) && obj.rows.length > 0) {
      return { version: 2, rows: obj.rows };
    }
  }
  return undefined;
}

/** کلید نگاشت قالب‌ها — باید با `printTemplateKey` در لایهٔ الکترون یکی بماند */
export function printTemplateKey(printerName: string, receiptType?: ReceiptConfig['type']): string {
  return receiptType ? `${printerName}::${receiptType}` : printerName;
}

/**
 * قالب مؤثر برای یک رسیدِ مشخص از یک پرینتر، به ترتیب اولویت:
 * ۱) قالب همان رسید از همان پرینتر (مثلاً «رسید آشپزخانهٔ POS-1»)
 * ۲) قالب کلی همان پرینتر
 * ۳) قالب پیش‌فرض برنامه
 * در هر سطح، مقدار `null` یعنی «بدون قالب» و جست‌وجو همان‌جا متوقف می‌شود.
 */
export function resolveTemplateForPrinter(
  printerName: string,
  templatesMap: Record<string, PrintTemplateSnapshot | null> | null | undefined,
  defaultTemplate: PrintTemplateSnapshot | null | undefined,
  receiptType?: ReceiptConfig['type'],
): PrintTemplateSnapshot | null {
  const keys = receiptType
    ? [printTemplateKey(printerName, receiptType), printerName]
    : [printerName];
  for (const key of keys) {
    if (templatesMap && Object.prototype.hasOwnProperty.call(templatesMap, key)) {
      return templatesMap[key] ?? null;
    }
  }
  return defaultTemplate ?? null;
}

export interface BuiltPrinterJob {
  name: string;
  displayName?: string;
  paperWidth: number;
  paperLength: number;
  margin: number;
  receiptType: ReceiptConfig['type'];
  copies: number;
  contentWidthMm?: number;
  shiftLeftMm?: number;
  layout?: ReceiptLayoutV2;
}

/**
 * ساخت job‌های چاپ برای پرینترهای انتخاب‌شده. هر رسید قالب خودش را می‌گیرد؛
 * پس یک پرینتر می‌تواند رسید کامل و رسید آشپزخانه را با دو قالب متفاوت چاپ کند.
 */
export function buildPrinterJobs(
  printers: PrinterConfig[],
  getPrinterReceipts: (printerName: string) => ReceiptConfig[],
  templatesMap: Record<string, PrintTemplateSnapshot | null> | null | undefined,
  defaultTemplate: PrintTemplateSnapshot | null | undefined,
): BuiltPrinterJob[] {
  return printers.flatMap((printer) => {
    return getPrinterReceipts(printer.name)
      .filter((r) => r.enabled)
      .map((receipt) => {
        const template = resolveTemplateForPrinter(
          printer.name,
          templatesMap,
          defaultTemplate,
          receipt.type,
        );
        const layout = normalizeTemplateLayout(template?.layout);
        const job: BuiltPrinterJob = {
          name: printer.name,
          displayName: printer.displayName,
          paperWidth: template?.paperWidth ?? printer.paperWidth,
          paperLength: template?.paperLength ?? printer.paperLength,
          margin: template?.margin ?? printer.margin,
          receiptType: receipt.type,
          copies: receipt.copies,
        };
        if (typeof template?.contentWidthMm === 'number') job.contentWidthMm = template.contentWidthMm;
        if (typeof template?.shiftLeftMm === 'number') job.shiftLeftMm = template.shiftLeftMm;
        if (layout) job.layout = layout;
        return job;
      });
  });
}

/** خواندن هم‌زمان نگاشت قالب‌ها و قالب پیش‌فرض از لایهٔ الکترون */
export async function loadPrintTemplateSources(): Promise<{
  templatesMap: Record<string, PrintTemplateSnapshot | null>;
  defaultTemplate: PrintTemplateSnapshot | null;
}> {
  const [templatesMap, defaultTemplate] = await Promise.all([
    (window.electronAPI?.getPrintTemplatesMap?.() ?? Promise.resolve({})) as Promise<
      Record<string, PrintTemplateSnapshot | null>
    >,
    (window.electronAPI?.getDefaultPrintTemplate?.() ?? Promise.resolve(null)) as Promise<PrintTemplateSnapshot | null>,
  ]);
  return { templatesMap: templatesMap ?? {}, defaultTemplate: defaultTemplate ?? null };
}
