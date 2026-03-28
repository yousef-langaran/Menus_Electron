import { net } from 'electron';

export async function isOnline(): Promise<boolean> {
  return new Promise((resolve) => {
    // خواندن آدرس‌ها از متغیرهای محیطی با در نظر گرفتن مقادیر پیش‌فرض
    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.hoshmenu.ir';
    const apiVersion = process.env.NEXT_PUBLIC_API_BASE_VERSION || '/api/v1';

    // ترکیب آدرس: https://api.hoshmenu.ir/api/v1
    const targetUrl = `${baseUrl}${apiVersion}`;

    const request = net.request({
      method: 'GET',
      url: targetUrl,
    });

    // تایم‌اوت 3 ثانیه‌ای (3000 میلی‌ثانیه)
    const timeoutId = setTimeout(() => {
      request.abort();
      resolve(false); // زمان گذشت و پاسخی نیامد -> آفلاین
    }, 3000);

    // دریافت هرگونه پاسخ از سرور (حتی 404 یا 401) به معنای اتصال به اینترنت و سرور است
    request.on('response', (response) => {
      clearTimeout(timeoutId);
      resolve(true); // سرور در دسترس است -> آنلاین
    });

    // در صورت خطای شبکه (مثل قطعی اینترنت یا پیدا نشدن DNS)
    request.on('error', () => {
      clearTimeout(timeoutId);
      resolve(false); // خطای شبکه -> آفلاین
    });

    request.end();
  });
}
