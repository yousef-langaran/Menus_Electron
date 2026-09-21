import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { BrowserWindow } from 'electron';
import type { PrinterInfo } from 'electron';
import {
  getNextReceiptNumber,
  getReceiptNumbersMap,
  setReceiptNumbersForOrder,
  loadReceiptPriceDisplayUnit,
  type ReceiptPriceDisplayUnit,
} from '../database/preferences';

/** نگهداری تنظیمات چاپ پنجرهٔ پیش‌نمایش برای استفاده در IPC */
export const printPreviewOptsMap = new Map<number, any>();

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

interface ReceiptLayoutModule {
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

interface ReceiptTemplateOptions {
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

const mmToMicrons = (value: number) => Math.max(1, Math.round(value * 1000));

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

type RawPrinter = {
  name?: string;
  displayName?: string;
  description?: string;
  status?: unknown;
  options?: Record<string, unknown>;
};

const toRawPrinter = (printer: PrinterInfo): RawPrinter => ({
  name: printer.name,
  displayName: printer.displayName,
  description: printer.description,
  status: printer.status,
  options: printer.options as unknown as Record<string, unknown> | undefined,
});

const printerQueueChains = new Map<string, Promise<void>>();
const printerQueueSizes = new Map<string, number>();
const PRINTER_QUEUE_MAX_PENDING = 20;

// Global print queue: serializes ALL print operations across all printers to prevent
// race conditions when multiple BrowserWindows access Electron's printing subsystem.
let globalPrintChain: Promise<void> = Promise.resolve();
const globalPrintLock = async <T>(task: () => Promise<T>): Promise<T> => {
  const previous = globalPrintChain;
  const runTask = previous.catch(() => undefined).then(task);
  globalPrintChain = runTask.then(() => undefined, () => undefined);
  return runTask;
};

// Prevents stuck print jobs from blocking the queue forever.
const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, errorMsg: string): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(errorMsg)), timeoutMs)),
  ]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const toStatusText = (raw: RawPrinter): string => {
  const fields = [raw.status, raw.options?.['printer-state'], raw.options?.['printer-state-message']];
  return fields
    .filter((value) => value != null)
    .map((value) => String(value).toLowerCase())
    .join(' ');
};

const inferPrinterStatusCode = (raw: RawPrinter): PrinterStatusCode => {
  const statusText = toStatusText(raw);
  if (statusText.includes('offline') || statusText.includes('stopped') || statusText.includes('unavailable')) {
    return 'PRINTER_OFFLINE';
  }
  return 'PRINTER_READY';
};

const mapFailureReasonToCode = (failureReason?: string): PrintErrorCode => {
  const text = String(failureReason || '').toLowerCase();
  if (text.includes('offline') || text.includes('unavailable')) {
    return 'PRINT_PRINTER_OFFLINE';
  }
  if (text.includes('dropped') || text.includes('cancel') || text.includes('aborted')) {
    return 'PRINT_JOB_DROPPED';
  }
  return 'PRINT_JOB_FAILED';
};

const enqueuePrinterTask = async <T>(printerName: string, task: () => Promise<T>): Promise<T> => {
  const pending = printerQueueSizes.get(printerName) ?? 0;
  if (pending >= PRINTER_QUEUE_MAX_PENDING) {
    throw new PrintOperationError('PRINT_PRINTER_BUSY', []);
  }
  printerQueueSizes.set(printerName, pending + 1);
  const previous = printerQueueChains.get(printerName) ?? Promise.resolve();
  const runTask = previous.catch(() => undefined).then(task);
  const queueTail = runTask.then(() => undefined, () => undefined).finally(() => {
    if (printerQueueChains.get(printerName) === queueTail) {
      printerQueueChains.delete(printerName);
    }
    const current = printerQueueSizes.get(printerName) ?? 1;
    if (current <= 1) {
      printerQueueSizes.delete(printerName);
    } else {
      printerQueueSizes.set(printerName, current - 1);
    }
  });
  printerQueueChains.set(printerName, queueTail);
  return runTask;
};

const createPrintWindow = () =>
  new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

export async function detectPrinters(): Promise<PrinterDiscoveryItem[]> {
  const tempWindow = createPrintWindow();
  try {
    await tempWindow.loadURL('data:text/html,<html><body></body></html>');
    let printers: RawPrinter[] = [];
    if (typeof tempWindow.webContents.getPrintersAsync === 'function') {
      printers = (await tempWindow.webContents.getPrintersAsync()).map(toRawPrinter);
    } else if (typeof (tempWindow.webContents as any).getPrinters === 'function') {
      printers = (tempWindow.webContents as any).getPrinters() as RawPrinter[];
    }
    const mapped = printers
      .map((rawPrinter) => ({
      name: rawPrinter.name || '',
      displayName: rawPrinter.displayName || rawPrinter.name || '',
      description: rawPrinter.description || '',
      statusCode: inferPrinterStatusCode(rawPrinter),
      }))
      .filter((printer) => Boolean(printer.name));

    const unique = new Map<string, PrinterDiscoveryItem>();
    for (const printer of mapped) {
      if (!unique.has(printer.name)) {
        unique.set(printer.name, printer);
      }
    }
    return [...unique.values()];
  } catch {
    throw new PrintOperationError('PRINT_PRINTER_DISCOVERY_FAILED');
  } finally {
    if (!tempWindow.isDestroyed()) {
      tempWindow.close();
    }
  }
}

// ─── باز کردن کشوی پول (Drawer Kick) ──────────────────────────────────────
//
// چاپ رسید در این فایل کاملاً از طریق webContents.print روی HTML رندرشده انجام
// می‌شود (مسیر GDI/Chromium کرومیوم) — این مسیر هیچ راهی برای عبور بایت‌های خام
// ESC/POS به پرینتر ندارد (کرومیوم همیشه محتوا را rasterize می‌کند). برای پالس
// واقعی کشو باید بایت‌های خام مستقیماً و بدون واسطهٔ رندر HTML به پرینتر نوشته
// شوند — بدون افزودن یک وابستگی native جدید (که نیاز به electron-rebuild و خطر
// شکستن بیلد نصبی دارد)، این کار با ابزارهای همیشه-موجود سیستم‌عامل انجام می‌شود:
//   - ویندوز: یک پاور‌شل مخفی (بدون پنجره) که با Add-Type یک تایپ C# کوچک را
//     P/Invoke می‌کند تا با winspool.drv مستقیماً یک Job با datatype «RAW» باز/
//     بنویسد/ببندد — همان API استانداردی که تقریباً هر درایور پرینتر رسید حرارتی
//     (ESC/POS) در ویندوز از آن پشتیبانی می‌کند.
//   - لینوکس/مک: نوشتن بایت‌ها در یک فایل موقت و ارسال آن با `lp -o raw` (چاپ
//     خام CUPS) — تکنیک استاندارد و مستند برای همین منظور.
// هر دو مسیر کاملاً silent هستند (بدون دیالوگ)، هم‌راستا با الگوی چاپ بی‌صدای
// همین فایل.
const DRAWER_KICK_ESC_POS = Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]);

function runHidden(command: string, args: string[], input?: Buffer): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve) => {
    try {
      const child = spawn(command, args, { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
      let stderr = '';
      child.stderr?.on('data', (chunk) => { stderr += String(chunk); });
      child.on('error', (err) => resolve({ code: -1, stderr: String(err?.message || err) }));
      child.on('close', (code) => resolve({ code, stderr }));
      if (input) child.stdin?.end(input);
      else child.stdin?.end();
    } catch (err: any) {
      resolve({ code: -1, stderr: String(err?.message || err) });
    }
  });
}

/** اسکریپت پاورشل: P/Invoke به winspool.drv برای نوشتن بایت خام روی یک پرینتر نصب‌شدهٔ ویندوز (RAW datatype) */
function buildWinspoolRawWriteScript(printerName: string, hexBytes: string): string {
  const escapedPrinterName = printerName.replace(/'/g, "''");
  return `
$ErrorActionPreference = 'Stop'
Add-Type -Namespace RawPrinterHelper -Name Winspool -MemberDefinition @'
[StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
public struct DOCINFOA {
  [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
  [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
  [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
}
[DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true)]
public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);
[DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true)]
public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In] ref DOCINFOA di);
[DllImport("winspool.Drv", SetLastError=true)]
public static extern bool StartPagePrinter(IntPtr hPrinter);
[DllImport("winspool.Drv", SetLastError=true)]
public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);
[DllImport("winspool.Drv", SetLastError=true)]
public static extern bool EndPagePrinter(IntPtr hPrinter);
[DllImport("winspool.Drv", SetLastError=true)]
public static extern bool EndDocPrinter(IntPtr hPrinter);
[DllImport("winspool.Drv", SetLastError=true)]
public static extern bool ClosePrinter(IntPtr hPrinter);
'@

$bytesHex = '${hexBytes}'
$bytes = [byte[]] -split ($bytesHex -replace '..', '$0 ') | Where-Object { $_ -ne '' } | ForEach-Object { [Convert]::ToByte($_, 16) }
$hPrinter = [IntPtr]::Zero
if (-not [RawPrinterHelper.Winspool]::OpenPrinter('${escapedPrinterName}', [ref]$hPrinter, [IntPtr]::Zero)) {
  Write-Error 'OpenPrinter failed'
  exit 1
}
try {
  $di = New-Object RawPrinterHelper.Winspool+DOCINFOA
  $di.pDocName = 'Secoin Cash Drawer Kick'
  $di.pDataType = 'RAW'
  if (-not [RawPrinterHelper.Winspool]::StartDocPrinter($hPrinter, 1, [ref]$di)) { Write-Error 'StartDocPrinter failed'; exit 1 }
  try {
    if (-not [RawPrinterHelper.Winspool]::StartPagePrinter($hPrinter)) { Write-Error 'StartPagePrinter failed'; exit 1 }
    $ptr = [System.Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)
    try {
      [System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $ptr, $bytes.Length)
      $written = 0
      if (-not [RawPrinterHelper.Winspool]::WritePrinter($hPrinter, $ptr, $bytes.Length, [ref]$written)) { Write-Error 'WritePrinter failed'; exit 1 }
    } finally {
      [System.Runtime.InteropServices.Marshal]::FreeHGlobal($ptr)
    }
    [RawPrinterHelper.Winspool]::EndPagePrinter($hPrinter) | Out-Null
  } finally {
    [RawPrinterHelper.Winspool]::EndDocPrinter($hPrinter) | Out-Null
  }
} finally {
  [RawPrinterHelper.Winspool]::ClosePrinter($hPrinter) | Out-Null
}
`;
}

/**
 * پالس باز کردن کشوی پول — روی همان پرینتری که کشو به آن وصل است (اکثراً پرینتر
 * فیش کامل). فراخوان باید silent باشد و هرگز دیالوگ سیستم‌عامل باز نکند.
 */
export async function openCashDrawer(printerName: string): Promise<{ success: boolean; error?: string }> {
  if (!printerName || !printerName.trim()) {
    return { success: false, error: 'DRAWER_NO_PRINTER_SELECTED' };
  }

  try {
    if (process.platform === 'win32') {
      const hex = DRAWER_KICK_ESC_POS.toString('hex');
      const script = buildWinspoolRawWriteScript(printerName, hex);
      const result = await runHidden('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-Command', script,
      ]);
      if (result.code === 0) return { success: true };
      return { success: false, error: result.stderr?.trim() || `DRAWER_KICK_FAILED (exit ${result.code})` };
    }

    // لینوکس/مک: چاپ خام CUPS
    const tmpFile = path.join(os.tmpdir(), `secoin-drawer-kick-${Date.now()}.bin`);
    await fs.promises.writeFile(tmpFile, DRAWER_KICK_ESC_POS);
    try {
      const result = await runHidden('lp', ['-d', printerName, '-o', 'raw', tmpFile]);
      if (result.code === 0) return { success: true };
      return { success: false, error: result.stderr?.trim() || `DRAWER_KICK_FAILED (exit ${result.code})` };
    } finally {
      fs.promises.unlink(tmpFile).catch(() => {});
    }
  } catch (error: any) {
    return { success: false, error: String(error?.message || error) };
  }
}

const printCopyWithRetry = async (
  printWindow: BrowserWindow,
  printOptions: Record<string, unknown>,
  printerName: string,
  receiptType: ReceiptType
): Promise<void> => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await withTimeout(
        new Promise<void>((resolve, reject) => {
          printWindow.webContents.print(
            printOptions as any,
            (success: boolean, failureReason: string) => {
              if (success) {
                console.log(`[PRINT] ✓ Print success: "${printerName}" (${receiptType})`);
                resolve();
              } else {
                console.error(`[PRINT] ✗ Print failed: "${printerName}" (${receiptType}), reason: ${failureReason}`);
                reject(new PrintOperationError(mapFailureReasonToCode(failureReason), []));
              }
            }
          );
        }),
        30000,
        `Print timeout after 30s for printer "${printerName}"`
      );
      return;
    } catch (error) {
      if (attempt === 2) {
        console.error(`[PRINT] ✗ All retries exhausted for "${printerName}" (${receiptType})`, error);
        throw error instanceof PrintOperationError
          ? error
          : new PrintOperationError('PRINT_JOB_FAILED');
      }
      console.warn(`[PRINT] Retry ${attempt + 1} failed for "${printerName}", waiting 600ms before retry...`);
      await sleep(600);
    }
  }
};

const runPrinterJobs = async (
  orderData: any,
  printerName: string,
  jobs: PrinterJob[],
  receiptNumber: number
): Promise<PrintFailureDetail[]> => {
  console.log(`[PRINT] Starting runPrinterJobs for "${printerName}", ${jobs.length} job(s), receipt #${receiptNumber}`);
  const printWindow = createPrintWindow();
  const failures: PrintFailureDetail[] = [];
  const defaultConfig = jobs[0];
  const margin = defaultConfig?.margin ?? 5;
  const marginSame = 5;
  const marginTop = 0;
  const marginBottom = 3;
  const priceDisplayUnit = await loadReceiptPriceDisplayUnit();

  try {
    for (const job of jobs) {
      const receiptType = job.receiptType || 'full';
      console.log(`[PRINT] Processing job: "${printerName}" (${receiptType})`);
      try {
        const refresh = await detectPrinters();
        const current = refresh.find((printer) => printer.name === printerName);
        if (!current) {
          console.error(`[PRINT] ✗ Printer not found: "${printerName}"`);
          throw new PrintOperationError('PRINT_PRINTER_NOT_FOUND', []);
        }
        if (current.statusCode === 'PRINTER_OFFLINE') {
          console.error(`[PRINT] ✗ Printer offline: "${printerName}"`);
          throw new PrintOperationError('PRINT_PRINTER_OFFLINE', []);
        }
        const paperWidth = job.paperWidth ?? defaultConfig?.paperWidth ?? 80;
        const isNarrow = paperWidth <= 62;
        const shiftLeftMm = typeof job.shiftLeftMm === 'number' ? job.shiftLeftMm : isNarrow ? 4 : 6;
        const contentWidthMm =
          typeof job.contentWidthMm === 'number'
            ? job.contentWidthMm
            : Math.max(32, paperWidth - marginSame * 2 - shiftLeftMm);
        const opts = {
          paperWidth,
          margin,
          receiptNumber,
          contentWidthMm,
          shiftLeftMm,
          receiptType,
          priceDisplayUnit,
        };
        const layout = normalizeReceiptLayout(job.layout);
        const receiptHTML = layout
          ? generateReceiptHTMLFromLayout(orderData, layout, opts)
          : receiptType === 'kitchen'
            ? generateKitchenReceiptHTML(orderData, opts)
            : generateReceiptHTML(orderData, opts);

        console.log(`[PRINT] Loading HTML for "${printerName}" (${receiptType}), length: ${receiptHTML.length} chars`);
        await withTimeout(
          printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(receiptHTML)}`),
          10000,
          `HTML load timeout for printer "${printerName}"`
        );
        await sleep(1000);

        const width = mmToMicrons(paperWidth);
        const height = mmToMicrons(job.paperLength ?? 200);
        const copies = Math.max(1, Math.floor(job.copies ?? 1));

        try {
          await printWindow.webContents.executeJavaScript(`
            document.documentElement.style.setProperty('--paper-width', '${paperWidth.toFixed(2)}mm');
            document.documentElement.style.setProperty('--printable-width', '${contentWidthMm.toFixed(2)}mm');
            document.documentElement.style.setProperty('--content-padding', '2mm');
          `);
        } catch {
          // ignore style mutation failures
        }

        for (let copyIndex = 0; copyIndex < copies; copyIndex += 1) {
          console.log(`[PRINT] Printing copy ${copyIndex + 1}/${copies} for "${printerName}" (${receiptType})`);
          await printCopyWithRetry(printWindow, {
            silent: true,
            printBackground: true,
            deviceName: printerName,
            copies: 1,
            margins: {
              marginType: 'custom',
              top: marginTop,
              bottom: marginBottom,
              left: marginSame,
              right: marginSame,
            } as any,
            pageSize: {
              width,
              height,
            },
          }, printerName, receiptType);
          await sleep(300);
        }
        console.log(`[PRINT] ✓ Job completed: "${printerName}" (${receiptType})`);
      } catch (error) {
        const code = error instanceof PrintOperationError ? error.code : 'PRINT_UNKNOWN_ERROR';
        console.error(`[PRINT] ✗ Job failed: "${printerName}" (${receiptType}), code: ${code}`, error);
        failures.push({ printerName, receiptType, code });
      }
    }
  } finally {
    if (!printWindow.isDestroyed()) {
      printWindow.close();
    }
  }

  return failures;
};

export async function printReceipt(
  orderData: any,
  printerJobs: PrinterJob[],
  orderKeys?: string | string[]
): Promise<number> {
  const orderNumber = orderData?.orderNumber || orderData?.order_number || orderData?.id || 'N/A';
  console.log(`[PRINT] ===== Starting print job for order #${orderNumber} =====`);
  console.log(`[PRINT] Total printer jobs: ${printerJobs.length}`);
  
  if (!printerJobs || printerJobs.length === 0) {
    console.error('[PRINT] ✗ No printers selected');
    throw new PrintOperationError('PRINT_NO_PRINTER_SELECTED');
  }

  const detectedPrinters = await detectPrinters();
  console.log(`[PRINT] Detected ${detectedPrinters.length} printer(s):`, detectedPrinters.map(p => `${p.name} (${p.statusCode})`).join(', '));
  const discoveredMap = new Map(detectedPrinters.map((printer) => [printer.name, printer]));

  let keys: string[] = Array.isArray(orderKeys) ? [...orderKeys] : orderKeys ? [orderKeys] : [];
  if (!keys.length && orderData && (orderData.id != null || orderData.orderNumber)) {
    keys = [String(orderData.id), orderData.orderNumber].filter(Boolean);
  }
  // اگر بک‌اند شماره فراخوانی داده (سفارش آنلاین)، همان را برای چاپ و ذخیره استفاده کن
  // در چاپ مجدد: اگر کلید سفارش قبلاً شماره داشت همان را استفاده کن (شماره جدید تولید نشود)
  const storedMap = keys.length > 0 ? getReceiptNumbersMap() : {};
  const existingReceiptNumber = keys.reduce<number | null>((found, k) => {
    if (found != null) return found;
    const v = storedMap[k];
    return typeof v === 'number' && v >= 1 ? v : null;
  }, null);
  const receiptNumber =
    orderData?.receiptCallNumber != null && Number.isInteger(orderData.receiptCallNumber)
      ? Number(orderData.receiptCallNumber)
      : existingReceiptNumber != null
        ? existingReceiptNumber
        : await getNextReceiptNumber();
  if (keys.length) {
    setReceiptNumbersForOrder(keys.map((k) => String(k)), receiptNumber);
  }

  // گروه‌بندی jobها بر اساس پرینتر و نوع رسید
  const jobsByPrinter = new Map<string, PrinterJob[]>();
  for (const job of printerJobs) {
    const key = job.name;
    if (!jobsByPrinter.has(key)) {
      jobsByPrinter.set(key, []);
    }
    jobsByPrinter.get(key)!.push(job);
  }

  const preflightFailures: PrintFailureDetail[] = [];
  const queuedPrintTasks: Promise<PrintFailureDetail[]>[] = [];
  for (const [printerName, jobs] of jobsByPrinter.entries()) {
    const detected = discoveredMap.get(printerName);
    if (!detected) {
      for (const job of jobs) {
        preflightFailures.push({
          printerName,
          receiptType: job.receiptType || 'full',
          code: 'PRINT_PRINTER_NOT_FOUND',
        });
      }
      continue;
    }
    if (detected.statusCode === 'PRINTER_OFFLINE') {
      for (const job of jobs) {
        preflightFailures.push({
          printerName,
          receiptType: job.receiptType || 'full',
          code: 'PRINT_PRINTER_OFFLINE',
        });
      }
      continue;
    }
    queuedPrintTasks.push(
      enqueuePrinterTask(printerName, () => runPrinterJobs(orderData, printerName, jobs, receiptNumber)).catch(
        (error) => {
          if (error instanceof PrintOperationError) {
            return jobs.map((job) => ({
              printerName,
              receiptType: job.receiptType || 'full',
              code: error.code,
            }));
          }
          return jobs.map((job) => ({
            printerName,
            receiptType: job.receiptType || 'full',
            code: 'PRINT_UNKNOWN_ERROR' as PrintErrorCode,
          }));
        }
      )
    );
  }

  const settled = await Promise.allSettled(queuedPrintTasks);
  const runtimeFailures = settled.flatMap((result) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    return [
      {
        printerName: 'unknown',
        receiptType: 'full' as ReceiptType,
        code: 'PRINT_UNKNOWN_ERROR' as PrintErrorCode,
      },
    ];
  });
  const allFailures = [...preflightFailures, ...runtimeFailures];
  if (allFailures.length > 0) {
    throw new PrintOperationError(allFailures[0].code, allFailures);
  }

  return receiptNumber;
}

/** معرفی نرم‌افزار که باید زیر همهٔ رسیدها (هر قالبی) چاپ شود */
const BRAND_FOOTER_TEXT = 'با تشکر از انتخاب شما نرم افزار سکه secoin.ir';

/**
 * فوتر برند + تاریخ؛ در همهٔ قالب‌ها (پیش‌فرض، آشپزخانه و قالب‌های سرور) یکسان است.
 * اگر قالب خودش بلوک «تشکر» داشته باشد، فقط نام نرم‌افزار چاپ می‌شود تا تکراری نشود.
 */
function renderBrandFooterHtml(date: string, options: { thanksAlreadyShown?: boolean } = {}): string {
  const text = options.thanksAlreadyShown ? 'نرم افزار سکه secoin.ir' : BRAND_FOOTER_TEXT;
  return `<div class="brand-footer"><div>${text}</div><div style="margin-top:4px">${date}</div></div>`;
}

const BRAND_FOOTER_CSS =
  '.brand-footer { text-align: center; margin-top: 12px; font-size: 8pt; font-weight: bold; }';

function getPriceUnitLabel(unit: ReceiptPriceDisplayUnit): string {
  return unit === 'rial' ? 'ریال' : 'تومان';
}

/** فقط عدد، با ارقام لاتین (خواناتر روی چاپگر حرارتی) و بدون واحد پولی */
function createFormatPriceValue(unit: ReceiptPriceDisplayUnit = 'toman'): (price: number) => string {
  return (price: number) => {
    const n = Number(price) || 0;
    const value = unit === 'rial' ? Math.round(n * 10) : n;
    return new Intl.NumberFormat('en-US').format(value);
  };
}

function createFormatPrice(unit: ReceiptPriceDisplayUnit = 'toman'): (price: number) => string {
  const formatValue = createFormatPriceValue(unit);
  const label = getPriceUnitLabel(unit);
  return (price: number) => `${formatValue(price)} ${label}`;
}

/** خانوادهٔ فونتی که در رسید استفاده می‌شود — دقیقاً همان ایران‌یکانِ استفاده‌شده در رندرر (src/index.css) */
const RECEIPT_FONT_FAMILY = "'iranyekan', Tahoma, Arial, sans-serif";

let cachedIranYekanFontFaceCss: string | null = null;

/**
 * فونت ایران‌یکان را به‌صورت data URI درون CSS جاسازی می‌کند تا در پنجرهٔ چاپ (که با data: URL
 * بارگذاری می‌شود و مسیر نسبی برای فایل فونت ندارد) قابل استفاده باشد. اگر فایل فونت پیدا نشود
 * (مثلاً یک بیلد ناقص)، رشتهٔ خالی برمی‌گردد و چاپ با فونت‌های سیستم (fallback در RECEIPT_FONT_FAMILY) ادامه می‌یابد.
 */
function getIranYekanFontFaceCss(): string {
  if (cachedIranYekanFontFaceCss !== null) return cachedIranYekanFontFaceCss;
  try {
    const fontsDir = path.join(__dirname, '..', '..', 'dist-react', 'fonts');
    const toDataUri = (file: string) =>
      `data:font/woff;base64,${fs.readFileSync(path.join(fontsDir, file)).toString('base64')}`;
    cachedIranYekanFontFaceCss = `
    @font-face { font-family: 'iranyekan'; font-style: normal; font-weight: normal; src: url('${toDataUri('iranyekanwebregularfanum.woff')}') format('woff'); }
    @font-face { font-family: 'iranyekan'; font-style: normal; font-weight: bold; src: url('${toDataUri('iranyekanwebboldfanum.woff')}') format('woff'); }`;
  } catch {
    cachedIranYekanFontFaceCss = '';
  }
  return cachedIranYekanFontFaceCss;
}

export function generateReceiptHTML(orderData: any, options: ReceiptTemplateOptions = {}): string {
  const formatPrice = createFormatPrice(options.priceDisplayUnit ?? 'toman');
  const items = orderData.items || [];
  const totalAmount = orderData.totalAmount || 0;
  const discountAmount = orderData.discountAmount || 0;
  const vatAmount = orderData.vatAmount || 0;
  const finalAmount = orderData.finalAmount || totalAmount - discountAmount + vatAmount;
  const orderNumber = orderData.orderNumber || orderData.order_number || orderData.id || 'N/A';
  const customerName = orderData.customerName || orderData.customerPhone || 'مشتری';
  const restaurantName = orderData.restaurantName || '';
  const serviceType = orderData.serviceType === 'dine_in' ? 'داخل سالن' : 'بیرون‌بر';
  const tableNumber = orderData.tableNumber || '';
  const customerAddress = orderData.customerAddress || '';
  const paymentMethod = getPaymentMethodText(orderData.paymentMethod);
  const notes = orderData.notes || '';
  const date = new Date().toLocaleString('fa-IR');

  const paperWidth = typeof options.paperWidth === 'number' ? options.paperWidth : 80;
  const printerMargin = typeof options.margin === 'number' ? Math.max(0, options.margin) : 5;
  const printableWidth = typeof options.contentWidthMm === 'number'
      ? options.contentWidthMm
      : Math.max(30, paperWidth - printerMargin * 2);
  const shiftLeftMm = typeof options.shiftLeftMm === 'number' ? options.shiftLeftMm : 0;
  const contentPadding = 2;
  const receiptNumber =
      options && typeof options.receiptNumber === 'number' ? options.receiptNumber : 0;

  return `
<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>رسید سفارش</title>
  <style>
    ${getIranYekanFontFaceCss()}
    :root {
      --paper-width: ${paperWidth}mm;
      --printable-width: ${printableWidth}mm;
      --content-padding: ${contentPadding}mm;
      --shift-left: ${shiftLeftMm}mm;
    }
    @page { size: var(--paper-width) auto; margin: 0; }
    html, body {
      width: var(--paper-width);
      max-width: var(--paper-width);
      margin: 0; padding: 0; padding-top: 0 !important;
      margin-right: var(--shift-left);
    }
    body {
      font-family: ${RECEIPT_FONT_FAMILY};
      font-size: 10pt;
      color: #000 !important;
      -webkit-font-smoothing: none;
      text-rendering: geometricPrecision;
      box-sizing: border-box; direction: rtl; text-align: right;
      overflow-wrap: break-word; word-break: break-word;
      background: #fff;
    }
    .receipt-root {
      width: var(--printable-width); max-width: var(--printable-width);
      padding: var(--content-padding); padding-top: 0;
      box-sizing: border-box; background: #fff; margin: 0;
    }
    * { box-sizing: border-box; max-width: 100%; color: #000 !important; }
    
    .divider { border-bottom: 2px dashed #000; margin: 8px 0; }
    .divider-solid { border-bottom: 2px solid #000; margin: 8px 0; }

    .header { text-align: center; padding-bottom: 4px; }
    
    .receipt-fish-row { text-align: center; margin: 8px 0; }
    .receipt-number-box {
      display: inline-flex; align-items: center; justify-content: center;
      width: 22mm; height: 22mm; margin: 0 auto;
      border: 3px solid #000;
      font-size: 24pt; font-weight: bold; line-height: 1;
    }
    .receipt-restaurant-name {
      text-align: center; margin-top: 6px; font-size: 11pt; font-weight: bold;
    }

    .order-info { margin: 8px 0; font-size: 9pt; }
    .order-info div { margin: 4px 0; display: flex; justify-content: space-between; }
    .order-info strong { font-weight: bold; }

    .items-table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 9pt; }
    .items-table th { border-bottom: 1px solid #000; padding-bottom: 4px; text-align: right; font-weight: bold; }
    .items-table td { padding: 6px 0; vertical-align: top; border-bottom: 1px dashed #000; }
    .items-table tr:last-child td { border-bottom: none; }
    
    .item-name { font-weight: bold; font-size: 10pt; display: block; }
    .item-details { font-size: 8pt; margin-top: 3px; line-height: 1.4; white-space: pre-wrap; }
    
    .col-qty { text-align: center; width: 15%; font-weight: bold; font-size: 11pt; white-space: nowrap; }
    .col-price { text-align: center; width: 30%; font-weight: bold; white-space: nowrap; }

    .totals { margin: 10px 0; font-size: 10pt; }
    .total-row { display: flex; justify-content: space-between; margin: 6px 0; }
    .total-row.final { font-size: 13pt; font-weight: bold; margin-top: 8px; padding-top: 8px; border-top: 2px solid #000; }

    /* --- تغییرات اصلی اینجاست --- */
    .notes-box {
      border: 1px solid #000; 
      padding: 6px; 
      margin: 10px 0;
      font-size: 9pt; 
      font-weight: bold; 
      border-radius: 4px;
      white-space: pre-wrap; /* اعمال اینترها و رفتن تا انتهای خط */
      word-break: normal; /* جلوگیری از رفتار عجیب روی اعداد */
      line-height: 1.6;
      text-align: justify; /* پر کردن کامل عرض */
      text-align-last: right; /* خط آخر راست‌چین بماند */
    }

    ${BRAND_FOOTER_CSS}
    .brand-footer { margin-top: 15px; }
  </style>
</head>
<body>
  <div class="receipt-root">
    <div class="header">
      <div class="receipt-fish-row">
        <div class="receipt-number-box">${receiptNumber > 0 ? receiptNumber : '—'}</div>
        <div class="receipt-restaurant-name">${restaurantName || 'رستوران'}</div>
      </div>
    </div>
    
    <div class="divider"></div>

    <div class="order-info">
      <div><span>مشتری:</span> <strong>${customerName}</strong></div>
      <div><span>سفارش:</span> <strong>${serviceType}</strong></div>
      ${tableNumber ? `<div><span>میز:</span> <strong>${tableNumber}</strong></div>` : ''}
      ${customerAddress ? `<div style="display:block"><span>آدرس:</span> <strong>${customerAddress}</strong></div>` : ''}
    </div>

    ${notes ? `<div class="notes-box">یادداشت: ${notes}</div>` : ''}

    <div class="divider-solid"></div>

    <table class="items-table">
      <thead>
        <tr>
          <th>شرح سفارش</th>
          <th class="col-qty">تعداد</th>
          <th class="col-price">مبلغ</th>
        </tr>
      </thead>
      <tbody>
      ${items.map((item: any) => {
    const title = item.product?.name_fa || item.productName || 'محصول';
    const desc = getProductDescription(item);
    const lineNote = getLineItemNote(item);
    return `
        <tr>
          <td>
            <span class="item-name">${title}</span>
            ${lineNote ? `<div class="item-details">${lineNote}</div>` : desc ? `<div class="item-details">${desc}</div>` : ''}
          </td>
          <td class="col-qty">${item.quantity}${item.product?.unit && item.product.unit !== 'عدد' ? ` ${item.product.unit}` : ''}</td>
          <td class="col-price">${formatPrice(+item.price* +item.quantity)}</td>
        </tr>`;
  }).join('')}
      </tbody>
    </table>

    <div class="divider-solid"></div>

    <div class="totals">
      <div class="total-row">
        <span>جمع کل:</span>
        <span>${formatPrice(totalAmount)}</span>
      </div>
      ${discountAmount > 0 ? `
      <div class="total-row">
        <span>تخفیف:</span>
        <span>-${formatPrice(discountAmount)}</span>
      </div>
      ` : ''}
      ${vatAmount > 0 ? `
      <div class="total-row">
        <span>ارزش افزوده:</span>
        <span>+${formatPrice(vatAmount)}</span>
      </div>
      ` : ''}
      <div class="total-row final">
        <span>مبلغ نهایی:</span>
        <span>${formatPrice(finalAmount)}</span>
      </div>
    </div>

    <div class="divider"></div>

    ${renderBrandFooterHtml(date)}
  </div>
</body>
</html>
  `;
}

export async function renderReceiptPreview(
  orderData: any,
  options: ReceiptTemplateOptions = {}
): Promise<{ html: string; imageDataUrl?: string }> {
  const priceDisplayUnit =
    options.priceDisplayUnit ?? (await loadReceiptPriceDisplayUnit());
  const resolvedOptions: ReceiptTemplateOptions = { ...options, priceDisplayUnit };
  const receiptType = resolvedOptions.receiptType || 'full';
  const layout = normalizeReceiptLayout(resolvedOptions.layout);
  const html = layout
    ? generateReceiptHTMLFromLayout(orderData, layout, resolvedOptions)
    : receiptType === 'kitchen'
      ? generateKitchenReceiptHTML(orderData, resolvedOptions)
      : generateReceiptHTML(orderData, resolvedOptions);
  // برای پیش‌نمایش حاشیهٔ چپ و راست اضافه می‌کنیم تا محتوا از هیچ طرف بریده نشود
  const previewHtml = html.replace(
    '</head>',
    '<style id="preview-padding">html, body { padding-left: 24px !important; padding-right: 24px !important; box-sizing: border-box; }</style></head>'
  );

  const previewWindow = new BrowserWindow({
    show: false,
    width: 800,
    height: 3500,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      offscreen: true,
    },
  });

  await previewWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(previewHtml)}`);
  await new Promise((resolve) => setTimeout(resolve, 500));

  let imageDataUrl: string | undefined;
  try {
    // از getBoundingClientRect بدنه دقیقاً همان ناحیه‌ای را ضبط می‌کنیم که رسید رندر شده (با حاشیه امن)
    const rect = await previewWindow.webContents.executeJavaScript(
      `(function() {
        var body = document.body;
        var r = body.getBoundingClientRect();
        var pad = 16;
        return {
          x: Math.max(0, Math.round(r.left) - pad),
          y: Math.max(0, Math.round(r.top) - pad),
          width: Math.round(r.width) + pad * 2,
          height: Math.round(r.height) + pad * 2
        };
      })()`
    ).catch(() => ({ x: 0, y: 0, width: 400, height: 900 })) as { x: number; y: number; width: number; height: number };

    const x = Math.max(0, rect.x);
    const y = Math.max(0, rect.y);
    const w = Math.min(800, Math.max(280, rect.width));
    const h = Math.min(5000, Math.max(400, rect.height));
    const image = await previewWindow.webContents.capturePage({ x, y, width: w, height: h });
    imageDataUrl = image?.toDataURL();
  } catch (error) {
    console.warn('Failed to capture preview image:', error);
  } finally {
    previewWindow.destroy();
  }

  return { html, imageDataUrl };
}

/**
 * باز کردن پنجرهٔ پیش‌نمایش رسید؛ کاربر رسید را می‌بیند و با دکمه «چاپ» دیالوگ چاپ ویندوز باز می‌شود.
 * (اپ الکترون پیش‌نمایش دیالوگ ویندوز را پشتیبانی نمی‌کند، پس پیش‌نمایش همان پنجرهٔ ماست.)
 */
export function showSystemPrintDialog(
  orderData: any,
  options: ReceiptTemplateOptions & { receiptType?: ReceiptType } = {},
  printerName?: string
): Promise<void> {
  const receiptType = options.receiptType || 'full';
  const paperWidth = typeof options.paperWidth === 'number' ? options.paperWidth : 80;
  const margin = typeof options.margin === 'number' ? Math.max(0, options.margin) : 5;
  const isNarrow = paperWidth <= 62;
  const marginSame = 5;
  const shiftLeftMm = isNarrow ? 12 : 14;
  const contentWidthMm = typeof options.contentWidthMm === 'number' ? options.contentWidthMm : Math.max(32, paperWidth - marginSame * 2 - shiftLeftMm);
  const marginTop = 0;
  const marginBottom = 3;

  const layout = normalizeReceiptLayout(options.layout);
  const htmlOptions = { ...options, paperWidth, margin, contentWidthMm, shiftLeftMm };
  const html = layout
    ? generateReceiptHTMLFromLayout(orderData, layout, htmlOptions)
    : receiptType === 'kitchen'
      ? generateKitchenReceiptHTML(orderData, htmlOptions)
      : generateReceiptHTML(orderData, htmlOptions);

  const width = mmToMicrons(paperWidth);
  const height = mmToMicrons(options.paperLength ?? 200);
  const printOpts: any = {
    silent: false,
    printBackground: true,
    copies: 1,
    margins: {
      marginType: 'custom',
      top: marginTop,
      bottom: marginBottom,
      left: marginSame,
      right: marginSame,
    },
    pageSize: { width, height },
  };
  if (printerName) printOpts.deviceName = printerName;

  const widthPx = Math.max(320, Math.min(500, Math.round((contentWidthMm / 25.4) * 96)));
  const preloadPath = path.join(__dirname, '..', 'preload-print-preview.js');
  const printWindow = new BrowserWindow({
    show: true,
    width: widthPx + 60,
    height: 680,
    title: receiptType === 'kitchen' ? 'پیش‌نمایش رسید آشپزخانه' : 'پیش‌نمایش رسید — قبل از چاپ',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
    },
  });
  printWindow.setMenuBarVisibility(false);

  printPreviewOptsMap.set(printWindow.webContents.id, printOpts);
  printWindow.on('closed', () => {
    printPreviewOptsMap.delete(printWindow.webContents.id);
  });

  printWindow.webContents.once('did-finish-load', () => {
    const script = `
      (function() {
        if (document.getElementById('receipt-print-toolbar')) return;
        document.body.style.paddingBottom = '52px';
        var bar = document.createElement('div');
        bar.id = 'receipt-print-toolbar';
        bar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;padding:10px;background:#f0f0f0;border-top:1px solid #ccc;text-align:center;direction:rtl;font-family:Tahoma;';
        bar.innerHTML = '<button id="receipt-btn-print" style="margin:0 8px;padding:8px 16px;cursor:pointer;">چاپ</button><button id="receipt-btn-close" style="margin:0 8px;padding:8px 16px;cursor:pointer;">بستن</button>';
        document.body.appendChild(bar);
        document.getElementById('receipt-btn-print').onclick = function() { if (typeof window.receiptPrint === 'function') window.receiptPrint(); };
        document.getElementById('receipt-btn-close').onclick = function() { window.close(); };
      })();
    `;
    printWindow.webContents.executeJavaScript(script).catch(() => {});
  });

  printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch(() => {});

  return Promise.resolve();
}

/** یادداشت خط سفارش — در اسنپ‌شات الکترون `itemOption` است، از API معمولاً `itemNote` */
function getLineItemNote(item: any): string {
  const n = item?.itemNote ?? item?.itemOption;
  return n != null ? String(n).trim() : '';
}

/** توضیحات ثبت‌شده در کارت محصول (منو) */
function getProductDescription(item: any): string {
  const d = item?.product?.description;
  return d != null ? String(d).trim() : '';
}

function getPaymentMethodText(method: string): string {
  const methods: { [key: string]: string } = {
    cash: 'نقد',
    card: 'کارت',
    online: 'آنلاین',
    mixed: 'ترکیبی',
  };
  return methods[method] || method;
}

function getValueForLayoutModule(type: string, orderData: any, module?: ReceiptLayoutModule): { value: string | number; isEmpty: boolean } {
  switch (type) {
    case 'call_number': {
      const callNumber = Number(orderData?.receiptCallNumber ?? 0);
      // شمارهٔ صفر یعنی شماره‌ای وجود ندارد؛ نباید کادر خالیِ بزرگ چاپ شود
      return { value: callNumber > 0 ? callNumber : '', isEmpty: !(callNumber > 0) };
    }
    case 'restaurant_name':
      return { value: orderData?.restaurantName ?? '', isEmpty: !orderData?.restaurantName };
    case 'order_number':
      return { value: orderData?.orderNumber ?? orderData?.id ?? '—', isEmpty: !orderData?.orderNumber && orderData?.id == null };
    case 'date_time':
      return { value: new Date().toLocaleString('fa-IR'), isEmpty: false };
    case 'customer_name':
      return { value: orderData?.customerName ?? '', isEmpty: !orderData?.customerName };
    case 'customer_phone':
      return { value: orderData?.customerPhone ?? '', isEmpty: !orderData?.customerPhone };
    case 'address':
      return { value: orderData?.customerAddress ?? '', isEmpty: !orderData?.customerAddress };
    case 'order_info': {
      const st = orderData?.serviceType === 'dine_in' ? 'داخل سالن' : 'بیرون‌بر';
      const parts = [`نوع: ${st}`];
      if (orderData?.tableNumber) parts.push(`میز: ${orderData.tableNumber}`);
      if (orderData?.paymentMethod) parts.push(`پرداخت: ${getPaymentMethodText(orderData.paymentMethod)}`);
      return { value: parts.join(' | '), isEmpty: false };
    }
    case 'items':
      return { value: '', isEmpty: !orderData?.items?.length };
    case 'totals':
      return { value: '', isEmpty: false };
    case 'footer':
      return { value: 'با تشکر از انتخاب شما', isEmpty: false };
    case 'custom_text':
      return { value: (module?.options?.customText as string) ?? '', isEmpty: !(module?.options?.customText) };
    case 'divider':
      return { value: '—', isEmpty: false };
    case 'image':
      return { value: orderData?.logoUrl ?? '', isEmpty: !orderData?.logoUrl };
    default:
      return { value: '', isEmpty: false };
  }
}

function renderLayoutModuleHtml(
  module: ReceiptLayoutModule,
  orderData: any,
  formatPrice: (price: number) => string,
  formatPriceValue: (price: number) => string,
  priceUnitLabel: string,
): string {
  const opt = module.options || {};
  const hideWhenEmpty = opt.hideWhenEmpty === true;
  const { value, isEmpty } = getValueForLayoutModule(module.type, orderData, module);
  if (!module.visible || (hideWhenEmpty && isEmpty)) return '';

  const fontSize = (opt.fontSize as number) ?? 11;
  const align = (opt.align as string) ?? 'right';
  const bold = opt.bold ? 'font-weight:bold;' : '';
  const padding = (opt.paddingMm as number) ?? 2;
  const borderWidth = opt.borderWidth as number | undefined;
  const borderStyle = (opt.borderStyle as string) ?? 'solid';
  const borderRadius = (opt.borderRadiusMm as number) ?? 0;
  let style = `font-size:${fontSize}pt;text-align:${align};padding:${padding}mm;border-radius:${borderRadius}mm;${bold}`;
  if (borderWidth) style += `border:${borderWidth}px ${borderStyle} #333;`;

  if (module.type === 'call_number') {
    // کادر شمارهٔ فراخوانی بدون شماره فقط یک مربع خالیِ بزرگ در بالای رسید است
    if (isEmpty) return '';
    const box = opt.showCallNumberBox !== false;
    const size = (opt.callNumberBoxSize as number) ?? 22;
    const v = orderData?.receiptCallNumber ?? value;
    if (box) {
      const boxBw = (opt.borderWidth as number) ?? 2;
      const boxBs = (opt.borderStyle as string) || 'solid';
      const boxBr = (opt.borderRadiusMm as number) ?? 0;
      const boxStyle = `display:inline-flex;align-items:center;justify-content:center;width:${size}mm;min-height:${size}mm;border:${boxBw}px ${boxBs} #333;border-radius:${boxBr}mm;font-weight:bold;`;
      return `<div style="${style.replace(/border:[^;]+;?/g, '')}display:flex;justify-content:center;"><span style="${boxStyle}">${v}</span></div>`;
    }
    return `<div style="${style}">${v}</div>`;
  }

  if (module.type === 'divider') {
    const lineStyle = (opt.lineStyle as string) ?? 'dashed';
    const thickness = (opt.lineThickness as number) ?? 1;
    return `<div style="${style}"><hr style="border:none;border-top:${thickness}px ${lineStyle} #333"/></div>`;
  }

  if (module.type === 'items' && orderData?.items?.length) {
    const showPrice = opt.showPrice !== false;
    const showDesc = opt.showDescription !== false;
    const showLineNote = opt.showItemNote !== false;
    const tableStyle = (opt.itemsTableStyle as string) ?? 'simple';

    if (tableStyle === 'full') {
      const cellBorder = '1px solid #999';
      const striped = opt.itemsStriped === true;
      const showTotalPrice = opt.showTotalPrice !== false;
      const headerCss = `border:${cellBorder};font-size:0.85em`;
      const rows = orderData.items.map((item: any, i: number) => {
        const name = item.product?.name_fa || item.productName || 'محصول';
        const desc = showDesc ? getProductDescription(item) : '';
        const lineNote = showLineNote ? getLineItemNote(item) : '';
        const notePart = lineNote ? ` (${lineNote})` : '';
        const descBlock = desc
          ? `<div style="font-size:0.85em;margin-top:2px;line-height:1.3">${desc}</div>`
          : '';
        const price = showPrice ? `<td style="padding:2px 4px;white-space:nowrap;vertical-align:top;border:${cellBorder}">${formatPriceValue(item.price)}</td>` : '';
        const total = showTotalPrice ? `<td style="padding:2px 4px;white-space:nowrap;vertical-align:top;font-weight:bold;border:${cellBorder}">${formatPriceValue(+item.price * +item.quantity)}</td>` : '';
        const rowBg = striped && i % 2 === 1 ? 'background:#f2f2f2' : '';
        const titleCell = `<span>${name}</span>${notePart}${descBlock}`;
        return `<tr style="${rowBg}"><td style="padding:2px 4px;vertical-align:top;border:${cellBorder};word-break:break-word;overflow-wrap:anywhere">${titleCell}</td><td style="padding:2px 4px;white-space:nowrap;vertical-align:top;text-align:center;border:${cellBorder}">${item.quantity}</td>${price}${total}</tr>`;
      }).join('');
      const priceHeader = showPrice ? `<th style="padding:4px;white-space:nowrap;width:24%;${headerCss}">قیمت <span style="font-size:0.75em;font-weight:normal">(${priceUnitLabel})</span></th>` : '';
      const totalHeader = showTotalPrice ? `<th style="padding:4px;white-space:nowrap;width:24%;${headerCss}">قیمت کل</th>` : '';
      return `<div style="${style}"><table style="width:100%;text-align:right;border-collapse:collapse;border:${cellBorder};table-layout:fixed"><thead><tr style="background:#f2f2f2"><th style="padding:4px;${headerCss}">نام کالا</th><th style="padding:4px;white-space:nowrap;width:14%;${headerCss}">تعداد</th>${priceHeader}${totalHeader}</tr></thead><tbody>${rows}</tbody></table></div>`;
    }

    const rows = orderData.items.map((item: any) => {
      const name = item.product?.name_fa || item.productName || 'محصول';
      const desc = showDesc ? getProductDescription(item) : '';
      const lineNote = showLineNote ? getLineItemNote(item) : '';
      const notePart = lineNote ? ` (${lineNote})` : '';
      const descBlock = desc
        ? `<div style="font-size:9pt;margin-top:2px;line-height:1.3">${desc}</div>`
        : '';
      const price = showPrice ? `<td style="padding:2px 4px;vertical-align:top">${formatPrice(item.price)}</td>` : '';
      const border = tableStyle === 'bordered' ? 'border-bottom:1px solid #000' : '';
      const titleCell = `<span>${name}</span>${notePart}${descBlock}`;
      const unitStr = item.product?.unit && item.product.unit !== 'عدد' ? ` ${item.product.unit}` : '';
      return `<tr style="${border}"><td style="padding:2px 4px;vertical-align:top">${titleCell}</td><td style="padding:2px 4px;white-space:nowrap;vertical-align:top">${item.quantity}${unitStr} ×</td>${price}</tr>`;
    }).join('');
    return `<div style="${style}"><table style="width:100%;text-align:right;border-collapse:collapse"><tbody>${rows}</tbody></table></div>`;
  }

  if (module.type === 'totals') {
    const showPrice = opt.showPrice !== false;
    if (!showPrice) return `<div style="${style}"></div>`;
    const total = orderData?.totalAmount ?? 0;
    const discount = orderData?.discountAmount ?? 0;
    const vat = orderData?.vatAmount ?? 0;
    const final = orderData?.finalAmount ?? total - discount + vat;
    const totalsStyle = (opt.totalsStyle as string) ?? 'flex';
    const striped = opt.totalsStriped === true;
    const finalScale = opt.finalAmountScale ? Number(opt.finalAmountScale) / 100 : 1;
    const rowsData: { label: string; value: number; sign: '' | '-' | '+' }[] = [
      { label: 'جمع:', value: total, sign: '' },
      ...(discount > 0 ? [{ label: 'تخفیف:', value: discount, sign: '-' as const }] : []),
      ...(vat > 0 ? [{ label: 'ارزش افزوده:', value: vat, sign: '+' as const }] : []),
    ];

    if (totalsStyle === 'table') {
      const cellBorder = '1px solid #999';
      const headerCss = `border:${cellBorder};font-size:0.85em`;
      const bodyRows = rowsData.map((r, i) => {
        const rowBg = striped && i % 2 === 1 ? 'background:#f2f2f2' : '';
        return `<tr style="${rowBg}"><td style="padding:2px 4px;border:${cellBorder}">${r.label}</td><td style="padding:2px 4px;white-space:nowrap;border:${cellBorder}">${r.sign}${formatPriceValue(r.value)}</td></tr>`;
      }).join('');
      const finalRow = `<tr style="font-weight:bold;font-size:${finalScale}em"><td style="padding:4px;border:${cellBorder}">مبلغ نهایی:</td><td style="padding:4px;white-space:nowrap;border:${cellBorder}">${formatPriceValue(final)}</td></tr>`;
      return `<div style="${style}"><table style="width:100%;text-align:right;border-collapse:collapse;border:${cellBorder}"><thead><tr style="background:#f2f2f2"><th style="padding:4px;${headerCss}">شرح</th><th style="padding:4px;white-space:nowrap;${headerCss}">مبلغ <span style="font-size:0.75em;font-weight:normal">(${priceUnitLabel})</span></th></tr></thead><tbody>${bodyRows}${finalRow}</tbody></table></div>`;
    }

    let html = `<div style="${style}">` + rowsData.map((r) =>
      `<div style="display:flex;justify-content:space-between;padding:2px 0">${r.label} ${r.sign}${formatPriceValue(r.value)} <span style="font-size:0.75em;font-weight:normal">${priceUnitLabel}</span></div>`
    ).join('');
    html += `<div style="display:flex;justify-content:space-between;padding:4px 0;font-weight:bold;font-size:${finalScale}em;border-top:2px solid #000;margin-top:4px">مبلغ نهایی: ${formatPriceValue(final)}</div></div>`;
    return html;
  }

  if (module.type === 'image' && (opt.imageUrl || orderData?.logoUrl)) {
    const url = (opt.imageUrl as string) || orderData?.logoUrl;
    const w = (opt.widthMm as number) ?? 40;
    const h = (opt.heightMm as number) ?? 25;
    return `<div style="${style};display:flex;justify-content:center"><img src="${url}" alt="" style="max-width:${w}mm;max-height:${h}mm;object-fit:contain"/></div>`;
  }

  if (module.type === 'custom_text') {
    return `<div style="${style}">${(opt.customText as string) || 'متن دلخواه'}</div>`;
  }

  if (typeof value === 'string' && value) return `<div style="${style}">${value}</div>`;
  if (typeof value === 'number') return `<div style="${style}">${value}</div>`;
  return '';
}

export function generateReceiptHTMLFromLayout(
  orderData: any,
  layout: ReceiptLayoutV2,
  options: ReceiptTemplateOptions = {}
): string {
  const priceUnit = options.priceDisplayUnit ?? 'toman';
  const formatPrice = createFormatPrice(priceUnit);
  const formatPriceValue = createFormatPriceValue(priceUnit);
  const priceUnitLabel = getPriceUnitLabel(priceUnit);
  const paperWidth = typeof options.paperWidth === 'number' ? options.paperWidth : 80;
  const margin = typeof options.margin === 'number' ? Math.max(0, options.margin) : 5;
  const printableWidth = typeof options.contentWidthMm === 'number' ? options.contentWidthMm : Math.max(30, paperWidth - margin * 2);
  const shiftLeftMm = typeof options.shiftLeftMm === 'number' ? options.shiftLeftMm : 0;
  const contentPadding = 2;

  const receiptNumber = typeof options.receiptNumber === 'number' ? options.receiptNumber : 0;
  if (orderData && orderData.receiptCallNumber == null && receiptNumber > 0) {
    orderData = { ...orderData, receiptCallNumber: receiptNumber };
  }

  const rows = (layout.rows || []).slice().sort((a, b) => a.order - b.order);
  const parts: string[] = [];
  for (const row of rows) {
    if (row.type === 'single') {
      const blocks = Array.isArray(row.blocks) && !Array.isArray(row.blocks[0]) ? (row.blocks as ReceiptLayoutModule[]) : [];
      for (const m of blocks) {
        const html = renderLayoutModuleHtml(m, orderData, formatPrice, formatPriceValue, priceUnitLabel);
        if (html) parts.push(html);
      }
    } else if (row.type === 'columns' && Array.isArray(row.blocks)) {
      const cols = row.blocks as ReceiptLayoutModule[][];
      const gridCols = row.columnWidths?.length
        ? row.columnWidths.map((w) => w + 'fr').join(' ')
        : 'repeat(' + (row.columnCount || cols.length) + ',1fr)';
      parts.push('<div style="display:grid;grid-template-columns:' + gridCols + ';gap:6px;margin-bottom:4px">');
      for (const col of cols) {
        parts.push('<div>');
        for (const m of col) {
          const html = renderLayoutModuleHtml(m, orderData, formatPrice, formatPriceValue, priceUnitLabel);
          if (html) parts.push(html);
        }
        parts.push('</div>');
      }
      parts.push('</div>');
    }
  }

  const hasFooterModule = rows.some((row) => {
    const blocks = Array.isArray(row.blocks) ? row.blocks.flat() : [];
    return (blocks as ReceiptLayoutModule[]).some((m) => m && m.type === 'footer' && m.visible);
  });
  const bodyContent =
    parts.join('') +
    renderBrandFooterHtml(new Date().toLocaleString('fa-IR'), { thanksAlreadyShown: hasFooterModule });

  return `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>رسید سفارش</title>
  <style>
    ${getIranYekanFontFaceCss()}
    :root { --paper-width: ${paperWidth}mm; --printable-width: ${printableWidth}mm; --content-padding: ${contentPadding}mm; --shift-left: ${shiftLeftMm}mm; }
    @page { size: var(--paper-width) auto; margin: 0; }
    html, body {
      width: var(--paper-width); max-width: var(--paper-width); margin: 0; padding: 0; padding-top: 0 !important;
      margin-right: var(--shift-left); font-family: ${RECEIPT_FONT_FAMILY}; box-sizing: border-box;
      direction: rtl; text-align: right; word-break: break-word; overflow-wrap: break-word; background: #fff;
      font-size: 10pt;
      color: #000 !important; /* حیاتی برای کیفیت چاپ */
      -webkit-font-smoothing: none; /* حیاتی برای کیفیت چاپ */
      text-rendering: geometricPrecision;
    }
    /* دقیقاً مثل قالب پیش‌فرض: بدون فاصلهٔ اضافه در بالای کاغذ */
    .receipt-root { width: var(--printable-width); max-width: var(--printable-width); padding: var(--content-padding); padding-top: 0; box-sizing: border-box; background: #fff; margin: 0; }
    .receipt-root > *:first-child { margin-top: 0 !important; padding-top: 0 !important; }
    hr { margin: 0; }
    * { box-sizing: border-box; max-width: 100%; color: #000 !important; }
    ${BRAND_FOOTER_CSS}
  </style>
</head>
<body>
  <div class="receipt-root">${bodyContent}</div>
</body>
</html>`;
}

export function generateKitchenReceiptHTML(orderData: any, options: ReceiptTemplateOptions = {}): string {
  const items = orderData.items || [];
  const orderNumber = orderData.orderNumber || orderData.order_number || orderData.id || 'N/A';
  const serviceType = orderData.serviceType === 'dine_in' ? 'داخل سالن' : 'بیرون‌بر';
  const tableNumber = orderData.tableNumber || '';
  const customerAddress = orderData.customerAddress || '';
  const notes = orderData.notes || '';
  const date = new Date().toLocaleString('fa-IR');

  const paperWidth = typeof options.paperWidth === 'number' ? options.paperWidth : 80;
  const printerMargin = typeof options.margin === 'number' ? Math.max(0, options.margin) : 5;
  const printableWidth = typeof options.contentWidthMm === 'number'
      ? options.contentWidthMm
      : Math.max(30, paperWidth - printerMargin * 2);
  const shiftLeftMm = typeof options.shiftLeftMm === 'number' ? options.shiftLeftMm : 0;
  const contentPadding = 2;
  const receiptNumber = typeof options.receiptNumber === 'number' ? options.receiptNumber : 0;

  return `
<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>رسید آشپزخانه</title>
  <style>
    ${getIranYekanFontFaceCss()}
    :root {
      --paper-width: ${paperWidth}mm;
      --printable-width: ${printableWidth}mm;
      --content-padding: ${contentPadding}mm;
      --shift-left: ${shiftLeftMm}mm;
    }
    @page { size: var(--paper-width) auto; margin: 0; }
    html, body {
      width: var(--paper-width); max-width: var(--paper-width);
      margin: 0; padding: 0; padding-top: 0 !important; margin-right: var(--shift-left);
    }
    body {
      font-family: ${RECEIPT_FONT_FAMILY};
      color: #000 !important;
      -webkit-font-smoothing: none;
      text-rendering: geometricPrecision;
      font-size: 12pt; font-weight: bold;
      box-sizing: border-box; direction: rtl; text-align: right; background: #fff;
    }
    .receipt-root { width: var(--printable-width); max-width: var(--printable-width); padding: var(--content-padding); margin: 0; }
    * { box-sizing: border-box; max-width: 100%; color: #000 !important; }

    .divider-solid { border-bottom: 3px solid #000; margin: 10px 0; }

    .header { text-align: center; }
    
    .receipt-number-box {
      display: inline-flex; align-items: center; justify-content: center;
      width: 25mm; height: 25mm; margin: 5px auto;
      border: 4px solid #000;
      font-size: 32pt; font-weight: bold; line-height: 1;
    }

    .order-info { margin: 12px 0; font-size: 12pt; border: 2px dashed #000; padding: 8px; border-radius: 4px; }
    .order-info div { margin: 6px 0; }

    .items { margin: 15px 0; }
    .item { display: flex; justify-content: space-between; align-items: flex-start; padding: 8px 0; border-bottom: 2px solid #000; }
    .item-name-col { flex: 1; padding-left: 10px; }
    .item-name { font-size: 10pt; }
    
    /* --- مشکل یادداشت زیر محصولات در این کلاس حل شد --- */
    .item-details { 
      font-size: 10pt; 
      margin-top: 4px; 
      font-weight: normal; 
      white-space: pre-wrap; 
      word-break: normal; 
      text-align: justify; 
      text-align-last: right;
      line-height: 1.6;
    }
    
    .item-quantity { font-size: 20pt; font-weight: bold; white-space: nowrap; margin-right: 10px; }

    .notes { 
      margin-top: 15px; 
      padding: 10px; 
      border: 3px solid #000; 
      font-size: 12pt;
      white-space: pre-wrap; 
      word-break: normal; 
      line-height: 1.6;
      text-align: justify; 
      text-align-last: right; 
    }
    
    ${BRAND_FOOTER_CSS}
    .brand-footer { margin-top: 20px; font-size: 10pt; }
  </style>
</head>
<body>
  <div class="receipt-root">
    <div class="header">
      ${receiptNumber > 0 ? `<div class="receipt-number-box">${receiptNumber}</div>` : ''}
    </div>

        <div class="order-info">
      <div>${serviceType}</div>
      ${tableNumber ? `<div><strong>میز:</strong> ${tableNumber}</div>` : ''}
      ${customerAddress ? `<div><strong>آدرس:</strong> ${customerAddress}</div>` : ''}
    </div>

    ${notes ? `
    <div class="notes">
      ${notes} 
    </div>
    ` : ''}

    <div class="divider-solid"></div>

    <div class="items">
      ${items.map((item: any) => {
    const title = item.product?.name_fa || item.productName || 'محصول';
    const desc = getProductDescription(item);
    const lineNote = getLineItemNote(item);
    return `
        <div class="item">
          <div class="item-name-col">
            <span class="item-name">${title}</span>
            ${lineNote ? `<div class="item-details">${lineNote}</div>` : ''}
          </div>
          <div class="item-quantity">${item.quantity}${item.product?.unit && item.product.unit !== 'عدد' ? ` ${item.product.unit}` : ''} ×</div>
        </div>
      `;
  }).join('')}
    </div>

    ${renderBrandFooterHtml(date)}
  </div>
</body>
</html>
  `;
}

