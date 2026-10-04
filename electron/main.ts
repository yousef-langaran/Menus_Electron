import { config as dotenvConfig } from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

import { app, BrowserWindow, nativeImage, session, shell } from 'electron';

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
  if (
    app.isPackaged &&
    !process.env.API_BASE_URL &&
    !process.env.NEXT_PUBLIC_API_BASE_URL &&
    !process.env.VITE_API_BASE_URL
  ) {
    console.warn(
      '[Menus] برای حالت build یک فایل .env قرار بده. مسیرهای چک‌شده: کنار exe =',
      exeDir,
      'یا در userData =',
      userDataDir,
    );
  }
}
loadEnv();
import { loadCallerIdSettings } from './database/preferences';
import { startCallerIdWebhook, stopCallerIdWebhook } from './services/callerIdWebhook';
import { callerIdSerialService, setupCallerIdSerial } from './services/callerIdSerial';
import { callerIdHidService, setupCallerIdHid } from './services/callerIdHid';
import { getApiConfig } from './config/api';
import { setupAutoUpdater } from './updater';
import { registerCoreHandlers } from './ipc/core';
import { registerCardTerminalHandlers } from './ipc/cardTerminal';
import { registerOrdersPrintHandlers } from './ipc/ordersPrint';
import { registerStorageHandlers } from './ipc/storage';
import { registerUpdaterHandlers } from './ipc/updater';
import { registerScaleHandlers } from './ipc/scale';
import { registerCallerIdHandlers } from './ipc/callerId';

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
const getMainWindow = () => mainWindow;
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
        'Access-Control-Allow-Headers': [
          'Content-Type, Authorization, x-client, x-client-version, x-restaurant-name, x-selected-restaurant-id, x-domain-type',
        ],
        'Content-Security-Policy': [buildContentSecurityPolicy()],
      },
    });
  });

  createWindow();
  setupAutoUpdater(mainWindow);
  loadCallerIdSettings()
    .then((s) => {
      if (s.inputMode === 'serial') {
        setupCallerIdSerial(
          {
            enabled: s.enabled,
            portName: s.serialPortName,
            baudRate: s.serialBaudRate,
            format: s.serialFormat,
          },
          () => mainWindow,
        );
      } else if (s.inputMode === 'hid') {
        setupCallerIdHid({ enabled: s.enabled }, () => mainWindow);
      } else {
        startCallerIdWebhook(() => mainWindow).catch((e) =>
          console.error('[CallerID] webhook start error:', e),
        );
      }
    })
    .catch(() => {});

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
registerCoreHandlers({ isSafeExternalUrl });
registerCardTerminalHandlers({ getAssetPath });
registerOrdersPrintHandlers({ getMainWindow });
registerStorageHandlers();
registerUpdaterHandlers();
registerScaleHandlers({ getMainWindow });
registerCallerIdHandlers({ getMainWindow });
