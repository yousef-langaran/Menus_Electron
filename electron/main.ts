import { config as dotenvConfig } from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { pathToFileURL } from 'url';

import { app, BrowserWindow, nativeImage, ipcMain, dialog, session } from 'electron';
import axios from 'axios';

// بارگذاری .env — در build: کنار exe یا در userData؛ در dev: روت پروژه
// چند مسیر پشت‌سرهم با override: آخرین فایل موجود برای هر کلید برنده است (مثلاً userData روی exe).
function loadEnv() {
  const exeDir = path.dirname(app.getPath('exe'));
  const userDataDir = app.getPath('userData');
  const envNextToExe = path.join(exeDir, '.env');
  const envInUserData = path.join(userDataDir, '.env');
  const envInCwd = path.join(process.cwd(), '.env');
  const envNextToMain = path.join(__dirname, '..', '.env');
  const envInResources = path.join(process.resourcesPath, '.env');

  const paths = app.isPackaged
    ? [envNextToExe, envInUserData, envInResources, envInCwd]
    : [envNextToExe, envInUserData, envNextToMain, envInCwd];

  for (const p of paths) {
    if (fs.existsSync(p)) {
      dotenvConfig({ path: p, override: true });
    }
  }
  if (app.isPackaged && !process.env.API_BASE_URL && !process.env.NEXT_PUBLIC_API_BASE_URL && !process.env.VITE_API_BASE_URL) {
    console.warn('[Menus] برای حالت build یک فایل .env قرار بده. مسیرهای چک‌شده: کنار exe =', exeDir, 'یا در userData =', userDataDir);
  }
}
loadEnv();
import { isOnline } from './utils/network';
import { syncOfflineOrders, syncOfflineReturns } from './services/sync';
import {
  printReceipt,
  renderReceiptPreview,
  printPreviewOptsMap,
  detectPrinters,
  PrintOperationError,
} from './services/printer';
import { cacheImage, getCachedImagePath, cacheImages, getImageUrl } from './services/imageCache';
import { saveOfflineOrder as dbSaveOfflineOrder, getAllOrders } from './database/orders';
import { saveOfflineReturn as dbSaveOfflineReturn, getAllReturns } from './database/returns';
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
  getNextReceiptNumberPreview,
  getReceiptNumbersMap,
  assignReceiptNumberForOrder,
  loadScaleSettings,
  saveScaleSettings,
  loadReceiptPriceDisplayUnit,
  saveReceiptPriceDisplayUnit,
  loadCardTerminalSettings,
  saveCardTerminalSettings,
  loadCardTerminalConfig,
  saveCardTerminalConfig,
  type CardTerminalSettings,
  loadCallerIdSettings,
  saveCallerIdSettings,
  loadCallHistory,
  saveCallHistory,
  loadPosWarehouseId,
  savePosWarehouseId,
} from './database/preferences';
import { startCallerIdWebhook, stopCallerIdWebhook, getWebhookStatus } from './services/callerIdWebhook';
import { callerIdSerialService, setupCallerIdSerial } from './services/callerIdSerial';
import { callerIdHidService, setupCallerIdHid, listHidDevices } from './services/callerIdHid';
import { getApiConfig } from './config/api';
import { scaleService, listSerialPorts } from './services/scale';
import { setupAutoUpdater, checkForUpdates, startUpdateDownload, quitAndInstall } from './updater';

/** مسیر فایل‌های asset برای هر دو حالت dev و packaged */
function getAssetPath(...parts: string[]): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'assets', ...parts)
    : path.join(__dirname, '..', 'assets', ...parts);
}

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
    icon: nativeImage.createFromPath(getAssetPath('icon.png')),
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
        'Access-Control-Allow-Methods': ['GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS'],
        'Access-Control-Allow-Headers': ['Content-Type, Authorization, x-restaurant-name, x-selected-restaurant-id, x-domain-type'],
      },
    });
  });

  createWindow();
  setupAutoUpdater(mainWindow);
  loadCallerIdSettings().then((s) => {
    if (s.inputMode === 'serial') {
      setupCallerIdSerial(
        { enabled: s.enabled, portName: s.serialPortName, baudRate: s.serialBaudRate, format: s.serialFormat },
        () => mainWindow,
      );
    } else if (s.inputMode === 'hid') {
      setupCallerIdHid({ enabled: s.enabled }, () => mainWindow);
    } else {
      startCallerIdWebhook(() => mainWindow).catch((e) => console.error('[CallerID] webhook start error:', e));
    }
  }).catch(() => {});

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      setupAutoUpdater(mainWindow);
    }
  });

  // سفارش‌های آفلاین فقط از رندرر با IPC «sync-orders» و توکن زندهٔ zustand سینک می‌شوند
  // (سینک دوره‌ای بدون توکن، نشست ذخیره‌شدهٔ قدیمی main را می‌فرستاد و 401 می‌گرفت).
});

app.on('window-all-closed', () => {
  stopCallerIdWebhook().catch(() => {});
  callerIdSerialService.disconnect().catch(() => {});
  callerIdHidService.disconnect().catch(() => {});
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
ipcMain.handle('get-api-config', async () => {
  return getApiConfig();
});

// نسخه‌ی نصب‌شده‌ی برنامه — برای بررسی اجباری‌بودن به‌روزرسانی هنگام ورود
ipcMain.handle('app:get-version', async () => {
  return app.getVersion();
});

ipcMain.handle('check-online', async () => {
  return await isOnline();
});

function pickByPath(source: any, pathExpr: string): any {
  const clean = String(pathExpr || '').trim();
  if (!clean) return undefined;
  return clean.split('.').reduce((acc: any, part) => {
    if (acc == null) return undefined;
    return acc[part];
  }, source);
}

function isTruthyApiValue(value: any): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    return ['1', 'true', 'ok', 'success', 'successful', 'approved'].includes(v);
  }
  return Boolean(value);
}

async function sendAmountUsingCardTerminalSettings(
  settings: CardTerminalSettings,
  payload: { amount?: number; orderId?: number; restaurantId?: number },
) {
  const amount = Number(payload?.amount || 0);
  if (!(amount > 0)) {
    return { success: false, error: 'مبلغ معتبر نیست' };
  }
  if (!settings.enabled) {
    return { success: false, error: 'کارتخوان در تنظیمات دسکتاپ غیرفعال است' };
  }
  if (!settings.endpointUrl?.trim()) {
    return { success: false, error: 'آدرس API کارتخوان تنظیم نشده است' };
  }

  const amountToSend =
    settings.sendAmountUnit === 'rial' ? Math.round(amount * 10) : Math.round(amount);

  const requestBody: Record<string, any> = {
    [settings.amountFieldName || 'amount']: amountToSend,
  };
  const orderId = Number(payload?.orderId || 0);
  const restaurantId = Number(payload?.restaurantId || 0);
  if (orderId > 0 && settings.orderIdFieldName) {
    requestBody[settings.orderIdFieldName] = orderId;
  }
  if (restaurantId > 0 && settings.restaurantIdFieldName) {
    requestBody[settings.restaurantIdFieldName] = restaurantId;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (settings.authToken?.trim()) {
    headers[settings.authHeaderName || 'Authorization'] = settings.authToken.trim();
  }

  const response = await axios.request({
    method: settings.httpMethod || 'POST',
    url: settings.endpointUrl.trim(),
    data: requestBody,
    headers,
    timeout: Number(settings.timeoutMs || 10000),
  });

  const responseData = response?.data;
  const successValue = pickByPath(responseData, settings.successFieldPath || 'success');
  const messageValue = pickByPath(responseData, settings.messageFieldPath || 'message');
  const refValue = pickByPath(responseData, settings.referenceFieldPath || 'refId');
  const ok = successValue === undefined ? true : isTruthyApiValue(successValue);
  if (!ok) {
    return {
      success: false,
      error: String(messageValue || 'پرداخت توسط کارتخوان ناموفق بود'),
      refId: refValue != null ? String(refValue) : undefined,
    };
  }
  return {
    success: true,
    message: String(messageValue || 'درخواست با موفقیت به کارتخوان ارسال شد'),
    refId: refValue != null ? String(refValue) : undefined,
  };
}

async function resolveCardTerminalSettingsByProfile(profileId?: string): Promise<CardTerminalSettings> {
  const config = await loadCardTerminalConfig();
  const selected =
    (profileId ? config.profiles.find((p) => p.id === profileId) : undefined) ||
    config.profiles.find((p) => p.id === config.defaultProfileId) ||
    config.profiles[0];
  if (selected) {
    return selected.settings;
  }
  return loadCardTerminalSettings();
}

ipcMain.handle('get-card-terminal-settings', async () => {
  try {
    return await loadCardTerminalSettings();
  } catch (error) {
    console.error('get-card-terminal-settings error:', error);
    return {
      enabled: false,
      endpointUrl: '',
      httpMethod: 'POST',
      timeoutMs: 10000,
      amountFieldName: 'amount',
      orderIdFieldName: 'orderId',
      restaurantIdFieldName: 'restaurantId',
      sendAmountUnit: 'toman',
      authHeaderName: 'Authorization',
      authToken: '',
      successFieldPath: 'success',
      messageFieldPath: 'message',
      referenceFieldPath: 'refId',
    };
  }
});

ipcMain.handle('get-card-terminal-config', async () => {
  try {
    return await loadCardTerminalConfig();
  } catch (error) {
    console.error('get-card-terminal-config error:', error);
    return { profiles: [], defaultProfileId: null };
  }
});

ipcMain.handle('save-card-terminal-settings', async (_event, settings: Partial<CardTerminalSettings>) => {
  try {
    const saved = await saveCardTerminalSettings(settings || {});
    return { success: true, settings: saved };
  } catch (error) {
    console.error('save-card-terminal-settings error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.handle('save-card-terminal-config', async (_event, config: any) => {
  try {
    const saved = await saveCardTerminalConfig(config || {});
    return { success: true, config: saved };
  } catch (error) {
    console.error('save-card-terminal-config error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.handle(
  'test-card-terminal-connection',
  async (
    _event,
    payload: { amount?: number; orderId?: number; restaurantId?: number; terminalProfileId?: string },
  ) => {
    try {
      const settings = await resolveCardTerminalSettingsByProfile(payload?.terminalProfileId);
      return await sendAmountUsingCardTerminalSettings(settings, {
        amount: Number(payload?.amount || 1000),
        orderId: payload?.orderId,
        restaurantId: payload?.restaurantId,
      });
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        'خطا در تست ارتباط کارتخوان';
      return { success: false, error: String(message) };
    }
  },
);

ipcMain.handle(
  'send-amount-to-card-terminal',
  async (
    _event,
    payload: {
      amount?: number;
      orderId?: number;
      restaurantId?: number;
      terminalProfileId?: string;
    },
  ) => {
    try {
      const settings = await resolveCardTerminalSettingsByProfile(payload?.terminalProfileId);
      return await sendAmountUsingCardTerminalSettings(settings, payload || {});
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        'ارسال مبلغ به کارتخوان ناموفق بود';
      return { success: false, error: String(message) };
    }
  },
);

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
    return { status: 'PRINT_OK', receiptNumber };
  } catch (error) {
    console.error('Print error:', error);
    if (error instanceof PrintOperationError) {
      return {
        status: 'PRINT_ERROR',
        code: error.code,
        details: error.details,
        receiptNumber: 0,
      };
    }
    return { status: 'PRINT_ERROR', code: 'PRINT_UNKNOWN_ERROR', details: [], receiptNumber: 0 };
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

ipcMain.on('receipt-preview-print', (event) => {
  const opts = printPreviewOptsMap.get(event.sender.id);
  if (opts) {
    event.sender.print(opts, () => {});
  }
});

ipcMain.handle('get-printers', async () => {
  try {
    return await detectPrinters();
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

ipcMain.handle('save-offline-return', async (_event, returnData, token, baseURL) => {
  try {
    const returnId = await dbSaveOfflineReturn(returnData, token, baseURL);
    return { success: true, returnId };
  } catch (error) {
    console.error('Save offline return error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.handle('get-offline-returns', async () => {
  try {
    return await getAllReturns();
  } catch (error) {
    console.error('Get offline returns error:', error);
    return [];
  }
});

ipcMain.handle('sync-returns', async (_event, token?: string) => {
  try {
    return await syncOfflineReturns(token);
  } catch (error) {
    console.error('Sync returns error:', error);
    throw error;
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

ipcMain.handle('set-print-template-for-printer', async (_event, printerName: string, template: any) => {
  try {
    await setPrintTemplateForPrinter(printerName ?? '', template ?? null);
    return { success: true };
  } catch (error) {
    console.error('Set print template for printer error:', error);
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

ipcMain.handle('get-receipt-price-display-unit', async () => {
  try {
    return await loadReceiptPriceDisplayUnit();
  } catch (error) {
    console.error('get-receipt-price-display-unit error:', error);
    return 'toman';
  }
});

ipcMain.handle('save-receipt-price-display-unit', async (_event, unit: string) => {
  try {
    await saveReceiptPriceDisplayUnit(unit === 'rial' ? 'rial' : 'toman');
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

// ─── Scale IPC Handlers ──────────────────────────────────────────────────────

ipcMain.handle('scale:list-ports', async () => {
  try {
    return await listSerialPorts();
  } catch (err: any) {
    return [];
  }
});

ipcMain.handle('scale:load-settings', async () => {
  try {
    return await loadScaleSettings();
  } catch (err: any) {
    return null;
  }
});

ipcMain.handle('scale:save-settings', async (_event, settings) => {
  try {
    const saved = await saveScaleSettings(settings || {});
    return { success: true, settings: saved };
  } catch (err: any) {
    return { success: false, error: String(err?.message || err) };
  }
});

ipcMain.handle('pos:get-warehouse-id', async () => {
  try {
    return await loadPosWarehouseId();
  } catch {
    return null;
  }
});

ipcMain.handle('pos:save-warehouse-id', async (_event, id: number | null) => {
  try {
    await savePosWarehouseId(id);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: String(err?.message || err) };
  }
});

ipcMain.handle('scale:connect', async (_event, settings) => {
  try {
    const result = await scaleService.connect(settings);
    if (result.success) {
      // وقتی وزن جدیدی می‌رسد، به renderer ارسال کن
      scaleService.onWeight((weight) => {
        mainWindow?.webContents.send('scale:weight-update', weight);
      });
    }
    return result;
  } catch (err: any) {
    return { success: false, error: String(err?.message || err) };
  }
});

ipcMain.handle('scale:disconnect', async () => {
  try {
    await scaleService.disconnect();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: String(err?.message || err) };
  }
});

ipcMain.handle('scale:status', () => {
  return { connected: scaleService.isConnected(), latestWeight: scaleService.getLatestWeight() };
});

ipcMain.handle('scale:read-weight', async () => {
  try {
    return await scaleService.readWeight(5000);
  } catch (err: any) {
    return { success: false, error: String(err?.message || err) };
  }
});

ipcMain.handle('scale:request-weight', () => {
  scaleService.requestWeight();
  return { success: true };
});

ipcMain.handle('scale:clear-weight', () => {
  scaleService.clearLatestWeight();
  return { success: true };
});

ipcMain.handle('caller-id:get-settings', async () => {
  try {
    return await loadCallerIdSettings();
  } catch (err: any) {
    return { success: false, error: String(err?.message || err) };
  }
});

ipcMain.handle('caller-id:save-settings', async (_event, settings: any) => {
  try {
    const saved = await saveCallerIdSettings(settings);
    // راه‌اندازی مجدد بر اساس mode جدید
    if (saved.inputMode === 'serial') {
      await stopCallerIdWebhook();
      await callerIdHidService.disconnect();
      setupCallerIdSerial(
        { enabled: saved.enabled, portName: saved.serialPortName, baudRate: saved.serialBaudRate, format: saved.serialFormat },
        () => mainWindow,
      );
    } else if (saved.inputMode === 'hid') {
      await stopCallerIdWebhook();
      await callerIdSerialService.disconnect();
      setupCallerIdHid({ enabled: saved.enabled }, () => mainWindow);
    } else {
      await callerIdSerialService.disconnect();
      await callerIdHidService.disconnect();
      await startCallerIdWebhook(() => mainWindow);
    }
    return { success: true, settings: saved };
  } catch (err: any) {
    return { success: false, error: String(err?.message || err) };
  }
});

ipcMain.handle('caller-id:webhook-status', () => {
  return getWebhookStatus();
});

ipcMain.handle('caller-id:serial-list-ports', async () => {
  try {
    const sp = require('serialport');
    const ports = await sp.SerialPort.list();
    return ports.map((p: any) => ({
      path: p.path,
      manufacturer: p.manufacturer,
      friendlyName: p.friendlyName,
      pnpId: p.pnpId,
    }));
  } catch {
    return [];
  }
});

ipcMain.handle('caller-id:serial-connect', async (_event, settings: any) => {
  try {
    const result = await callerIdSerialService.connect(settings);
    if (result.success) {
      callerIdSerialService.onCall((phone) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('caller-id:incoming-call', {
            phone,
            timestamp: new Date().toISOString(),
          });
        }
      });
    }
    return result;
  } catch (err: any) {
    return { success: false, error: String(err?.message || err) };
  }
});

ipcMain.handle('caller-id:serial-disconnect', async () => {
  try {
    await callerIdSerialService.disconnect();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: String(err?.message || err) };
  }
});

ipcMain.handle('caller-id:serial-status', () => {
  return { connected: callerIdSerialService.isConnected() };
});

// ── HID (T-Line TK-202UH) Caller ID handlers ─────────────────────────────────
ipcMain.handle('caller-id:hid-list-devices', () => {
  try {
    return listHidDevices();
  } catch {
    return [];
  }
});

ipcMain.handle('caller-id:hid-connect', async () => {
  try {
    const result = await callerIdHidService.connect();
    if (result.success) {
      callerIdHidService.onCall((phone) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('caller-id:incoming-call', {
            phone,
            timestamp: new Date().toISOString(),
          });
        }
      });
    }
    return result;
  } catch (err: any) {
    return { success: false, error: String(err?.message || err) };
  }
});

ipcMain.handle('caller-id:hid-disconnect', async () => {
  try {
    await callerIdHidService.disconnect();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: String(err?.message || err) };
  }
});

ipcMain.handle('caller-id:hid-status', () => {
  return { connected: callerIdHidService.isConnected() };
});

ipcMain.handle('caller-id:load-history', async () => {
  try {
    return await loadCallHistory();
  } catch (err) {
    console.error('[CallerID] load history error:', err);
    return [];
  }
});

ipcMain.handle('caller-id:save-history', async (_event, history: any[]) => {
  try {
    await saveCallHistory(Array.isArray(history) ? history : []);
    return { success: true };
  } catch (err) {
    console.error('[CallerID] save history error:', err);
    return { success: false, error: String(err) };
  }
});
