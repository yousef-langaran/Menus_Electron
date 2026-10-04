import type { BrowserWindow } from 'electron';
import { ipcMain } from 'electron';
import {
  loadCallerIdSettings,
  saveCallerIdSettings,
  loadCallHistory,
  saveCallHistory,
} from '../database/preferences';
import {
  startCallerIdWebhook,
  stopCallerIdWebhook,
  getWebhookStatus,
} from '../services/callerIdWebhook';
import { callerIdSerialService, setupCallerIdSerial } from '../services/callerIdSerial';
import { callerIdHidService, setupCallerIdHid, listHidDevices } from '../services/callerIdHid';

export function registerCallerIdHandlers(deps: {
  getMainWindow: () => BrowserWindow | null;
}): void {
  const { getMainWindow } = deps;
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
          {
            enabled: saved.enabled,
            portName: saved.serialPortName,
            baudRate: saved.serialBaudRate,
            format: saved.serialFormat,
          },
          getMainWindow,
        );
      } else if (saved.inputMode === 'hid') {
        await stopCallerIdWebhook();
        await callerIdSerialService.disconnect();
        setupCallerIdHid({ enabled: saved.enabled }, getMainWindow);
      } else {
        await callerIdSerialService.disconnect();
        await callerIdHidService.disconnect();
        await startCallerIdWebhook(getMainWindow);
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
          const mainWindow = getMainWindow();
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
          const mainWindow = getMainWindow();
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
}
