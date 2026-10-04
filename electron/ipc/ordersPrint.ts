import type { BrowserWindow } from 'electron';
import { ipcMain, dialog } from 'electron';
import { syncOfflineOrders, syncOfflineReturns, syncOfflinePosShifts } from '../services/sync';
import {
  printReceipt,
  renderReceiptPreview,
  printPreviewOptsMap,
  detectPrinters,
  PrintOperationError,
  openCashDrawer,
} from '../services/printer';
import { saveOfflineOrder as dbSaveOfflineOrder, getAllOrders } from '../database/orders';
import { saveOfflineReturn as dbSaveOfflineReturn, getAllReturns } from '../database/returns';
import {
  saveOfflineShiftAction as dbSaveOfflineShiftAction,
  getAllShiftActions,
} from '../database/posShifts';
import {
  getNextReceiptNumberPreview,
  getReceiptNumbersMap,
  assignReceiptNumberForOrder,
} from '../database/preferences';

export function registerOrdersPrintHandlers(deps: {
  getMainWindow: () => BrowserWindow | null;
}): void {
  const { getMainWindow } = deps;
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
    const mainWindow = getMainWindow();
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
}
