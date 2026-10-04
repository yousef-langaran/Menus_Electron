import { pathToFileURL } from 'url';
import { ipcMain, session } from 'electron';
import { cacheImage, getCachedImagePath, cacheImages } from '../services/imageCache';
import {
  loadUserSession as loadUserSessionPrefs,
  saveUserSession as saveUserSessionPrefs,
  updateUserSessionToken as updateUserSessionTokenPrefs,
  clearUserSession as clearUserSessionPrefs,
  loadPrinterConfigs as loadPrinterConfigsPrefs,
  savePrinterConfigs as savePrinterConfigsPrefs,
  loadReceiptNumberSettings,
  saveReceiptNumberSettings,
  loadDefaultPrintTemplate,
  saveDefaultPrintTemplate,
  loadPrintTemplatesMap,
  setPrintTemplateForPrinter,
  refreshCachedPrintTemplates,
  loadReceiptPriceDisplayUnit,
  saveReceiptPriceDisplayUnit,
} from '../database/preferences';

export function registerStorageHandlers(): void {
  ipcMain.handle('load-user-session', async () => {
    try {
      return await loadUserSessionPrefs();
    } catch (error) {
      console.error('Load user session error:', error);
      return null;
    }
  });

  ipcMain.handle('save-user-session', async (_event, sessionData) => {
    try {
      if (sessionData?.user && sessionData?.token) {
        await saveUserSessionPrefs(sessionData.user, sessionData.token);
        return { success: true };
      }
      return { success: false, error: 'missing user or token' };
    } catch (error) {
      console.error('Save user session error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  ipcMain.handle('update-user-session-token', async (_event, token: string) => {
    try {
      await updateUserSessionTokenPrefs(String(token || ''));
      return { success: true };
    } catch (error) {
      console.error('Update user session token error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  ipcMain.handle('clear-user-session', async () => {
    try {
      await clearUserSessionPrefs();
      return { success: true };
    } catch (error) {
      console.error('Clear user session error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  ipcMain.handle('load-printer-configs', async () => {
    try {
      return await loadPrinterConfigsPrefs();
    } catch (error) {
      console.error('Load printer configs error:', error);
      return {};
    }
  });

  ipcMain.handle('save-printer-configs', async (_event, configs) => {
    try {
      await savePrinterConfigsPrefs(configs || {});
      return { success: true };
    } catch (error) {
      console.error('Save printer configs error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  ipcMain.handle('get-default-print-template', async () => {
    try {
      return await loadDefaultPrintTemplate();
    } catch (error) {
      console.error('Load default print template error:', error);
      return null;
    }
  });

  ipcMain.handle('set-default-print-template', async (_event, template: any) => {
    try {
      await saveDefaultPrintTemplate(template ?? null);
      return { success: true };
    } catch (error) {
      console.error('Save default print template error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  ipcMain.handle('get-print-templates-map', async () => {
    try {
      return await loadPrintTemplatesMap();
    } catch (error) {
      console.error('Load print templates map error:', error);
      return {};
    }
  });

  ipcMain.handle(
    'set-print-template-for-printer',
    async (_event, printerName: string, template: any, receiptType?: 'full' | 'kitchen') => {
      try {
        // undefined = ارث‌بری از سطح بالاتر (کلید پاک می‌شود)، null = صراحتاً بدون قالب
        await setPrintTemplateForPrinter(printerName ?? '', template, receiptType);
        return { success: true };
      } catch (error) {
        console.error('Set print template for printer error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
      }
    },
  );

  ipcMain.handle('refresh-cached-print-templates', async (_event, freshTemplates: any[]) => {
    try {
      const changed = await refreshCachedPrintTemplates(
        Array.isArray(freshTemplates) ? freshTemplates : [],
      );
      return { success: true, changed };
    } catch (error) {
      console.error('Refresh cached print templates error:', error);
      return {
        success: false,
        changed: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  ipcMain.handle('get-receipt-number-settings', async () => {
    try {
      return await loadReceiptNumberSettings();
    } catch (error) {
      console.error('Load receipt number settings error:', error);
      return {
        nextNumber: 1,
        resetPolicy: 'never',
        startNumber: 1,
        lastResetDate: '',
        dailyResetTime: '00:00',
      };
    }
  });

  ipcMain.handle('save-receipt-number-settings', async (_event, settings) => {
    try {
      await saveReceiptNumberSettings(settings);
      return { success: true };
    } catch (error) {
      console.error('Save receipt number settings error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  ipcMain.handle('get-receipt-price-display-unit', async () => {
    try {
      return await loadReceiptPriceDisplayUnit();
    } catch (error) {
      console.error('get-receipt-price-display-unit error:', error);
      return 'rial';
    }
  });

  ipcMain.handle('save-receipt-price-display-unit', async (_event, unit: string) => {
    try {
      await saveReceiptPriceDisplayUnit(unit === 'toman' ? 'toman' : 'rial');
      return { success: true };
    } catch (error) {
      console.error('save-receipt-price-display-unit error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  // Image cache handlers
  ipcMain.handle('cache-image', async (_event, imageUrl: string) => {
    try {
      const cachedPath = await cacheImage(imageUrl);
      if (cachedPath) {
        return { success: true, url: pathToFileURL(cachedPath).href };
      }
      return { success: false, error: 'Failed to cache image' };
    } catch (error) {
      console.error('Cache image error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });

  ipcMain.handle('get-cached-image', async (_event, imageUrl: string) => {
    try {
      const cachedPath = getCachedImagePath(imageUrl);
      if (cachedPath) {
        return { success: true, url: pathToFileURL(cachedPath).href };
      }
      return { success: false, url: imageUrl };
    } catch (error) {
      console.error('Get cached image error:', error);
      return { success: false, url: imageUrl };
    }
  });

  ipcMain.handle('cache-images', async (_event, imageUrls: string[]) => {
    try {
      const results = await cacheImages(imageUrls || []);
      const urlMap: Record<string, string> = {};
      for (const [originalUrl, cachedPath] of Object.entries(results)) {
        urlMap[originalUrl] = pathToFileURL(cachedPath).href;
      }
      return { success: true, urls: urlMap };
    } catch (error) {
      console.error('Cache images error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });
}
