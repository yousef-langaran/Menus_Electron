import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  checkOnline: () => ipcRenderer.invoke('check-online'),
  syncOrders: (token?: string) => ipcRenderer.invoke('sync-orders', token),
  printReceipt: (orderData: any, printerJobs: any[]) =>
    ipcRenderer.invoke('print-receipt', orderData, printerJobs),
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  showMessageBox: (options: any) => ipcRenderer.invoke('show-message-box', options),
  saveOfflineOrder: (orderData: any, token: string, baseURL?: string) =>
    ipcRenderer.invoke('save-offline-order', orderData, token, baseURL),
  getOfflineOrders: () => ipcRenderer.invoke('get-offline-orders'),
  generateReceiptPreview: (orderData: any, options?: { paperWidth?: number; margin?: number }) =>
    ipcRenderer.invoke('generate-receipt-preview', { orderData, options }),
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
});

declare global {
  interface Window {
    electronAPI: {
      checkOnline: () => Promise<boolean>;
      syncOrders: (token?: string) => Promise<any>;
      printReceipt: (orderData: any, printerJobs: any[]) => Promise<{ success: boolean; error?: string }>;
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
        options?: { paperWidth?: number; margin?: number }
      ) => Promise<{ success: boolean; html?: string; imageDataUrl?: string; error?: string }>;
      loadUserSession: () => Promise<{ user: any; token: string; cachedAt: string } | null>;
      saveUserSession: (data: { user: any; token: string }) => Promise<{ success: boolean; error?: string }>;
      clearUserSession: () => Promise<{ success: boolean; error?: string }>;
      loadPrinterConfigs: () => Promise<Record<string, any>>;
      savePrinterConfigs: (configs: Record<string, any>) => Promise<{ success: boolean; error?: string }>;
      onOnlineStatusChange: (callback: (isOnline: boolean) => void) => void | (() => void);
    };
  }
}

