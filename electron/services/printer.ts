import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { BrowserWindow } from 'electron';
import {
  getNextReceiptNumber,
  getReceiptNumbersMap,
  setReceiptNumbersForOrder,
  loadReceiptPriceDisplayUnit,
} from '../database/preferences';
import {
  ReceiptType,
  PrinterJob,
  ReceiptTemplateOptions,
  PrintErrorCode,
  PrinterDiscoveryItem,
  PrintFailureDetail,
  PrintOperationError,
  normalizeReceiptLayout,
} from './printTypes';
import {
  mmToMicrons,
  RawPrinter,
  toRawPrinter,
  withTimeout,
  sleep,
  inferPrinterStatusCode,
  mapFailureReasonToCode,
  enqueuePrinterTask,
  createPrintWindow,
} from './printQueue';
import { generateReceiptHTML } from './receiptHtml';
import { generateReceiptHTMLFromLayout, generateKitchenReceiptHTML } from './receiptLayoutHtml';

export type {
  ReceiptType,
  ReceiptLayoutV2,
  ReceiptLayoutRow,
  PrinterJob,
  PrinterStatusCode,
  PrintStatusCode,
  PrintErrorCode,
  PrinterDiscoveryItem,
  PrintFailureDetail,
} from './printTypes';
export { PrintOperationError, normalizeReceiptLayout } from './printTypes';
export { generateReceiptHTML } from './receiptHtml';
export { generateReceiptHTMLFromLayout, generateKitchenReceiptHTML } from './receiptLayoutHtml';

/** نگهداری تنظیمات چاپ پنجرهٔ پیش‌نمایش برای استفاده در IPC */
export const printPreviewOptsMap = new Map<number, any>();

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

function runHidden(
  command: string,
  args: string[],
  input?: Buffer,
): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve) => {
    try {
      const child = spawn(command, args, { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
      let stderr = '';
      child.stderr?.on('data', (chunk) => {
        stderr += String(chunk);
      });
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
export async function openCashDrawer(
  printerName: string,
): Promise<{ success: boolean; error?: string }> {
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
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        script,
      ]);
      if (result.code === 0) return { success: true };
      return {
        success: false,
        error: result.stderr?.trim() || `DRAWER_KICK_FAILED (exit ${result.code})`,
      };
    }

    // لینوکس/مک: چاپ خام CUPS
    const tmpFile = path.join(os.tmpdir(), `secoin-drawer-kick-${Date.now()}.bin`);
    await fs.promises.writeFile(tmpFile, DRAWER_KICK_ESC_POS);
    try {
      const result = await runHidden('lp', ['-d', printerName, '-o', 'raw', tmpFile]);
      if (result.code === 0) return { success: true };
      return {
        success: false,
        error: result.stderr?.trim() || `DRAWER_KICK_FAILED (exit ${result.code})`,
      };
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
  receiptType: ReceiptType,
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
                console.error(
                  `[PRINT] ✗ Print failed: "${printerName}" (${receiptType}), reason: ${failureReason}`,
                );
                reject(new PrintOperationError(mapFailureReasonToCode(failureReason), []));
              }
            },
          );
        }),
        30000,
        `Print timeout after 30s for printer "${printerName}"`,
      );
      return;
    } catch (error) {
      if (attempt === 2) {
        console.error(
          `[PRINT] ✗ All retries exhausted for "${printerName}" (${receiptType})`,
          error,
        );
        throw error instanceof PrintOperationError
          ? error
          : new PrintOperationError('PRINT_JOB_FAILED');
      }
      console.warn(
        `[PRINT] Retry ${attempt + 1} failed for "${printerName}", waiting 600ms before retry...`,
      );
      await sleep(600);
    }
  }
};

const runPrinterJobs = async (
  orderData: any,
  printerName: string,
  jobs: PrinterJob[],
  receiptNumber: number,
): Promise<PrintFailureDetail[]> => {
  console.log(
    `[PRINT] Starting runPrinterJobs for "${printerName}", ${jobs.length} job(s), receipt #${receiptNumber}`,
  );
  const printWindow = createPrintWindow();
  const failures: PrintFailureDetail[] = [];
  const defaultConfig = jobs[0];
  const margin = defaultConfig?.margin ?? 5;
  const marginSame = 5;
  const marginTop = 0;
  const marginBottom = 3;
  const priceDisplayUnit = await loadReceiptPriceDisplayUnit();

  // یک بار در شروع تأیید می‌شود که پرینتر موجود و آنلاین است؛ دیگر لازم نیست
  // به ازای هر نوع رسید (job) دوباره تکرار شود — printReceipt هم پیش از صف کردن
  // این تسک همین بررسی را انجام داده، پس این فقط یک چک تازه‌سازیِ سبک است.
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
  } catch (error) {
    if (!printWindow.isDestroyed()) {
      printWindow.close();
    }
    const code =
      error instanceof PrintOperationError ? error.code : 'PRINT_PRINTER_DISCOVERY_FAILED';
    return jobs.map((job) => ({ printerName, receiptType: job.receiptType || 'full', code }));
  }

  try {
    for (const job of jobs) {
      const receiptType = job.receiptType || 'full';
      console.log(`[PRINT] Processing job: "${printerName}" (${receiptType})`);
      try {
        const paperWidth = job.paperWidth ?? defaultConfig?.paperWidth ?? 80;
        const isNarrow = paperWidth <= 62;
        const shiftLeftMm =
          typeof job.shiftLeftMm === 'number' ? job.shiftLeftMm : isNarrow ? 4 : 6;
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
          ? await generateReceiptHTMLFromLayout(orderData, layout, opts)
          : receiptType === 'kitchen'
            ? generateKitchenReceiptHTML(orderData, opts)
            : generateReceiptHTML(orderData, opts);

        console.log(
          `[PRINT] Loading HTML for "${printerName}" (${receiptType}), length: ${receiptHTML.length} chars`,
        );
        await withTimeout(
          printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(receiptHTML)}`),
          10000,
          `HTML load timeout for printer "${printerName}"`,
        );
        // تصاویر رسید از قبل به data URI کش شده‌اند (imageCache)، پس بعد از
        // did-finish-load چیزی async باقی نمی‌ماند که منتظرش بمانیم؛ فقط یک
        // فاصلهٔ کوچک برای پایان‌یافتن layout/paint کافی است.
        await sleep(150);

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
          console.log(
            `[PRINT] Printing copy ${copyIndex + 1}/${copies} for "${printerName}" (${receiptType})`,
          );
          await printCopyWithRetry(
            printWindow,
            {
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
            },
            printerName,
            receiptType,
          );
          await sleep(150);
        }
        console.log(`[PRINT] ✓ Job completed: "${printerName}" (${receiptType})`);
      } catch (error) {
        const code = error instanceof PrintOperationError ? error.code : 'PRINT_UNKNOWN_ERROR';
        console.error(
          `[PRINT] ✗ Job failed: "${printerName}" (${receiptType}), code: ${code}`,
          error,
        );
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
  orderKeys?: string | string[],
): Promise<number> {
  const orderNumber = orderData?.orderNumber || orderData?.order_number || orderData?.id || 'N/A';
  console.log(`[PRINT] ===== Starting print job for order #${orderNumber} =====`);
  console.log(`[PRINT] Total printer jobs: ${printerJobs.length}`);

  if (!printerJobs || printerJobs.length === 0) {
    console.error('[PRINT] ✗ No printers selected');
    throw new PrintOperationError('PRINT_NO_PRINTER_SELECTED');
  }

  const detectedPrinters = await detectPrinters();
  console.log(
    `[PRINT] Detected ${detectedPrinters.length} printer(s):`,
    detectedPrinters.map((p) => `${p.name} (${p.statusCode})`).join(', '),
  );
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
    setReceiptNumbersForOrder(
      keys.map((k) => String(k)),
      receiptNumber,
    );
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
      enqueuePrinterTask(printerName, () =>
        runPrinterJobs(orderData, printerName, jobs, receiptNumber),
      ).catch((error) => {
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
      }),
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

export async function renderReceiptPreview(
  orderData: any,
  options: ReceiptTemplateOptions = {},
): Promise<{ html: string; imageDataUrl?: string }> {
  const priceDisplayUnit = options.priceDisplayUnit ?? (await loadReceiptPriceDisplayUnit());
  const resolvedOptions: ReceiptTemplateOptions = { ...options, priceDisplayUnit };
  const receiptType = resolvedOptions.receiptType || 'full';
  const layout = normalizeReceiptLayout(resolvedOptions.layout);
  const html = layout
    ? await generateReceiptHTMLFromLayout(orderData, layout, resolvedOptions)
    : receiptType === 'kitchen'
      ? generateKitchenReceiptHTML(orderData, resolvedOptions)
      : generateReceiptHTML(orderData, resolvedOptions);
  // برای پیش‌نمایش حاشیهٔ چپ و راست اضافه می‌کنیم تا محتوا از هیچ طرف بریده نشود
  const previewHtml = html.replace(
    '</head>',
    '<style id="preview-padding">html, body { padding-left: 24px !important; padding-right: 24px !important; box-sizing: border-box; }</style></head>',
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
    const rect = (await previewWindow.webContents
      .executeJavaScript(
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
      })()`,
      )
      .catch(() => ({ x: 0, y: 0, width: 400, height: 900 }))) as {
      x: number;
      y: number;
      width: number;
      height: number;
    };

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
export async function showSystemPrintDialog(
  orderData: any,
  options: ReceiptTemplateOptions & { receiptType?: ReceiptType } = {},
  printerName?: string,
): Promise<void> {
  const receiptType = options.receiptType || 'full';
  const paperWidth = typeof options.paperWidth === 'number' ? options.paperWidth : 80;
  const margin = typeof options.margin === 'number' ? Math.max(0, options.margin) : 5;
  const isNarrow = paperWidth <= 62;
  const marginSame = 5;
  const shiftLeftMm = isNarrow ? 12 : 14;
  const contentWidthMm =
    typeof options.contentWidthMm === 'number'
      ? options.contentWidthMm
      : Math.max(32, paperWidth - marginSame * 2 - shiftLeftMm);
  const marginTop = 0;
  const marginBottom = 3;

  const layout = normalizeReceiptLayout(options.layout);
  const htmlOptions = { ...options, paperWidth, margin, contentWidthMm, shiftLeftMm };
  const html = layout
    ? await generateReceiptHTMLFromLayout(orderData, layout, htmlOptions)
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
