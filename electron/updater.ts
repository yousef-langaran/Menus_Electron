/**
 * تنظیم بروزرسانی خودکار با electron-updater.
 * فقط در حالت packaged فعال است.
 * آدرس سرور: متغیر env به نام UPDATE_SERVER_URL (اختیاری)؛ در غیر این صورت از app-update.yml که electron-builder می‌سازد.
 */

import { app, BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';

const isPackaged = app.isPackaged;

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
    console.info('[Updater] بدون UPDATE_SERVER_URL — از feed داخل app-update.yml استفاده می‌شود.');
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

export function setupAutoUpdater(mainWindow: BrowserWindow | null) {
  if (!isPackaged || !mainWindow) {
    return;
  }

  targetWindow = mainWindow;

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

export async function checkForUpdates(): Promise<void> {
  if (!isPackaged) return;
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    console.warn('[Updater] checkForUpdates failed:', err);
    sendToRenderer('update-error', err instanceof Error ? err.message : String(err));
  }
}

export function startUpdateDownload(): void {
  if (!isPackaged) return;
  void autoUpdater.downloadUpdate().catch((err) => {
    console.warn('[Updater] downloadUpdate failed:', err);
    sendToRenderer('update-error', err instanceof Error ? err.message : String(err));
  });
}

export function quitAndInstall(): void {
  if (!isPackaged) return;
  autoUpdater.quitAndInstall(false, true);
}
