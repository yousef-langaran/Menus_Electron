/**
 * تنظیم بروزرسانی خودکار با electron-updater.
 * فقط در حالت packaged فعال است.
 * آدرس سرور: متغیر env به نام UPDATE_SERVER_URL (اختیاری)؛ در غیر این صورت از app-update.yml که electron-builder می‌سازد.
 * اگر آدرس placeholder باشد (مثل your-update-server.com)، بررسی بروزرسانی انجام نمی‌شود تا خطای DNS در UI نمایش داده نشود.
 */

import * as fs from 'fs';
import * as path from 'path';
import { app, BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';

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

  const envRaw = typeof process.env.UPDATE_SERVER_URL === 'string' ? process.env.UPDATE_SERVER_URL.trim() : '';
  if (envRaw) {
    if (isBlockedUpdateUrl(envRaw)) {
      console.warn('[Updater] مقدار UPDATE_SERVER_URL نامعتبر است؛ بروزرسانی غیرفعال:', envRaw);
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
  const raw = process.env.UPDATE_SERVER_URL;
  const updateUrl = typeof raw === 'string' ? raw.trim() : '';
  if (!updateUrl) {
    console.info('[Updater] بدون UPDATE_SERVER_URL — از feed داخل app-update.yml استفاده می‌شود (در صورت وجود).');
    return;
  }
  if (isBlockedUpdateUrl(updateUrl)) {
    console.warn('[Updater] UPDATE_SERVER_URL نادیده گرفته می‌شود (placeholder).');
    return;
  }
  const base = updateUrl.replace(/\/+$/, '');
  try {
    autoUpdater.setFeedURL({ provider: 'generic', url: base });
    console.info('[Updater] setFeedURL (generic):', base);
  } catch (e) {
    console.warn('[Updater] setFeedURL failed:', e);
  }
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
    applyFeedUrlFromEnv();

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = console;

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
        'سرور بروزرسانی تنظیم نشده است. برای فعال‌سازی، متغیر محیطی UPDATE_SERVER_URL را به آدرس پوشهٔ generic releases بدهید یا در electron-builder مقدار publish معتبر قرار دهید.',
    };
  }
  applyFeedUrlFromEnv();
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
  void autoUpdater.downloadUpdate().catch((err) => {
    console.warn('[Updater] downloadUpdate failed:', err);
    sendToRenderer('update-error', err instanceof Error ? err.message : String(err));
  });
}

export function quitAndInstall(): void {
  if (!isPackaged) return;
  autoUpdater.quitAndInstall(false, true);
}
