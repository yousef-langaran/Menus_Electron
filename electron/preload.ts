import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getApiConfig: () => ipcRenderer.invoke('get-api-config'),
  checkOnline: () => ipcRenderer.invoke('check-online'),
  syncOrders: (token?: string) => ipcRenderer.invoke('sync-orders', token),
  printReceipt: (orderData: any, printerJobs: any[], orderKeys?: string | string[]) =>
    ipcRenderer.invoke('print-receipt', orderData, printerJobs, orderKeys),
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  showMessageBox: (options: any) => ipcRenderer.invoke('show-message-box', options),
  saveOfflineOrder: (orderData: any, token: string, baseURL?: string) =>
    ipcRenderer.invoke('save-offline-order', orderData, token, baseURL),
  getOfflineOrders: () => ipcRenderer.invoke('get-offline-orders'),
  generateReceiptPreview: (orderData: any, options?: { paperWidth?: number; margin?: number; contentWidthMm?: number; receiptType?: 'full' | 'kitchen' }) =>
    ipcRenderer.invoke('generate-receipt-preview', { orderData, options }),
  openPrintPreviewWindow: (orderData: any, options?: { paperWidth?: number; margin?: number; contentWidthMm?: number; receiptType?: 'full' | 'kitchen'; printerName?: string }) =>
    ipcRenderer.invoke('open-print-preview-window', { orderData, options, printerName: options?.printerName }),
  onOnlineStatusChange: (callback: (isOnline: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, isOnline: boolean) => callback(isOnline);
    ipcRenderer.on('online-status-changed', handler);
    return () => {
      ipcRenderer.removeListener('online-status-changed', handler);
    };
  },
  loadUserSession: () => ipcRenderer.invoke('load-user-session'),
  saveUserSession: (session: { user: any; token: string }) =>
    ipcRenderer.invoke('save-user-session', session),
  clearUserSession: () => ipcRenderer.invoke('clear-user-session'),
  loadPrinterConfigs: () => ipcRenderer.invoke('load-printer-configs'),
  savePrinterConfigs: (configs: Record<string, any>) =>
    ipcRenderer.invoke('save-printer-configs', configs),
  getDefaultPrintTemplate: () => ipcRenderer.invoke('get-default-print-template'),
  setDefaultPrintTemplate: (template: any) => ipcRenderer.invoke('set-default-print-template', template),
  getReceiptNumberSettings: () => ipcRenderer.invoke('get-receipt-number-settings'),
  saveReceiptNumberSettings: (settings: any) =>
    ipcRenderer.invoke('save-receipt-number-settings', settings),
  getReceiptNumbersMap: () => ipcRenderer.invoke('get-receipt-numbers-map'),
  assignReceiptNumberForOrder: (orderKeys: string[]) =>
    ipcRenderer.invoke('assign-receipt-number-for-order', orderKeys),
  cacheImage: (imageUrl: string) => ipcRenderer.invoke('cache-image', imageUrl),
  getCachedImage: (imageUrl: string) => ipcRenderer.invoke('get-cached-image', imageUrl),
  cacheImages: (imageUrls: string[]) => ipcRenderer.invoke('cache-images', imageUrls),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  startUpdateDownload: () => ipcRenderer.invoke('start-update-download'),
  quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
  onUpdateAvailable: (callback: (info: { version: string }) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, info: { version: string }) => callback(info);
    ipcRenderer.on('update-available', handler);
    return () => ipcRenderer.removeListener('update-available', handler);
  },
  onUpdateDownloaded: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('update-downloaded', handler);
    return () => ipcRenderer.removeListener('update-downloaded', handler);
  },
  onUpdateError: (callback: (message: string) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, message: string) => callback(message);
    ipcRenderer.on('update-error', handler);
    return () => ipcRenderer.removeListener('update-error', handler);
  },
});

declare global {
  interface Window {
    electronAPI: {
      getApiConfig: () => Promise<{ baseURL: string; token?: string; restaurantName?: string; restaurantId?: number }>;
      checkOnline: () => Promise<boolean>;
      syncOrders: (token?: string) => Promise<any>;
      printReceipt: (orderData: any, printerJobs: any[], orderKeys?: string | string[]) => Promise<{ success: boolean; receiptNumber?: number; error?: string }>;
      getPrinters: () => Promise<Array<{ name: string; displayName: string; description: string }>>;
      showMessageBox: (options: any) => Promise<any>;
      saveOfflineOrder: (
        orderData: any,
        token: string,
        baseURL?: string
      ) => Promise<{ success: boolean; orderId?: number; error?: string }>;
      getOfflineOrders: () => Promise<any[]>;
      generateReceiptPreview: (
        orderData: any,
        options?: { paperWidth?: number; margin?: number; contentWidthMm?: number; receiptType?: 'full' | 'kitchen' }
      ) => Promise<{ success: boolean; html?: string; imageDataUrl?: string; error?: string }>;
      openPrintPreviewWindow: (
        orderData: any,
        options?: { paperWidth?: number; margin?: number; contentWidthMm?: number; receiptType?: 'full' | 'kitchen' }
      ) => Promise<{ success: boolean; error?: string }>;
      loadUserSession: () => Promise<{ user: any; token: string; cachedAt: string } | null>;
      saveUserSession: (data: { user: any; token: string }) => Promise<{ success: boolean; error?: string }>;
      clearUserSession: () => Promise<{ success: boolean; error?: string }>;
      loadPrinterConfigs: () => Promise<Record<string, any>>;
      savePrinterConfigs: (configs: Record<string, any>) => Promise<{ success: boolean; error?: string }>;
      getReceiptNumberSettings: () => Promise<{ nextNumber: number; resetPolicy: string; startNumber: number; lastResetDate: string; dailyResetTime: string }>;
      saveReceiptNumberSettings: (settings: any) => Promise<{ success: boolean; error?: string }>;
      getReceiptNumbersMap: () => Promise<Record<string, number>>;
      assignReceiptNumberForOrder: (orderKeys: string[]) => Promise<number>;
      cacheImage: (imageUrl: string) => Promise<{ success: boolean; url?: string; error?: string }>;
      getCachedImage: (imageUrl: string) => Promise<{ success: boolean; url: string }>;
      cacheImages: (imageUrls: string[]) => Promise<{ success: boolean; urls?: Record<string, string>; error?: string }>;
      onOnlineStatusChange: (callback: (isOnline: boolean) => void) => void | (() => void);
      checkForUpdates: () => Promise<void>;
      startUpdateDownload: () => Promise<void>;
      quitAndInstall: () => Promise<void>;
      onUpdateAvailable: (callback: (info: { version: string }) => void) => () => void;
      onUpdateDownloaded: (callback: () => void) => () => void;
      onUpdateError: (callback: (message: string) => void) => () => void;
    };
  }
}

