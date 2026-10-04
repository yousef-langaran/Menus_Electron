import { app, ipcMain, shell } from 'electron';
import { isOnline } from '../utils/network';
import { getApiConfig } from '../config/api';

export function registerCoreHandlers(deps: {
  isSafeExternalUrl: (rawUrl: string) => URL | null;
}): void {
  const { isSafeExternalUrl } = deps;
  ipcMain.handle('get-api-config', async () => {
    return getApiConfig();
  });

  // نسخه‌ی نصب‌شده‌ی برنامه — برای بررسی اجباری‌بودن به‌روزرسانی هنگام ورود
  ipcMain.handle('app:get-version', async () => {
    return app.getVersion();
  });

  // نسخه به‌صورت sync — تا هدر x-client-version روی همان اولین درخواست هم حاضر باشد
  ipcMain.on('app:get-version-sync', (event) => {
    event.returnValue = app.getVersion();
  });

  ipcMain.handle('check-online', async () => {
    return await isOnline();
  });

  // باز کردن یک لینک در مرورگر پیش‌فرض سیستم (مثلاً پنل وب مدیریت)
  // منطق اعتبارسنجی پروتکل با setWindowOpenHandler/will-navigate در isSafeExternalUrl مشترک است.
  ipcMain.handle('open-external', async (_event, url: string) => {
    const parsed = isSafeExternalUrl(url);
    if (!parsed) {
      return { success: false, error: 'INVALID_PROTOCOL' };
    }
    try {
      await shell.openExternal(parsed.toString());
      return { success: true };
    } catch (err: any) {
      return { success: false, error: String(err?.message || 'INVALID_URL') };
    }
  });
}
