/**
 * تنظیم بروزرسانی خودکار با electron-updater.
 * فقط در حالت packaged فعال است.
 * آدرس سرور بروزرسانی: از publish در package.json یا متغیر env به نام UPDATE_SERVER_URL
 */

import { app, BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';

const isPackaged = app.isPackaged;

export function setupAutoUpdater(mainWindow: BrowserWindow | null) {
  if (!isPackaged || !mainWindow) {
    return;
  }

  const updateUrl = process.env.UPDATE_SERVER_URL;
  if (updateUrl) {
    try {
      autoUpdater.setFeedURL({ provider: 'generic', url: updateUrl });
    } catch (e) {
      console.warn('[Updater] setFeedURL failed:', e);
    }
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents?.send('update-available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    });
  });

  autoUpdater.on('update-not-available', () => {
    mainWindow?.webContents?.send('update-not-available');
  });

  autoUpdater.on('update-downloaded', () => {
    mainWindow?.webContents?.send('update-downloaded');
  });

  autoUpdater.on('error', (err) => {
    mainWindow?.webContents?.send('update-error', err?.message || String(err));
  });

  // چک با تأخیر کوتاه تا پنجره و رندرر آماده باشند
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.warn('[Updater] checkForUpdates failed:', err);
    });
  }, 5000);
}

export async function checkForUpdates(): Promise<void> {
  if (!isPackaged) return;
  await autoUpdater.checkForUpdates();
}

export function startUpdateDownload(): void {
  if (!isPackaged) return;
  autoUpdater.downloadUpdate();
}

export function quitAndInstall(): void {
  if (!isPackaged) return;
  autoUpdater.quitAndInstall(false, true);
}
