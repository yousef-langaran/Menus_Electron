/**
 * تنظیم بروزرسانی خودکار با electron-updater.
 * فقط در حالت packaged فعال است.
 * آدرس سرور: UPDATE_SERVER_URL یا VITE_UPDATE_SERVER_URL در .env، یا کلید updateServerUrl در api-config.json (userData)؛
 * در غیر این صورت از app-update.yml که electron-builder می‌سازد.
 * اگر آدرس placeholder باشد (مثل your-update-server.com)، بررسی بروزرسانی انجام نمی‌شود تا خطای DNS در UI نمایش داده نشود.
 */

import * as fs from 'fs';
import * as path from 'path';
import { app, BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import { getUpdateServerUrl } from './config/api';

const isPackaged = app.isPackaged;

/** دامنه‌هایی که در build نمونه بودند و نباید درخواست زده شوند */
const PLACEHOLDER_HOSTS = new Set([
  'your-update-server.com',
  'example.com',
  'example.org',
  'test.invalid',
]);

function hostnameIsPlaceholder(host: string): boolean {
  const h = host.toLowerCase();
  if (PLACEHOLDER_HOSTS.has(h)) return true;
  return [...PLACEHOLDER_HOSTS].some((ph) => h.endsWith(`.${ph}`));
}

function isBlockedUpdateUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return true;
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const u = new URL(withProto);
    return hostnameIsPlaceholder(u.hostname);
  } catch {
    return true;
  }
}

function readEmbeddedPublishUrlFromYml(): string | null {
  try {
    const ymlPath = path.join(process.resourcesPath, 'app-update.yml');
    if (!fs.existsSync(ymlPath)) return null;
    const text = fs.readFileSync(ymlPath, 'utf8');
    const m = text.match(/^\s*url:\s*(\S+)/m);
    if (!m?.[1]) return null;
    return m[1].replace(/^["']|["']$/g, '');
  } catch {
    return null;
  }
}

/** آیا باید به سرور بروزرسانی درخواست زده شود؟ */
export function isUpdateFeedConfigured(): boolean {
  if (process.env.DISABLE_AUTO_UPDATE === '1' || process.env.DISABLE_AUTO_UPDATE === 'true') {
    return false;
  }

  const explicit = getUpdateServerUrl();
  if (explicit) {
    if (isBlockedUpdateUrl(explicit)) {
      console.warn('[Updater] آدرس بروزرسانی نامعتبر است؛ بروزرسانی غیرفعال:', explicit);
      return false;
    }
    return true;
  }

  const embedded = readEmbeddedPublishUrlFromYml();
  if (!embedded) {
    console.info('[Updater] فایل app-update.yml بدون url یافت نشد — بروزرسانی خودکار غیرفعال است.');
    return false;
  }
  if (isBlockedUpdateUrl(embedded)) {
    console.warn('[Updater] url داخل app-update.yml placeholder است؛ بروزرسانی غیرفعال:', embedded);
    return false;
  }
  return true;
}

/** آخرین پنجرهٔ اصلی برای ارسال رویداد به رندرر (با باز شدن دوبارهٔ پنجره به‌روز می‌شود) */
let targetWindow: BrowserWindow | null = null;

let listenersBound = false;
let initialCheckScheduled = false;

function sendToRenderer(channel: string, ...args: unknown[]): void {
  const wc = targetWindow?.webContents;
  if (!wc || wc.isDestroyed()) return;
  wc.send(channel, ...args);
}

function applyFeedUrlFromEnv(): void {
  const base = getUpdateServerUrl();
  if (!base) {
    console.info('[Updater] بدون آدرس صریح در env/api-config — از feed داخل app-update.yml استفاده می‌شود (در صورت وجود).');
    return;
  }
  if (isBlockedUpdateUrl(base)) {
    console.warn('[Updater] آدرس بروزرسانی نادیده گرفته می‌شود (placeholder).');
    return;
  }
  try {
    autoUpdater.setFeedURL({ provider: 'generic', url: base });
    console.info('[Updater] setFeedURL (generic):', base);
  } catch (e) {
    console.warn('[Updater] setFeedURL failed:', e);
  }
}

/**
 * electron-updater هنگام دانلود حتماً app-update.yml را می‌خواند (برای updaterCacheDirName).
 * بیلدهای قدیمی بدون این فایل در resources → ENOENT. اگر feed از env داریم، yaml حداقلی در userData می‌سازیم.
 */
function ensureAppUpdateConfigFile(): void {
  if (!isPackaged) return;
  const bundled = path.join(process.resourcesPath, 'app-update.yml');
  if (fs.existsSync(bundled)) return;

  const feedUrl = getUpdateServerUrl();
  if (!feedUrl || isBlockedUpdateUrl(feedUrl)) return;

  try {
    const out = path.join(app.getPath('userData'), 'app-update.generated.yml');
    const cacheName = 'menus-electron-updater';
    const yml = `provider: generic\nurl: ${feedUrl}\nupdaterCacheDirName: ${cacheName}\n`;
    fs.writeFileSync(out, yml, 'utf8');
    autoUpdater.updateConfigPath = out;
    console.info('[Updater] app-update.yml در resources نبود؛ از فایل تولیدشده استفاده می‌شود:', out);
  } catch (e) {
    console.warn('[Updater] نوشتن app-update.generated.yml ناموفق:', e);
  }
}

function prepareUpdaterFeed(): void {
  ensureAppUpdateConfigFile();
  applyFeedUrlFromEnv();
}

export type CheckForUpdatesResult =
  | { ok: true }
  | { ok: false; skipped: true; message: string }
  | { ok: false; skipped?: false; message: string };

export function setupAutoUpdater(mainWindow: BrowserWindow | null) {
  if (!isPackaged || !mainWindow) {
    return;
  }

  targetWindow = mainWindow;

  if (!isUpdateFeedConfigured()) {
    console.info('[Updater] سرور بروزرسانی معتبر تنظیم نشده — بررسی خودکار انجام نمی‌شود.');
    return;
  }

  if (!listenersBound) {
    listenersBound = true;
    prepareUpdaterFeed();

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = null;

    autoUpdater.on('update-available', (info) => {
      sendToRenderer('update-available', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes,
      });
    });

    autoUpdater.on('update-not-available', () => {
      sendToRenderer('update-not-available');
    });

    autoUpdater.on('download-progress', (progress) => {
      sendToRenderer('update-download-progress', {
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total,
      });
    });

    autoUpdater.on('update-downloaded', () => {
      sendToRenderer('update-downloaded');
    });

    autoUpdater.on('error', (err) => {
      sendToRenderer('update-error', err?.message || String(err));
    });
  }

  if (!initialCheckScheduled) {
    initialCheckScheduled = true;
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err) => {
        console.warn('[Updater] checkForUpdates failed:', err);
        sendToRenderer('update-error', err instanceof Error ? err.message : String(err));
      });
    }, 5000);
  }
}

export async function checkForUpdates(): Promise<CheckForUpdatesResult> {
  if (!isPackaged) {
    return {
      ok: false,
      skipped: true,
      message: 'بروزرسانی فقط در نسخهٔ نصب‌شده (خروجی electron-builder) فعال است؛ در حالت dev بررسی انجام نمی‌شود.',
    };
  }
  if (!isUpdateFeedConfigured()) {
    return {
      ok: false,
      skipped: true,
      message:
        'سرور بروزرسانی تنظیم نشده است. قبل از dist در روت پروژه Menus_Electron فایل .env را با UPDATE_SERVER_URL پر کنید تا هنگام build در نصب گذاشته شود؛ یا .env کنار exe / userData بگذارید، یا در api-config.json کلید updateServerUrl؛ یا publish معتبر در electron-builder.',
    };
  }
  prepareUpdaterFeed();
  try {
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[Updater] checkForUpdates failed:', err);
    sendToRenderer('update-error', msg);
    return { ok: false, message: msg };
  }
}

export function startUpdateDownload(): void {
  if (!isPackaged || !isUpdateFeedConfigured()) return;
  prepareUpdaterFeed();
  void autoUpdater.downloadUpdate().catch((err) => {
    console.warn('[Updater] downloadUpdate failed:', err);
    sendToRenderer('update-error', err instanceof Error ? err.message : String(err));
  });
}

export function quitAndInstall(): void {
  if (!isPackaged) return;
  autoUpdater.quitAndInstall(false, true);
}
