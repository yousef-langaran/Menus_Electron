import { contextBridge, ipcRenderer } from 'electron';

// نسخه‌ی برنامه را به‌صورت sync همان ابتدای بارگذاری می‌گیریم تا هدر نسخه
// روی نخستین درخواست شبکه هم حاضر باشد (جلوگیری از تشخیص اشتباهِ «قدیمی»).
let APP_VERSION = '';
try {
  APP_VERSION = String(ipcRenderer.sendSync('app:get-version-sync') || '');
} catch {
  APP_VERSION = '';
}

contextBridge.exposeInMainWorld('electronAPI', {
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
  setPrintTemplateForPrinter: (printerName: string, template: any) =>
    ipcRenderer.invoke('set-print-template-for-printer', printerName, template),
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
});

declare global {
  type ElectronPrintErrorCode =
    | 'PRINT_NO_PRINTER_SELECTED'
    | 'PRINT_PRINTER_DISCOVERY_FAILED'
    | 'PRINT_PRINTER_NOT_FOUND'
    | 'PRINT_PRINTER_OFFLINE'
    | 'PRINT_JOB_DROPPED'
    | 'PRINT_JOB_FAILED'
    | 'PRINT_UNKNOWN_ERROR';
  type ElectronPrintReceiptType = 'full' | 'kitchen';
  type ElectronPrintFailureDetail = {
    printerName: string;
    receiptType: ElectronPrintReceiptType;
    code: ElectronPrintErrorCode;
  };
  type ElectronPrintResult =
    | { status: 'PRINT_OK'; receiptNumber: number }
    | { status: 'PRINT_ERROR'; code: ElectronPrintErrorCode; details: ElectronPrintFailureDetail[]; receiptNumber: 0 };
  type ElectronPrinterStatusCode = 'PRINTER_READY' | 'PRINTER_OFFLINE';

  interface Window {
    electronAPI: {
      appVersion: string;
      getApiConfig: () => Promise<{ baseURL: string; token?: string; restaurantName?: string; restaurantId?: number }>;
      getAppVersion: () => Promise<string>;
      checkOnline: () => Promise<boolean>;
      openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
      syncOrders: (token?: string) => Promise<{ success: number; failed: number; errors: string[] }>;
      syncReturns: (token?: string) => Promise<{ success: number; failed: number; errors: string[] }>;
      saveOfflineReturn: (
        returnData: any,
        token: string,
        baseURL?: string
      ) => Promise<{ success: boolean; returnId?: number; error?: string }>;
      getOfflineReturns: () => Promise<any[]>;
      printReceipt: (orderData: any, printerJobs: any[], orderKeys?: string | string[]) => Promise<ElectronPrintResult>;
      getPrinters: () => Promise<Array<{ name: string; displayName: string; description: string; statusCode: ElectronPrinterStatusCode }>>;
      showMessageBox: (options: any) => Promise<any>;
      saveOfflineOrder: (
        orderData: any,
        token: string,
        baseURL?: string
      ) => Promise<{ success: boolean; orderId?: number; error?: string }>;
      getOfflineOrders: () => Promise<any[]>;
      generateReceiptPreview: (
        orderData: any,
        options?: { paperWidth?: number; margin?: number; contentWidthMm?: number; receiptType?: 'full' | 'kitchen'; layout?: any }
      ) => Promise<{ success: boolean; html?: string; imageDataUrl?: string; error?: string }>;
      loadUserSession: () => Promise<{ user: any; token: string; cachedAt: string } | null>;
      saveUserSession: (data: { user: any; token: string }) => Promise<{ success: boolean; error?: string }>;
      updateUserSessionToken: (token: string) => Promise<{ success: boolean; error?: string }>;
      clearUserSession: () => Promise<{ success: boolean; error?: string }>;
      loadPrinterConfigs: () => Promise<Record<string, any>>;
      savePrinterConfigs: (configs: Record<string, any>) => Promise<{ success: boolean; error?: string }>;
      getReceiptNumberSettings: () => Promise<{ nextNumber: number; resetPolicy: string; startNumber: number; lastResetDate: string; dailyResetTime: string }>;
      saveReceiptNumberSettings: (settings: any) => Promise<{ success: boolean; error?: string }>;
      getReceiptPriceDisplayUnit: () => Promise<'toman' | 'rial'>;
      saveReceiptPriceDisplayUnit: (unit: 'toman' | 'rial') => Promise<{ success: boolean; error?: string }>;
      getCardTerminalSettings: () => Promise<any>;
      saveCardTerminalSettings: (settings: any) => Promise<{ success: boolean; error?: string; settings?: any }>;
      getCardTerminalConfig: () => Promise<{ profiles: any[]; defaultProfileId: string | null }>;
      saveCardTerminalConfig: (config: any) => Promise<{ success: boolean; error?: string; config?: any }>;
      testCardTerminalConnection: (
        payload: { amount?: number; restaurantId?: number; orderId?: number; terminalProfileId?: string }
      ) => Promise<{ success: boolean; error?: string; refId?: string; message?: string }>;
      sendAmountToCardTerminal: (payload: { amount: number; orderId?: number; restaurantId?: number; terminalProfileId?: string }) => Promise<{ success: boolean; error?: string; refId?: string }>;
      getReceiptNumbersMap: () => Promise<Record<string, number>>;
      assignReceiptNumberForOrder: (orderKeys: string[]) => Promise<number>;
      cacheImage: (imageUrl: string) => Promise<{ success: boolean; url?: string; error?: string }>;
      getCachedImage: (imageUrl: string) => Promise<{ success: boolean; url: string }>;
      cacheImages: (imageUrls: string[]) => Promise<{ success: boolean; urls?: Record<string, string>; error?: string }>;
      onOnlineStatusChange: (callback: (isOnline: boolean) => void) => void | (() => void);
      checkForUpdates: () => Promise<
        | { ok: true }
        | { ok: false; skipped?: boolean; message: string }
      >;
      startUpdateDownload: () => Promise<void>;
      quitAndInstall: () => Promise<void>;
      onUpdateAvailable: (callback: (info: { version: string }) => void) => () => void;
      onUpdateNotAvailable: (callback: () => void) => () => void;
      onUpdateDownloaded: (callback: () => void) => () => void;
      onUpdateError: (callback: (message: string) => void) => () => void;
      getDataDir: () => Promise<{ userData: string; files: Record<string, string> }>;
      scaleListPorts: () => Promise<Array<{ path: string; manufacturer?: string; friendlyName?: string }>>;
      scaleLoadSettings: () => Promise<{ connectionType: 'serial' | 'tcp'; portName: string; baudRate: number; host: string; tcpPort: number } | null>;
      scaleSaveSettings: (settings: any) => Promise<{ success: boolean; settings?: any; error?: string }>;
      scaleConnect: (settings: any) => Promise<{ success: boolean; error?: string }>;
      scaleDisconnect: () => Promise<{ success: boolean; error?: string }>;
      scaleStatus: () => Promise<{ connected: boolean; latestWeight: number | null }>;
      scaleReadWeight: () => Promise<{ success: boolean; weight?: number; error?: string }>;
      scaleRequestWeight: () => Promise<{ success: boolean }>;
      scaleClearWeight: () => Promise<{ success: boolean }>;
      onScaleWeightUpdate: (callback: (weight: number) => void) => () => void;
      getCallerIdSettings: () => Promise<any>;
      saveCallerIdSettings: (settings: any) => Promise<{ success: boolean; settings?: any; error?: string }>;
      getCallerIdWebhookStatus: () => Promise<{ running: boolean; port: number | null }>;
      callerIdSerialListPorts: () => Promise<Array<{ path: string; manufacturer?: string; friendlyName?: string; pnpId?: string }>>;
      callerIdSerialConnect: (settings: any) => Promise<{ success: boolean; error?: string }>;
      callerIdSerialDisconnect: () => Promise<{ success: boolean; error?: string }>;
      callerIdSerialStatus: () => Promise<{ connected: boolean }>;
      callerIdHidListDevices: () => Promise<Array<{ vendorId: number; productId: number; manufacturer?: string; product?: string }>>;
      callerIdHidConnect: () => Promise<{ success: boolean; error?: string }>;
      callerIdHidDisconnect: () => Promise<{ success: boolean; error?: string }>;
      callerIdHidStatus: () => Promise<{ connected: boolean }>;
      onIncomingCall: (callback: (payload: { phone: string; timestamp: string }) => void) => () => void;
      onDeepLinkOpenOrder: (callback: (url: string) => void) => () => void;
      onCallEnded: (callback: () => void) => () => void;
      callerIdLoadHistory: () => Promise<any[]>;
      callerIdSaveHistory: (history: any[]) => Promise<{ success: boolean; error?: string }>;
      getPosWarehouseId: () => Promise<number | null>;
      savePosWarehouseId: (id: number | null) => Promise<{ success: boolean; error?: string }>;
    };
  }
}

