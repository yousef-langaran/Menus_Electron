import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import * as https from 'https';
import * as http from 'http';

function getImageCacheDir(): string {
  return path.join(app.getPath('userData'), 'imageCache');
}

// تابع برای اطمینان از وجود پوشه cache
function ensureCacheDir(): string {
  const cacheDir = getImageCacheDir();
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  return cacheDir;
}

// تابع برای تبدیل URL به نام فایل
function urlToFilename(imageUrl: string): string {
  // حذف پروتکل و دامنه
  const urlPath = imageUrl.replace(/^https?:\/\/[^\/]+/, '');
  // تبدیل کاراکترهای غیرمجاز به underscore
  const safeName = urlPath.replace(/[^a-zA-Z0-9._-]/g, '_');
  // اضافه کردن پسوند .jpg در صورت عدم وجود
  return safeName.endsWith('.jpg') || safeName.endsWith('.png') || safeName.endsWith('.webp')
    ? safeName
    : `${safeName}.jpg`;
}

// تابع برای دانلود و ذخیره عکس
export async function cacheImage(imageUrl: string): Promise<string | null> {
  try {
    const cacheDir = ensureCacheDir();
    const filename = urlToFilename(imageUrl);
    const filePath = path.join(cacheDir, filename);

    // اگر عکس قبلاً cache شده باشد، مسیر آن را برگردان
    if (fs.existsSync(filePath)) {
      return filePath;
    }

    // دانلود عکس
    return new Promise((resolve, reject) => {
      const protocol = imageUrl.startsWith('https') ? https : http;
      
      protocol.get(imageUrl, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download image: ${response.statusCode}`));
          return;
        }

        const fileStream = fs.createWriteStream(filePath);
        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          resolve(filePath);
        });

        fileStream.on('error', (err) => {
          fs.unlink(filePath, () => {}); // حذف فایل ناقص
          reject(err);
        });
      }).on('error', (err) => {
        reject(err);
      });
    });
  } catch (error) {
    console.error('Error caching image:', error);
    return null;
  }
}

// تابع برای دریافت مسیر عکس از cache (در صورت وجود)
export function getCachedImagePath(imageUrl: string): string | null {
  try {
    const cacheDir = getImageCacheDir();
    const filename = urlToFilename(imageUrl);
    const filePath = path.join(cacheDir, filename);

    if (fs.existsSync(filePath)) {
      return filePath;
    }

    return null;
  } catch (error) {
    console.error('Error getting cached image path:', error);
    return null;
  }
}

// تابع برای cache کردن چند عکس به صورت همزمان
export async function cacheImages(imageUrls: string[]): Promise<Record<string, string>> {
  const results: Record<string, string> = {};

  // فیلتر کردن URLهای تکراری
  const uniqueUrls = Array.from(new Set(imageUrls));

  // دانلود عکس‌ها به صورت موازی (با محدودیت 5 همزمان)
  const batchSize = 5;
  for (let i = 0; i < uniqueUrls.length; i += batchSize) {
    const batch = uniqueUrls.slice(i, i + batchSize);
    const promises = batch.map(async (url) => {
      try {
        const cachedPath = await cacheImage(url);
        if (cachedPath) {
          results[url] = cachedPath;
        }
      } catch (error) {
        console.error(`Failed to cache image ${url}:`, error);
      }
    });

    await Promise.all(promises);
  }

  return results;
}

// تابع برای پاک کردن cache قدیمی (اختیاری)
export function clearImageCache(): void {
  try {
    const cacheDir = getImageCacheDir();
    if (!fs.existsSync(cacheDir)) {
      return;
    }
    const files = fs.readdirSync(cacheDir);
    files.forEach((file) => {
      const filePath = path.join(cacheDir, file);
      fs.unlinkSync(filePath);
    });
  } catch (error) {
    console.error('Error clearing image cache:', error);
  }
}

// تابع برای دریافت URL محلی برای نمایش در renderer
export function getImageUrl(imageUrl: string): string {
  const cachedPath = getCachedImagePath(imageUrl);
  if (cachedPath) {
    // در Electron می‌توانیم از file:// protocol استفاده کنیم
    return `file://${cachedPath}`;
  }
  return imageUrl; // اگر cache نشده باشد، URL اصلی را برگردان
}

