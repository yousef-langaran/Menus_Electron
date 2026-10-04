import * as path from 'path';
import { app, ipcMain } from 'electron';
import { checkForUpdates, startUpdateDownload, quitAndInstall } from '../updater';

export function registerUpdaterHandlers(): void {
  // بروزرسانی خودکار

  ipcMain.handle('check-for-updates', async () => {
    return await checkForUpdates();
  });
  ipcMain.handle('start-update-download', () => {
    startUpdateDownload();
  });
  ipcMain.handle('quit-and-install', () => {
    quitAndInstall();
  });

  // اطلاعات مسیر ذخیره‌سازی داده‌ها
  ipcMain.handle('get-data-dir', () => {
    const userData = app.getPath('userData');
    return {
      userData,
      files: {
        'تنظیمات برنامه': path.join(userData, 'menus-preferences.json'),
        'شماره‌گذاری فیش': path.join(userData, 'receipt-counter.json'),
        'نقشه شماره رسید': path.join(userData, 'receipt-numbers.json'),
        'سفارش‌های آفلاین': path.join(userData, 'offline-orders.json'),
        'کش تصاویر': path.join(userData, 'imageCache'),
      },
    };
  });
}
