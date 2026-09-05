import { contextBridge, ipcRenderer } from 'electron';

// نسخه‌ی برنامه را به‌صورت sync همان ابتدای بارگذاری می‌گیریم تا هدر نسخه
// روی نخستین درخواست شبکه هم حاضر باشد (جلوگیری از تشخیص اشتباهِ «قدیمی»).
let APP_VERSION = '';
try {
  APP_VERSION = String(ipcRenderer.sendSync('app:get-version-sync') || '');
} catch {
  APP_VERSION = '';
}

const electronAPI = {
  appVersion: APP_VERSION,
  getApiConfig: () => ipcRenderer.invoke('get-api-config'),
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  checkOnline: () => ipcRenderer.invoke('check-online'),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  syncOrders: (token?: string) => ipcRenderer.invoke('sync-orders', token),
  syncReturns: (token?: string) => ipcRenderer.invoke('sync-returns', token),
  saveOfflineReturn: (returnData: any, token: string, baseURL?: string) =>
    ipcRenderer.invoke('save-offline-return', returnData, token, baseURL),
  getOfflineReturns: () => ipcRenderer.invoke('get-offline-returns'),
  printReceipt: (orderData: any, printerJobs: any[], orderKeys?: string | string[]) =>
    ipcRenderer.invoke('print-receipt', orderData, printerJobs, orderKeys),
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  showMessageBox: (options: any) => ipcRenderer.invoke('show-message-box', options),
  saveOfflineOrder: (orderData: any, token: string, baseURL?: string) =>
    ipcRenderer.invoke('save-offline-order', orderData, token, baseURL),
  getOfflineOrders: () => ipcRenderer.invoke('get-offline-orders'),
  generateReceiptPreview: (orderData: any, options?: { paperWidth?: number; margin?: number; contentWidthMm?: number; receiptType?: 'full' | 'kitchen'; layout?: any }) =>
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
  updateUserSessionToken: (token: string) => ipcRenderer.invoke('update-user-session-token', token),
  clearUserSession: () => ipcRenderer.invoke('clear-user-session'),
  loadPrinterConfigs: () => ipcRenderer.invoke('load-printer-configs'),
  savePrinterConfigs: (configs: Record<string, any>) =>
    ipcRenderer.invoke('save-printer-configs', configs),
  getDefaultPrintTemplate: () => ipcRenderer.invoke('get-default-print-template'),
  setDefaultPrintTemplate: (template: any) => ipcRenderer.invoke('set-default-print-template', template),
  getPrintTemplatesMap: () => ipcRenderer.invoke('get-print-templates-map'),
  setPrintTemplateForPrinter: (printerName: string, template: any, receiptType?: 'full' | 'kitchen') =>
    ipcRenderer.invoke('set-print-template-for-printer', printerName, template, receiptType),
  getReceiptNumberSettings: () => ipcRenderer.invoke('get-receipt-number-settings'),
  saveReceiptNumberSettings: (settings: any) =>
    ipcRenderer.invoke('save-receipt-number-settings', settings),
  getReceiptPriceDisplayUnit: () => ipcRenderer.invoke('get-receipt-price-display-unit'),
  saveReceiptPriceDisplayUnit: (unit: 'toman' | 'rial') =>
    ipcRenderer.invoke('save-receipt-price-display-unit', unit),
  getCardTerminalSettings: () => ipcRenderer.invoke('get-card-terminal-settings'),
  saveCardTerminalSettings: (settings: any) =>
    ipcRenderer.invoke('save-card-terminal-settings', settings),
  getCardTerminalConfig: () => ipcRenderer.invoke('get-card-terminal-config'),
  saveCardTerminalConfig: (config: any) => ipcRenderer.invoke('save-card-terminal-config', config),
  testCardTerminalConnection: (payload: { amount?: number; restaurantId?: number; orderId?: number; terminalProfileId?: string }) =>
    ipcRenderer.invoke('test-card-terminal-connection', payload),
  sendAmountToCardTerminal: (payload: { amount: number; orderId?: number; restaurantId?: number; terminalProfileId?: string }) =>
    ipcRenderer.invoke('send-amount-to-card-terminal', payload),
  getReceiptNumbersMap: () => ipcRenderer.invoke('get-receipt-numbers-map'),
  assignReceiptNumberForOrder: (orderKeys: string[]) =>
    ipcRenderer.invoke('assign-receipt-number-for-order', orderKeys),
  cacheImage: (imageUrl: string) => ipcRenderer.invoke('cache-image', imageUrl),
  getCachedImage: (imageUrl: string) => ipcRenderer.invoke('get-cached-image', imageUrl),
  cacheImages: (imageUrls: string[]) => ipcRenderer.invoke('cache-images', imageUrls),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  startUpdateDownload: () => ipcRenderer.invoke('start-update-download'),
  quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
  getDataDir: () => ipcRenderer.invoke('get-data-dir'),
  scaleListPorts: () => ipcRenderer.invoke('scale:list-ports'),
  scaleLoadSettings: () => ipcRenderer.invoke('scale:load-settings'),
  scaleSaveSettings: (settings: any) => ipcRenderer.invoke('scale:save-settings', settings),
  scaleConnect: (settings: any) => ipcRenderer.invoke('scale:connect', settings),
  scaleDisconnect: () => ipcRenderer.invoke('scale:disconnect'),
  scaleStatus: () => ipcRenderer.invoke('scale:status'),
  scaleReadWeight: () => ipcRenderer.invoke('scale:read-weight'),
  scaleRequestWeight: () => ipcRenderer.invoke('scale:request-weight'),
  scaleClearWeight: () => ipcRenderer.invoke('scale:clear-weight'),
  onScaleWeightUpdate: (callback: (weight: number) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, weight: number) => callback(weight);
    ipcRenderer.on('scale:weight-update', handler);
    return () => ipcRenderer.removeListener('scale:weight-update', handler);
  },
  onUpdateAvailable: (callback: (info: { version: string }) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, info: { version: string }) => callback(info);
    ipcRenderer.on('update-available', handler);
    return () => ipcRenderer.removeListener('update-available', handler);
  },
  onUpdateNotAvailable: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('update-not-available', handler);
    return () => ipcRenderer.removeListener('update-not-available', handler);
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
  getCallerIdSettings: () => ipcRenderer.invoke('caller-id:get-settings'),
  saveCallerIdSettings: (settings: any) => ipcRenderer.invoke('caller-id:save-settings', settings),
  getCallerIdWebhookStatus: () => ipcRenderer.invoke('caller-id:webhook-status'),
  getPosWarehouseId: () => ipcRenderer.invoke('pos:get-warehouse-id'),
  savePosWarehouseId: (id: number | null) => ipcRenderer.invoke('pos:save-warehouse-id', id),
  callerIdSerialListPorts: () => ipcRenderer.invoke('caller-id:serial-list-ports'),
  callerIdSerialConnect: (settings: any) => ipcRenderer.invoke('caller-id:serial-connect', settings),
  callerIdSerialDisconnect: () => ipcRenderer.invoke('caller-id:serial-disconnect'),
  callerIdSerialStatus: () => ipcRenderer.invoke('caller-id:serial-status'),
  callerIdHidListDevices: () => ipcRenderer.invoke('caller-id:hid-list-devices'),
  callerIdHidConnect: () => ipcRenderer.invoke('caller-id:hid-connect'),
  callerIdHidDisconnect: () => ipcRenderer.invoke('caller-id:hid-disconnect'),
  callerIdHidStatus: () => ipcRenderer.invoke('caller-id:hid-status'),
  onIncomingCall: (callback: (payload: { phone: string; timestamp: string }) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, payload: { phone: string; timestamp: string }) =>
      callback(payload);
    ipcRenderer.on('caller-id:incoming-call', handler);
    return () => ipcRenderer.removeListener('caller-id:incoming-call', handler);
  },
  onDeepLinkOpenOrder: (callback: (url: string) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, url: string) => callback(url);
    ipcRenderer.on('deep-link-open-order', handler);
    return () => ipcRenderer.removeListener('deep-link-open-order', handler);
  },
  onCallEnded: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('caller-id:call-ended', handler);
    return () => ipcRenderer.removeListener('caller-id:call-ended', handler);
  },
  callerIdLoadHistory: () => ipcRenderer.invoke('caller-id:load-history'),
  callerIdSaveHistory: (history: any[]) => ipcRenderer.invoke('caller-id:save-history', history),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Single source of truth for the renderer's ambient `window.electronAPI` type
// (see src/vite-env.d.ts). Keeping the object above unnamed-inline previously
// forced src/vite-env.d.ts to hand-maintain a parallel, drifting copy of this
// shape; exporting the real inferred type lets the two stay in sync.
export type ElectronAPI = typeof electronAPI;

