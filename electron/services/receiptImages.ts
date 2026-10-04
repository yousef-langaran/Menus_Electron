import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';
import { cacheImage } from './imageCache';
import { ReceiptLayoutV2, ReceiptLayoutModule } from './printTypes';
import { withTimeout } from './printQueue';
import { getIranYekanFontFaceCss } from './receiptHtml';

/**
 * لاگ تشخیصیِ ماندگار برای مسیر عکسِ چاپ — چون console.log/error در بیلد نهایی جایی دیده
 * نمی‌شود (پنجرهٔ چاپ مخفی است و DevTools باز نیست)، اینجا یک فایل متنی ساده در پوشهٔ
 * دادهٔ کاربر می‌نویسد تا در صورت تکرار مشکلِ «عکس چاپ نمی‌شود»، بشود از خودِ کاربر این
 * فایل را گرفت و علت واقعی را — به‌جای حدس زدن دوباره — از رویِ آن دید.
 */
export function logPrintDebug(line: string): void {
  try {
    const logPath = path.join(app.getPath('userData'), 'print-debug.log');
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${line}\n`);
  } catch {
    // صرفاً بهترین تلاش؛ نبودِ لاگ نباید چاپ را متوقف کند
  }
}

/** همهٔ آدرس‌های عکسِ ماژول‌های تصویر (http/https) را از یک طرح رسید جمع می‌کند. */
export function collectImageUrlsFromLayout(layout: ReceiptLayoutV2): string[] {
  const urls = new Set<string>();
  for (const row of layout.rows || []) {
    const modules: ReceiptLayoutModule[] =
      row.type === 'single'
        ? Array.isArray(row.blocks) && !Array.isArray(row.blocks[0])
          ? (row.blocks as ReceiptLayoutModule[])
          : []
        : Array.isArray(row.blocks)
          ? (row.blocks as ReceiptLayoutModule[][]).flat()
          : [];
    for (const m of modules) {
      const url = m?.type === 'image' ? (m.options?.imageUrl as string | undefined) : undefined;
      if (url && /^https?:\/\//i.test(url)) urls.add(url);
    }
  }
  return Array.from(urls);
}

export const printImageDataUriCache = new Map<string, string>();

/**
 * عکسِ یک ماژول چاپ را به data URI تبدیل می‌کند (کش‌شده روی دیسک از قبل، طبق imageCache.ts).
 * پنجرهٔ چاپ با data:text/html بارگذاری می‌شود، پس src از نوع file:// در آن به‌طور قابل‌اعتماد
 * بارگذاری نمی‌شود (دقیقاً همان مشکلی که فونت ایران‌یکان هم داشت — نگاه کنید به
 * getIranYekanFontFaceCss) — به همین دلیل باید data URI جاسازی شود، نه مسیر فایل محلی.
 * اگر دانلود/کش شکست بخورد، همان URL اصلی برگردانده می‌شود (رفتار قبلی، به‌عنوان fallback)
 * و خطا لاگ می‌شود تا برخلاف قبل، این شکست دیگر کاملاً بی‌صدا نباشد.
 */
export async function resolveImageForPrint(url: string): Promise<string> {
  const cached = printImageDataUriCache.get(url);
  if (cached) {
    logPrintDebug(`resolveImageForPrint: in-memory cache hit for ${url}`);
    return cached;
  }
  logPrintDebug(`resolveImageForPrint: resolving ${url}`);
  try {
    const filePath = await withTimeout(cacheImage(url), 8000, `Image cache timeout: ${url}`);
    if (filePath) {
      const ext = path.extname(filePath).replace('.', '').toLowerCase();
      const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      const bytes = fs.readFileSync(filePath);
      const dataUri = `data:${mime};base64,${bytes.toString('base64')}`;
      printImageDataUriCache.set(url, dataUri);
      logPrintDebug(
        `resolveImageForPrint: OK, cached at ${filePath} (${bytes.length} bytes) -> data URI (${dataUri.length} chars) for ${url}`,
      );
      return dataUri;
    }
    console.error(`[PRINT] ✗ Image caching returned no file, printing without image: ${url}`);
    logPrintDebug(`resolveImageForPrint: FAILED (cacheImage returned no path) for ${url}`);
  } catch (error) {
    console.error(
      `[PRINT] ✗ Failed to load image for printing, printing without image: ${url}`,
      error,
    );
    logPrintDebug(
      `resolveImageForPrint: FAILED for ${url} — ${error instanceof Error ? error.stack || error.message : String(error)}`,
    );
  }
  return url;
}
