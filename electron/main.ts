import { config as dotenvConfig } from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

import { app, BrowserWindow, ipcMain, dialog, session } from 'electron';

// بارگذاری .env — در build: کنار exe یا در userData؛ در dev: روت پروژه
function loadEnv() {
  const exeDir = path.dirname(app.getPath('exe'));
  const userDataDir = app.getPath('userData');
  const envNextToExe = path.join(exeDir, '.env');
  const envInUserData = path.join(userDataDir, '.env');
  const envInCwd = path.join(process.cwd(), '.env');
  const envNextToMain = path.join(__dirname, '..', '.env');

  const paths = app.isPackaged
    ? [envNextToExe, envInUserData, envInCwd]
    : [envInCwd, envNextToMain, envNextToExe, envInUserData];

  for (const p of paths) {
    if (fs.existsSync(p)) {
      dotenvConfig({ path: p });
      break;
    }
  }
  if (app.isPackaged && !process.env.API_BASE_URL && !process.env.NEXT_PUBLIC_API_BASE_URL && !process.env.VITE_API_BASE_URL) {
    console.warn('[Menus] برای حالت build یک فایل .env قرار بده. مسیرهای چک‌شده: کنار exe =', exeDir, 'یا در userData =', userDataDir);
  }
}
loadEnv();
import { isOnline } from './utils/network';
import { syncOfflineOrders } from './services/sync';
import { printReceipt, renderReceiptPreview, showSystemPrintDialog, printPreviewOptsMap } from './services/printer';
import { cacheImage, getCachedImagePath, cacheImages, getImageUrl } from './services/imageCache';
import { saveOfflineOrder as dbSaveOfflineOrder, getAllOrders } from './database/orders';
import {
  loadUserSession as loadUserSessionPrefs,
  saveUserSession as saveUserSessionPrefs,
  clearUserSession as clearUserSessionPrefs,
  loadPrinterConfigs as loadPrinterConfigsPrefs,
  savePrinterConfigs as savePrinterConfigsPrefs,
  loadReceiptNumberSettings,
  saveReceiptNumberSettings,
  getNextReceiptNumberPreview,
  getReceiptNumbersMap,
  assignReceiptNumberForOrder,
} from './database/preferences';
import { getApiConfig } from './config/api';
import { setupAutoUpdater, checkForUpdates, startUpdateDownload, quitAndInstall } from './updater';

let mainWindow: BrowserWindow | null = null;
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const DEEP_LINK_PROTOCOL = 'hosh-menu';
const PROTOCOL_PREFIX = `${DEEP_LINK_PROTOCOL}://`;
let pendingDeepLinkUrl: string | null = null;

if (process.platform === 'win32') {
  const urlArg = process.argv.find((arg) => arg.startsWith(PROTOCOL_PREFIX));
  if (urlArg) {
    pendingDeepLinkUrl = urlArg;
  }
}

const focusMainWindow = () => {
  if (!mainWindow) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();

  if (pendingDeepLinkUrl) {
    mainWindow.webContents.send('deep-link-open-order', pendingDeepLinkUrl);
    pendingDeepLinkUrl = null;
  }
};

const handleDeepLinkNavigation = (url: string) => {
  pendingDeepLinkUrl = url;
  focusMainWindow();
};

const registerDeepLinkProtocol = () => {
  try {
    if (process.defaultApp && process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(DEEP_LINK_PROTOCOL, process.execPath, [
        path.resolve(process.argv[1]),
      ]);
    } else {
      app.setAsDefaultProtocolClient(DEEP_LINK_PROTOCOL);
    }
  } catch (error) {
    console.warn('Could not register deep-link protocol', error);
  }
};

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const urlArg = argv.find((arg) => arg.startsWith(PROTOCOL_PREFIX));

    if (urlArg) {
      handleDeepLinkNavigation(urlArg);
      return;
    }

    focusMainWindow();
  });
}

if (process.platform === 'darwin') {
  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleDeepLinkNavigation(url);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, '../assets/icon.png'),
    title: 'hosh menu',
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3002');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist-react/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.once('ready-to-show', () => {
    focusMainWindow();
  });
}

app.whenReady().then(() => {
  registerDeepLinkProtocol();
  // Configure CORS for API requests
  // Add CORS headers to all responses
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Access-Control-Allow-Origin': ['*'],
        'Access-Control-Allow-Methods': ['GET, POST, PUT, DELETE, OPTIONS'],
        'Access-Control-Allow-Headers': ['Content-Type, Authorization, x-restaurant-name, x-selected-restaurant-id, x-domain-type'],
      },
    });
  });

  createWindow();
  setupAutoUpdater(mainWindow);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      setupAutoUpdater(mainWindow);
    }
  });

  // Check for online status periodically and sync
  setInterval(async () => {
    if (await isOnline()) {
      try {
        await syncOfflineOrders();
      } catch (error) {
        console.error('Sync error:', error);
      }
    }
  }, 30000); // Check every 30 seconds
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
ipcMain.handle('get-api-config', async () => {
  return getApiConfig();
});

ipcMain.handle('check-online', async () => {
  return await isOnline();
});

ipcMain.handle('sync-orders', async (_event, token?: string) => {
  try {
    return await syncOfflineOrders(token);
  } catch (error) {
    console.error('Sync error:', error);
    throw error;
  }
});

ipcMain.handle('print-receipt', async (event, orderData, printerJobs, orderKeys) => {
  try {
    const receiptNumber = await printReceipt(orderData, printerJobs, orderKeys);
    return { success: true, receiptNumber };
  } catch (error) {
    console.error('Print error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error', receiptNumber: 0 };
  }
});

ipcMain.handle('get-receipt-numbers-map', async () => {
  try {
    const map = getReceiptNumbersMap();
    console.log('[شماره رسید] خواندن نقشه از main. تعداد کلیدها:', Object.keys(map).length, 'کلیدها:', Object.keys(map));
    return map;
  } catch (error) {
    console.error('get-receipt-numbers-map error:', error);
    return {};
  }
});

ipcMain.handle('assign-receipt-number-for-order', async (_event, orderKeys: string[]) => {
  try {
    return await assignReceiptNumberForOrder(orderKeys || []);
  } catch (error) {
    console.error('assign-receipt-number-for-order error:', error);
    return 0;
  }
});

ipcMain.handle('generate-receipt-preview', async (_event, payload) => {
  try {
    const { orderData, options } = payload || {};
    let receiptNumber = 0;
    if (orderData?.receiptCallNumber != null && Number.isInteger(orderData.receiptCallNumber)) {
      receiptNumber = Number(orderData.receiptCallNumber);
    } else {
      try {
        receiptNumber = await getNextReceiptNumberPreview();
      } catch (e) {
        console.warn('Receipt number preview failed, using 0:', e);
      }
    }
    const mergedOptions = { ...(options || {}), receiptNumber };
    const { html, imageDataUrl } = await renderReceiptPreview(orderData, mergedOptions);
    return { success: true, html, imageDataUrl };
  } catch (error) {
    console.error('Generate receipt preview error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

ipcMain.handle('open-print-preview-window', async (_event, payload) => {
  try {
    const { orderData, options, printerName } = payload || {};
    let receiptNumber = 0;
    if (orderData?.receiptCallNumber != null && Number.isInteger(orderData.receiptCallNumber)) {
      receiptNumber = Number(orderData.receiptCallNumber);
    } else {
      try {
        receiptNumber = await getNextReceiptNumberPreview();
      } catch (e) {
        console.warn('Receipt number preview failed, using 0:', e);
      }
    }
    const mergedOptions = { ...(options || {}), receiptNumber };
    await showSystemPrintDialog(orderData, mergedOptions, printerName);
    return { success: true };
  } catch (error) {
    console.error('Open print preview window error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.on('receipt-preview-print', (event) => {
  const opts = printPreviewOptsMap.get(event.sender.id);
  if (opts) {
    event.sender.print(opts, () => {});
  }
});

ipcMain.handle('get-printers', async () => {
  try {
    if (!mainWindow) {
      return [];
    }
    // In Electron, we need to use a different approach to get printers
    // Create a temporary hidden window to access printer list
    const tempWindow = new BrowserWindow({ 
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      }
    });
    
    // Load a blank page to initialize webContents
    await tempWindow.loadURL('data:text/html,<html><body></body></html>');
    
    // Get printers using the webContents
    let printers: any[] = [];
    try {
      // Try getPrintersAsync first (Electron 20+)
      if (typeof tempWindow.webContents.getPrintersAsync === 'function') {
        printers = await tempWindow.webContents.getPrintersAsync();
      } else if (typeof (tempWindow.webContents as any).getPrinters === 'function') {
        // Fallback for older Electron versions
        printers = (tempWindow.webContents as any).getPrinters();
      }
    } catch (err) {
      console.warn('Could not get printers:', err);
    }
    
    tempWindow.close();
    
    return printers.map((p: any) => ({
      name: p.name || '',
      displayName: p.displayName || p.name || '',
      description: p.description || '',
    }));
  } catch (error) {
    console.error('Get printers error:', error);
    return [];
  }
});

ipcMain.handle('show-message-box', async (event, options) => {
  if (mainWindow) {
    const result = await dialog.showMessageBox(mainWindow, options);
    return result;
  }
  return { response: 0 };
});

ipcMain.handle('save-offline-order', async (event, orderData, token, baseURL) => {
  try {
    const orderId = await dbSaveOfflineOrder(orderData, token, baseURL);
    return { success: true, orderId };
  } catch (error) {
    console.error('Save offline order error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.handle('get-offline-orders', async () => {
  try {
    const orders = await getAllOrders();
    return orders;
  } catch (error) {
    console.error('Get offline orders error:', error);
    return [];
  }
});

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
    }
    return { success: true };
  } catch (error) {
    console.error('Save user session error:', error);
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

ipcMain.handle('get-receipt-number-settings', async () => {
  try {
    return await loadReceiptNumberSettings();
  } catch (error) {
    console.error('Load receipt number settings error:', error);
    return { nextNumber: 1, resetPolicy: 'never', startNumber: 1, lastResetDate: '', dailyResetTime: '00:00' };
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

// Image cache handlers
ipcMain.handle('cache-image', async (_event, imageUrl: string) => {
  try {
    const cachedPath = await cacheImage(imageUrl);
    if (cachedPath) {
      // تبدیل به file:// URL برای استفاده در renderer
      return { success: true, url: `file://${cachedPath}` };
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
      return { success: true, url: `file://${cachedPath}` };
    }
    return { success: false, url: imageUrl }; // اگر cache نشده باشد، URL اصلی را برگردان
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
      urlMap[originalUrl] = `file://${cachedPath}`;
    }
    return { success: true, urls: urlMap };
  } catch (error) {
    console.error('Cache images error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

// بروزرسانی خودکار
ipcMain.handle('check-for-updates', async () => {
  await checkForUpdates();
});
ipcMain.handle('start-update-download', () => {
  startUpdateDownload();
});
ipcMain.handle('quit-and-install', () => {
  quitAndInstall();
});
