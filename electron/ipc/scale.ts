import type { BrowserWindow } from 'electron';
import { ipcMain } from 'electron';
import {
  loadScaleSettings,
  saveScaleSettings,
  loadPosWarehouseId,
  savePosWarehouseId,
} from '../database/preferences';
import { scaleService, listSerialPorts } from '../services/scale';

export function registerScaleHandlers(deps: { getMainWindow: () => BrowserWindow | null }): void {
  const { getMainWindow } = deps;

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
          getMainWindow()?.webContents.send('scale:weight-update', weight);
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
}
