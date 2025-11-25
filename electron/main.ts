import { app, BrowserWindow, ipcMain, dialog, session } from 'electron';
import * as path from 'path';
import { isOnline } from './utils/network';
import { syncOfflineOrders } from './services/sync';
import { printReceipt, generateReceiptHTML, renderReceiptPreview } from './services/printer';
import { saveOfflineOrder as dbSaveOfflineOrder, getAllOrders } from './database/orders';
import {
  loadUserSession as loadUserSessionPrefs,
  saveUserSession as saveUserSessionPrefs,
  clearUserSession as clearUserSessionPrefs,
  loadPrinterConfigs as loadPrinterConfigsPrefs,
  savePrinterConfigs as savePrinterConfigsPrefs,
} from './database/preferences';

let mainWindow: BrowserWindow | null = null;
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, '../assets/icon.png'),
    title: 'Menus Order Manager',
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
}

app.whenReady().then(() => {
  // Configure CORS for API requests
  // Add CORS headers to all responses
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Access-Control-Allow-Origin': ['*'],
        'Access-Control-Allow-Methods': ['GET, POST, PUT, DELETE, OPTIONS'],
        'Access-Control-Allow-Headers': ['Content-Type, Authorization, x-restaurant-name, x-selected-restaurant-id, x-domain-type'],
      },
    });
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // Check for online status periodically and sync
  setInterval(async () => {
    if (await isOnline()) {
      try {
        await syncOfflineOrders();
      } catch (error) {
        console.error('Sync error:', error);
      }
    }
  }, 30000); // Check every 30 seconds
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
ipcMain.handle('check-online', async () => {
  return await isOnline();
});

ipcMain.handle('sync-orders', async (_event, token?: string) => {
  try {
    return await syncOfflineOrders(token);
  } catch (error) {
    console.error('Sync error:', error);
    throw error;
  }
});

ipcMain.handle('print-receipt', async (event, orderData, printerJobs) => {
  try {
    await printReceipt(orderData, printerJobs);
    return { success: true };
  } catch (error) {
    console.error('Print error:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
});

ipcMain.handle('generate-receipt-preview', async (_event, payload) => {
  try {
    const { orderData, options } = payload || {};
    const { html, imageDataUrl } = await renderReceiptPreview(orderData, options);
    return { success: true, html, imageDataUrl };
  } catch (error) {
    console.error('Generate receipt preview error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

ipcMain.handle('get-printers', async () => {
  try {
    if (!mainWindow) {
      return [];
    }
    // In Electron, we need to use a different approach to get printers
    // Create a temporary hidden window to access printer list
    const tempWindow = new BrowserWindow({ 
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      }
    });
    
    // Load a blank page to initialize webContents
    await tempWindow.loadURL('data:text/html,<html><body></body></html>');
    
    // Get printers using the webContents
    let printers: any[] = [];
    try {
      // Try getPrintersAsync first (Electron 20+)
      if (typeof tempWindow.webContents.getPrintersAsync === 'function') {
        printers = await tempWindow.webContents.getPrintersAsync();
      } else if (typeof (tempWindow.webContents as any).getPrinters === 'function') {
        // Fallback for older Electron versions
        printers = (tempWindow.webContents as any).getPrinters();
      }
    } catch (err) {
      console.warn('Could not get printers:', err);
    }
    
    tempWindow.close();
    
    return printers.map((p: any) => ({
      name: p.name || '',
      displayName: p.displayName || p.name || '',
      description: p.description || '',
    }));
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
    }
    return { success: true };
  } catch (error) {
    console.error('Save user session error:', error);
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

