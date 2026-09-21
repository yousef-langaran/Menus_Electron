import { config as dotenvConfig } from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { pathToFileURL } from 'url';

import { app, BrowserWindow, nativeImage, ipcMain, dialog, session, shell } from 'electron';
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
import { syncOfflineOrders, syncOfflineReturns, syncOfflinePosShifts } from './services/sync';
import {
  printReceipt,
  renderReceiptPreview,
  printPreviewOptsMap,
  detectPrinters,
  PrintOperationError,
  openCashDrawer,
} from './services/printer';
import { cacheImage, getCachedImagePath, cacheImages, getImageUrl } from './services/imageCache';
import { saveOfflineOrder as dbSaveOfflineOrder, getAllOrders } from './database/orders';
import { saveOfflineReturn as dbSaveOfflineReturn, getAllReturns } from './database/returns';
import {
  saveOfflineShiftAction as dbSaveOfflineShiftAction,
  getAllShiftActions,
} from './database/posShifts';
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
import { sendAmountViaSamanSerial } from './services/samanPos';
import { sendPaymentViaAsanPardakht } from './services/asanPardakht';
import { setupAutoUpdater, checkForUpdates, startUpdateDownload, quitAndInstall } from './updater';

/** مسیر فایل‌های asset برای هر دو حالت dev و packaged */
function getAssetPath(...parts: string[]): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'assets', ...parts)
    : path.join(__dirname, '..', 'assets', ...parts);
}

// لوکیل اپ را fa-IR می‌کنیم تا navigator.language در رندرر هم fa-IR شود.
// React Aria (زیربنای HeroUI) جهت RTL را از همین مقدار می‌گیرد؛ بدون آن هر پورتالی
// که بیرون از #root رندر می‌شود (منوی ناوبار، Popover ِ Select، ...) با dir="ltr" می‌آید.
// باید قبل از app.whenReady صدا زده شود.
app.commandLine.appendSwitch('lang', 'fa-IR');

let mainWindow: BrowserWindow | null = null;
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
// باید با build.protocols در package.json (که نصاب NSIS واقعاً ثبت می‌کند) یکسان باشد.
const DEEP_LINK_PROTOCOL = 'secoin';
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

/**
 * فقط لینک‌های http/https قابل باز شدن در مرورگر پیش‌فرض سیستم هستند
 * (نه file:/javascript:/data: و مشابه آن‌ها که می‌توانند به اجرای کد یا افشای فایل محلی منجر شوند).
 * هم توسط IPC «open-external» و هم توسط setWindowOpenHandler/will-navigate استفاده می‌شود
 * تا منطق اعتبارسنجی پروتکل در یک‌جا نگه داشته شود.
 */
function isSafeExternalUrl(rawUrl: string): URL | null {
  try {
    const parsed = new URL(String(rawUrl));
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed;
    }
  } catch {
    // آدرس نامعتبر — پایین همان null برگردانده می‌شود
  }
  return null;
}

/** آیا url داده‌شده همان پوستهٔ اپ (dev روی لوکال‌هاست ۳۰۰۲ یا فایل build شدهٔ prod) است؟ */
function isAppOwnUrl(rawUrl: string): boolean {
  try {
    const target = new URL(rawUrl);
    if (isDev) {
      return target.origin === 'http://localhost:3002';
    }
    return target.protocol === 'file:';
  } catch {
    return false;
  }
}

/**
 * origin‌های http(s)/ws(s) مجاز برای connect-src، بر اساس آدرس API که کاربر/نصب واقعاً پیکربندی
 * کرده (getApiConfig — همان چیزی که renderer هم از طریق IPC «get-api-config» می‌گیرد و سوکت
 * سفارش‌ها هم روی همان هاست وصل می‌شود). دامنهٔ ثابت هاردکد نمی‌کنیم چون baseURL از env/فایل
 * تنظیمات کاربر می‌آید و می‌تواند بین نصب‌ها (secoin.ir، دامنهٔ self-hosted و ...) فرق کند.
 */
function buildConnectSrcOrigins(): string[] {
  const origins = ["'self'"];
  try {
    const { baseURL } = getApiConfig();
    const parsed = new URL(baseURL);
    const httpOrigin = `${parsed.protocol}//${parsed.host}`;
    const wsProtocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsOrigin = `${wsProtocol}//${parsed.host}`;
    origins.push(httpOrigin, wsOrigin);
  } catch {
    // اگر baseURL هنوز معتبر نیست، فقط 'self' (+ موارد dev پایین) باقی می‌ماند
  }
  if (isDev) {
    // سرور dev ویت (پورت ۳۰۰۲) و سوکت HMR آن
    origins.push('http://localhost:3002', 'ws://localhost:3002');
  }
  return origins;
}

/**
 * Content-Security-Policy برای صفحهٔ رندرر.
 * - script-src/style-src نیاز به 'unsafe-inline' دارند: index.html یک <script> این‌لاین برای
 *   تعیین تئوری تاریک/روشن قبل از رندر React دارد، و کامپوننت‌های React/Tailwind زیاد
 *   از ویژگی style="" این‌لاین استفاده می‌کنند (که style-src هم آن را کنترل می‌کند، نه فقط
 *   تگ <style>). این با تهدید اصلی (بارگذاری اسکریپت از دامنهٔ بیرونی) در تناقض نیست.
 * - در dev به 'unsafe-eval' هم نیاز است چون HMR/React-Refresh ویت از eval برای اعمال آپدیت
 *   ماژول‌ها استفاده می‌کند؛ در build نهایی (prod) این مجوز حذف می‌شود.
 * - img-src/font-src به file: نیاز دارند چون تصاویر کش‌شده و فونت‌های محلی از طریق file://
 *   سرو می‌شوند (نگاه کنید به imageCache.ts/get-cached-image)، و https: چون تصاویر محصولات
 *   قبل از کش‌شدن مستقیماً از دامنهٔ بک‌اند/CDN گرفته می‌شوند.
 * - connect-src فقط به 'self' + هاست API/سوکت پیکربندی‌شده (و در dev لوکال‌هاست ویت) محدود
 *   می‌شود تا حتی در صورت XSS، توکن JWT قابل ارسال به دامنهٔ دلخواه مهاجم نباشد.
 */
function buildContentSecurityPolicy(): string {
  const connectSrc = buildConnectSrcOrigins().join(' ');
  const scriptSrc = ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])].join(' ');
  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: file: https:",
    "font-src 'self' data: file:",
    `connect-src ${connectSrc}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ];
  return directives.join('; ');
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

  // بستن مسیر window.open()/<a target="_blank"> برای باز شدن یک پنجرهٔ Electron جدید بدون کنترل
  // (که در نسخه‌های قدیمی‌تر Electron می‌توانست با دسترسی کامل Node باز شود). به‌جای باز کردن
  // پنجرهٔ جدید، لینک‌های امن http/https به مرورگر پیش‌فرض سیستم فوروارد می‌شوند.
  mainWindow.webContents.setWindowOpenHandler((details) => {
    const safeUrl = isSafeExternalUrl(details.url);
    if (safeUrl) {
      shell.openExternal(safeUrl.toString()).catch(() => {});
    }
    return { action: 'deny' };
  });

  // جلوگیری از ناوبری کل پنجره به یک آدرس بیرونی (مثلاً از طریق یک <a href> بدون target
  // یا یک ریدایرکت مخرب داخل محتوای رندرشده). رندرر فقط باید همان پوستهٔ اپ (dev لوکال‌هاست
  // یا فایل build‌شدهٔ prod) را نمایش دهد؛ هر آدرس دیگری کنسل و در صورت امن‌بودن به مرورگر سیستم فوروارد می‌شود.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAppOwnUrl(url)) {
      return;
    }
    event.preventDefault();
    const safeUrl = isSafeExternalUrl(url);
    if (safeUrl) {
      shell.openExternal(safeUrl.toString()).catch(() => {});
    }
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
  // + Content-Security-Policy: در برابر XSS در رندرر سدی می‌سازد که حتی اگر داده‌ای ناامن
  // (مثلاً یادداشت سفارش یا نام مشتری) در DOM تزریق شود، نتواند اسکریپت بیرونی بار کند یا
  // به دامنه‌ای غیر از API/سوکت پیکربندی‌شده دادهٔ حساس (توکن JWT و ...) ارسال کند.
  // یک onHeadersReceived واحد چون Electron برای هر session فقط آخرین listener ثبت‌شده را نگه می‌دارد.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Access-Control-Allow-Origin': ['*'],
        'Access-Control-Allow-Methods': ['GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS'],
        'Access-Control-Allow-Headers': ['Content-Type, Authorization, x-client, x-client-version, x-restaurant-name, x-selected-restaurant-id, x-domain-type'],
        'Content-Security-Policy': [buildContentSecurityPolicy()],
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

  const amountToSend =
    settings.sendAmountUnit === 'rial' ? Math.round(amount * 10) : Math.round(amount);

  if (settings.connectionType === 'serial-tlv') {
    const result = await sendAmountViaSamanSerial(amountToSend, {
      portName: settings.serialPortName,
      baudRate: settings.serialBaudRate,
      withHandshake: settings.serialWithHandshake,
    });
    return result.success
      ? { success: true, message: 'مبلغ با موفقیت به کارتخوان ارسال شد', refId: result.rrn || result.traceNumber }
      : { success: false, error: result.error || 'ارسال به کارتخوان ناموفق بود' };
  }

  if (settings.connectionType === 'asan-pardakht') {
    const orderId = Number(payload?.orderId || 0);
    const result = await sendPaymentViaAsanPardakht(amountToSend, {
      mode: settings.asanPardakhtMode,
      ip: settings.asanPardakhtIp,
      port: settings.asanPardakhtPort,
      comPort: settings.asanPardakhtComPort,
      baudRate: settings.asanPardakhtBaudRate,
      bridgeExePath: getAssetPath('pos-bridge', 'PosBridge.exe'),
    }, {
      invoiceNumber: orderId > 0 ? String(orderId) : undefined,
    });
    return result.success
      ? { success: true, message: 'پرداخت با موفقیت انجام شد', refId: result.rrn || result.stan }
      : { success: false, error: result.error || 'پرداخت توسط کارتخوان ناموفق بود' };
  }

  if (!settings.endpointUrl?.trim()) {
    return { success: false, error: 'آدرس API کارتخوان تنظیم نشده است' };
  }

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
      connectionType: 'http',
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
      serialPortName: '',
      serialBaudRate: 19200,
      serialWithHandshake: false,
      asanPardakhtMode: 'lan',
      asanPardakhtIp: '',
      asanPardakhtPort: 17000,
      asanPardakhtComPort: '',
      asanPardakhtBaudRate: 9600,
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

ipcMain.handle('open-cash-drawer', async (_event, printerName: string) => {
  try {
    return await openCashDrawer(printerName);
  } catch (error) {
    console.error('Open cash drawer error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.handle('save-offline-pos-shift-action', async (_event, action) => {
  try {
    const id = await dbSaveOfflineShiftAction(action);
    return { success: true, id };
  } catch (error) {
    console.error('Save offline pos-shift action error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.handle('get-offline-pos-shift-actions', async () => {
  try {
    return await getAllShiftActions();
  } catch (error) {
    console.error('Get offline pos-shift actions error:', error);
    return [];
  }
});

ipcMain.handle('sync-pos-shifts', async (_event, token?: string) => {
  try {
    return await syncOfflinePosShifts(token);
  } catch (error) {
    console.error('Sync pos-shifts error:', error);
    throw error;
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

ipcMain.handle('set-print-template-for-printer', async (
  _event,
  printerName: string,
  template: any,
  receiptType?: 'full' | 'kitchen'
) => {
  try {
    // undefined = ارث‌بری از سطح بالاتر (کلید پاک می‌شود)، null = صراحتاً بدون قالب
    await setPrintTemplateForPrinter(printerName ?? '', template, receiptType);
    return { success: true };
  } catch (error) {
    console.error('Set print template for printer error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.handle('refresh-cached-print-templates', async (_event, freshTemplates: any[]) => {
  try {
    const changed = await refreshCachedPrintTemplates(Array.isArray(freshTemplates) ? freshTemplates : []);
    return { success: true, changed };
  } catch (error) {
    console.error('Refresh cached print templates error:', error);
    return { success: false, changed: false, error: error instanceof Error ? error.message : 'Unknown error' };
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
